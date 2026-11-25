# 04 · Background Jobs and Queues

Anything that takes longer than a request should not happen inside the request.
This module covers the four ways to run work in the background in Rust, from a
spawned task to a durable queue.

## The four options

| Approach | Durability | Complexity | Use when |
| --- | --- | --- | --- |
| `tokio::spawn` | none — lost on restart | trivial | fire-and-forget, e.g. cache warm |
| In-process channel + worker | none | low | burst smoothing, low value |
| Postgres table + `SKIP LOCKED` | full | low | you already have Postgres |
| Redis / SQS / RabbitMQ | full | medium | high volume, cross-language |

> **Rule of thumb:** start with `tokio::spawn`. Move to a Postgres queue the day
> losing a job would cost money. Do not add Redis on day one.

## Option 1: `tokio::spawn`

```rust
async fn handle_signup(State(state): State<AppState>, Json(body): Json<Signup>) -> StatusCode {
    let user = state.users.create(body.email).await.unwrap();

    // do not await — the response goes out immediately
    let mailer = state.mailer.clone();
    tokio::spawn(async move {
        if let Err(e) = mailer.send_welcome(&user.email).await {
            tracing::warn!(error = %e, "welcome email failed");
        }
    });

    StatusCode::CREATED
}
```

Two things to be careful about:

- **A panicking task is silent.** The `JoinHandle` is dropped, so nothing
  observes the panic. Log inside the task.
- **An aborted process loses the work.** If the pod restarts mid-email, the email
  never happens.

For a small number of known-at-startup tasks, keep the handles and supervise
them:

```rust
let mut handles = Vec::new();
for i in 0..4 {
    handles.push(tokio::spawn(worker(i, state.clone())));
}

// if any worker dies, restart it (or fail loudly)
for h in handles {
    if let Err(e) = h.await {
        tracing::error!(error = ?e, "worker crashed");
    }
}
```

## Option 2: bounded channel + worker pool

```rust
use tokio::sync::mpsc;

#[derive(Debug)]
enum Job {
    SendEmail { to: String },
    Reindex { id: i64 },
}

pub struct Queue { tx: mpsc::Sender<Job> }

impl Queue {
    pub fn new(capacity: usize) -> (Self, mpsc::Receiver<Job>) {
        let (tx, rx) = mpsc::channel(capacity);
        (Queue { tx }, rx)
    }

    pub async fn submit(&self, job: Job) -> anyhow::Result<()> {
        self.tx.send(job).await?;      // awaits when full → backpressure
        Ok(())
    }
}

pub async fn run_workers(mut rx: mpsc::Receiver<Job>, n: usize, state: AppState) {
    let rx = std::sync::Arc::new(tokio::sync::Mutex::new(rx));
    for i in 0..n {
        let rx = rx.clone();
        let state = state.clone();
        tokio::spawn(async move {
            loop {
                let job = { rx.lock().await.recv().await };
                let Some(job) = job else { break };
                if let Err(e) = process(job, &state).await {
                    tracing::error!(worker = i, error = %e, "job failed");
                }
            }
        });
    }
}
```

A bounded channel gives you **backpressure**: when workers are saturated,
`submit` awaits instead of growing memory without limit. That is the whole point
of `mpsc::channel(1000)` rather than `unbounded_channel()`.

## Option 3: a Postgres-backed queue (the workhorse)

One table, one index, `FOR UPDATE SKIP LOCKED`. No extra infrastructure.

```sql
CREATE TABLE jobs (
    id          BIGSERIAL PRIMARY KEY,
    kind        TEXT NOT NULL,
    payload     JSONB NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',   -- pending|running|done|failed
    attempts    INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    run_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_at   TIMESTAMPTZ,
    locked_by   TEXT,
    last_error  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_jobs_pending ON jobs (run_at) WHERE status = 'pending';
```

### Enqueue

```rust
pub async fn enqueue(pool: &PgPool, kind: &str, payload: serde_json::Value) -> sqlx::Result<i64> {
    sqlx::query_scalar(
        "INSERT INTO jobs (kind, payload) VALUES ($1, $2) RETURNING id",
    )
    .bind(kind)
    .bind(payload)
    .fetch_one(pool)
    .await
}
```

Because it is a normal table, enqueuing can happen **inside the same transaction**
as the business write. That is the killer feature: the job and the row it refers
to commit or roll back together. No dual-write problem.

```rust
let mut tx = pool.begin().await?;
let user_id: i64 = sqlx::query_scalar("INSERT INTO users (email) VALUES ($1) RETURNING id")
    .bind(&email).fetch_one(&mut *tx).await?;
sqlx::query("INSERT INTO jobs (kind, payload) VALUES ('send_welcome', $1)")
    .bind(serde_json::json!({ "user_id": user_id }))
    .execute(&mut *tx).await?;
tx.commit().await?;
```

[[fig:queue-lifecycle]]

### Claim

```rust
#[derive(Debug, sqlx::FromRow)]
pub struct ClaimedJob {
    pub id: i64,
    pub kind: String,
    pub payload: serde_json::Value,
    pub attempts: i32,
}

pub async fn claim(pool: &PgPool, worker: &str, limit: i64) -> sqlx::Result<Vec<ClaimedJob>> {
    sqlx::query_as::<_, ClaimedJob>(
        r#"UPDATE jobs SET
             status = 'running',
             attempts = attempts + 1,
             locked_at = now(),
             locked_by = $1
           WHERE id IN (
             SELECT id FROM jobs
             WHERE status = 'pending' AND run_at <= now()
             ORDER BY run_at
             FOR UPDATE SKIP LOCKED
             LIMIT $2
           )
           RETURNING id, kind, payload, attempts"#,
    )
    .bind(worker)
    .bind(limit)
    .fetch_all(pool)
    .await
}
```

`FOR UPDATE SKIP LOCKED` means N workers never claim the same row and never block
each other. This is the entire trick.

### Complete / fail

```rust
pub async fn complete(pool: &PgPool, id: i64) -> sqlx::Result<()> {
    sqlx::query("UPDATE jobs SET status = 'done', locked_at = NULL WHERE id = $1")
        .bind(id).execute(pool).await?;
    Ok(())
}

pub async fn fail(pool: &PgPool, id: i64, err: &str, attempts: i32, max: i32) -> sqlx::Result<()> {
    if attempts >= max {
        sqlx::query("UPDATE jobs SET status = 'failed', last_error = $2 WHERE id = $1")
            .bind(id).bind(err).execute(pool).await?;
    } else {
        // exponential backoff: 2^attempts seconds, capped at 1 hour
        let delay = (1i64 << attempts.min(12)).min(3600);
        sqlx::query(
            r#"UPDATE jobs SET status = 'pending', last_error = $2,
                 run_at = now() + make_interval(secs => $3),
                 locked_at = NULL, locked_by = NULL
               WHERE id = $1"#,
        )
        .bind(id).bind(err).bind(delay as f64)
        .execute(pool).await?;
    }
    Ok(())
}
```

### The worker loop

```rust
pub async fn run(pool: PgPool, worker: String) {
    let mut tick = tokio::time::interval(std::time::Duration::from_secs(1));
    loop {
        tick.tick().await;
        let jobs = match claim(&pool, &worker, 10).await {
            Ok(j) => j,
            Err(e) => { tracing::error!(error = %e, "claim failed"); continue; }
        };
        if jobs.is_empty() { continue; }

        for job in jobs {
            let span = tracing::info_span!("job", id = job.id, kind = %job.kind);
            let result = handle(&job, &pool).instrument(span).await;
            match result {
                Ok(()) => { let _ = complete(&pool, job.id).await; }
                Err(e) => {
                    tracing::error!(id = job.id, error = %e, "job failed");
                    let _ = fail(&pool, job.id, &e.to_string(), job.attempts, 5).await;
                }
            }
        }
    }
}
```

### Reclaiming stuck jobs

A worker that dies mid-job leaves a row in `running` forever. Add a reaper:

```rust
pub async fn reap(pool: &PgPool, stale_after_secs: i64) -> sqlx::Result<u64> {
    let res = sqlx::query(
        r#"UPDATE jobs SET status = 'pending', locked_at = NULL, locked_by = NULL
           WHERE status = 'running' AND locked_at < now() - make_interval(secs => $1)"#,
    )
    .bind(stale_after_secs as f64)
    .execute(pool)
    .await?;
    Ok(res.rows_affected())
}
```

Run it from the same worker loop every 60 s with `stale_after_secs = 300`. Without
this, one crashed pod silently stops processing a subset of your jobs.

> **Gotcha:** the reaper can resurrect a job that is genuinely still running
> (a long task, not a dead worker). Either set `stale_after` above your longest
> job, or have handlers be **idempotent**. Idempotency is the real answer.

[[fig:queue-depth]]

## Idempotency

Every handler should tolerate running twice:

```rust
async fn handle_send_welcome(payload: &serde_json::Value, pool: &PgPool) -> anyhow::Result<()> {
    let user_id = payload["user_id"].as_i64().ok_or_else(|| anyhow::anyhow!("bad payload"))?;

    // claim the effect exactly once
    let inserted = sqlx::query(
        "INSERT INTO sent_emails (user_id, kind) VALUES ($1, 'welcome')
         ON CONFLICT DO NOTHING",
    )
    .bind(user_id)
    .execute(pool)
    .await?
    .rows_affected();

    if inserted == 0 {
        tracing::info!(user_id, "welcome already sent, skipping");
        return Ok(());
    }

    send_email(user_id).await
}
```

A unique constraint plus `ON CONFLICT DO NOTHING` gives you exactly-once
*semantics* on top of at-least-once *delivery*. This pattern works for emails,
webhooks, invoices and payments.

## Scheduling: cron in Rust

```toml
tokio-cron-scheduler = "0.13"
```

```rust
use tokio_cron_scheduler::{Job, JobScheduler};

let sched = JobScheduler::new().await?;
sched.add(Job::new_async("0 0 * * * *", |_uuid, _l| Box::pin(async {
    tracing::info!("hourly task");
}))?).await?;
sched.start().await?;
```

For a single-replica scheduler this is fine. With multiple replicas, every pod
runs it — use a Postgres advisory lock to elect one:

```rust
let acquired: bool = sqlx::query_scalar("SELECT pg_try_advisory_lock(12345)")
    .fetch_one(pool).await?;
if !acquired { return; }   // someone else is running it
```

## Observability for jobs

Emit these four metrics per queue (module 03.06):

```rust
metrics::gauge!("jobs_pending").set(pending as f64);
metrics::gauge!("jobs_running").set(running as f64);
metrics::counter!("jobs_completed_total", "kind" => kind.clone()).increment(1);
metrics::histogram!("job_duration_seconds", "kind" => kind).record(elapsed);
```

Alert on `jobs_pending` growing monotonically for 10 minutes — that is the
signature of a stuck consumer, and it is invisible without a metric.

---

## Exercises

1. Implement the Postgres queue: schema, `enqueue`, `claim`, `complete`, `fail`.
2. Run three worker processes concurrently and prove no job is processed twice
   (count rows in a `processed` table).
3. Add exponential backoff and verify `run_at` increases on repeated failures.
4. Write the reaper and test it by inserting a `running` job with an old
   `locked_at`.
5. Make the welcome-email handler idempotent with a unique constraint.
6. Add a `/admin/jobs` endpoint returning counts by status.

**Next:** [WebAssembly in the browser](05-wasm.md)
