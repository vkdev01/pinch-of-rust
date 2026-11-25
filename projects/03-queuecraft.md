---
summary: A durable job queue on Postgres — SKIP LOCKED, exponential backoff, idempotency, and a reaper for crashed workers.
level: Advanced
time: 12–16 h
tags: [async, postgres, reliability]
---

# queuecraft — jobs that survive a crash

Every "just use a channel" queue loses work the moment the process dies. This
project builds the real thing: a durable queue with at-least-once delivery,
idempotent handlers, retries with backoff and a reaper that rescues jobs from dead
workers.

**What it is:** a library plus a worker binary. `enqueue(&pool, job)` inside a
transaction; `Worker::run()` claims with `FOR UPDATE SKIP LOCKED`.

## What you learn

| Skill | Where it comes from |
| --- | --- |
| Transactional correctness | enqueue-in-same-transaction, no dual writes |
| Concurrent SQL | `FOR UPDATE SKIP LOCKED`, index-only claim |
| Failure design | retries, poison messages, dead-letter, idempotency |
| Observability | per-job spans, queue depth metric, stuck-queue alert |
| Graceful shutdown | finish in-flight, release locks, drain |

## Milestones

| # | Ship | Done when |
| --- | --- | --- |
| 1 | Table + claim | two workers never take the same row |
| 2 | Complete / fail | failures retry with growing delay |
| 3 | Idempotency | running the same job twice changes state once |
| 4 | Reaper | a killed worker's jobs return to `pending` |
| 5 | Metrics | depth, age of oldest pending, failure rate |
| 6 | Shutdown | SIGTERM finishes the current job, then exits |

## The claim query

```sql
UPDATE jobs SET
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
RETURNING id, kind, payload, attempts;
```

`SKIP LOCKED` is the whole trick: a second worker does not block, it moves on to
the next row. Without it, every worker serialises behind the first.

## The worker loop, with shutdown

```rust
use tokio::sync::watch;
use tracing::Instrument;

pub async fn run(pool: PgPool, mut shutdown: watch::Receiver<bool>) -> anyhow::Result<()> {
    let worker_id = format!("w-{}", std::process::id());

    loop {
        if *shutdown.borrow() {
            tracing::info!("shutting down after current job");
            break;
        }

        let jobs = claim(&pool, &worker_id, 8).await?;
        if jobs.is_empty() {
            tokio::select! {
                _ = tokio::time::sleep(std::time::Duration::from_millis(500)) => {}
                _ = shutdown.changed() => {}
            }
            continue;
        }

        for job in jobs {
            let span = tracing::info_span!("job", id = job.id, kind = %job.kind, attempt = job.attempts);
            match handle(&job, &pool).instrument(span.clone()).await {
                Ok(()) => complete(&pool, job.id).await?,
                Err(e) => {
                    tracing::error!(parent: &span, error = %e, "job failed");
                    fail(&pool, job.id, &e.to_string(), job.attempts).await?;
                }
            }
        }
    }
    Ok(())
}
```

> **Gotcha:** checking `shutdown.borrow()` only at the top of the loop means a
> 10-minute job delays the exit. Cap it with `tokio::time::timeout` around the
> handler and treat a timeout as a retryable failure — or set
> `terminationGracePeriodSeconds` above your longest job.

## Backoff that does not hammer the database

```rust
pub async fn fail(pool: &PgPool, id: i64, err: &str, attempts: i32) -> sqlx::Result<()> {
    if attempts >= 5 {
        sqlx::query("UPDATE jobs SET status='failed', last_error=$2, locked_at=NULL WHERE id=$1")
            .bind(id).bind(err).execute(pool).await?;
        return Ok(());
    }
    // 2^attempts seconds, capped at an hour
    let delay = (1i64 << attempts.min(12)).min(3600);
    sqlx::query(
        r#"UPDATE jobs SET status='pending', last_error=$2, locked_at=NULL, locked_by=NULL,
                 run_at = now() + make_interval(secs => $3)
           WHERE id = $1"#,
    )
    .bind(id).bind(err).bind(delay as f64).execute(pool).await?;
    Ok(())
}
```

Jitter matters. Without it, 500 jobs that failed at the same instant retry at the
same instant. Add `+ (random() * 0.2 * $3)` to the interval.

## Idempotency, the part people skip

```rust
// exactly-once *effect* on top of at-least-once *delivery*
let inserted = sqlx::query(
    "INSERT INTO job_effects (job_key, effect) VALUES ($1, $2) ON CONFLICT DO NOTHING",
)
.bind(&job.key)
.bind("welcome_email_sent")
.execute(&pool)
.await?
.rows_affected();

if inserted == 0 {
    tracing::info!(job = job.id, "effect already applied, skipping");
    return Ok(());
}
send_welcome_email(&job).await
```

## Enqueue inside the business transaction

This is why a Postgres queue beats Redis for a small team: the job and the row it
refers to commit together, so there is no window where one exists without the
other.

```rust
let mut tx = pool.begin().await?;
let order_id: i64 = sqlx::query_scalar("INSERT INTO orders (total) VALUES ($1) RETURNING id")
    .bind(total).fetch_one(&mut *tx).await?;
sqlx::query("INSERT INTO jobs (kind, payload, job_key) VALUES ('send_receipt', $1, $2)")
    .bind(serde_json::json!({ "order_id": order_id }))
    .bind(format!("receipt:{order_id}"))
    .execute(&mut *tx).await?;
tx.commit().await?;
```

## Metrics that catch the real failure

```rust
metrics::gauge!("queue_depth").set(pending as f64);
metrics::gauge!("queue_oldest_age_seconds").set(age_secs);
metrics::counter!("jobs_failed_total", "kind" => kind.clone()).increment(1);
metrics::histogram!("job_duration_seconds", "kind" => kind).record(elapsed);
```

Alert on **oldest age**, not depth. A queue with 10,000 tiny jobs is healthy; a
queue with 3 jobs that are 40 minutes old is on fire.

## Stretch goals

- Priority queues: `ORDER BY priority DESC, run_at`.
- Delayed jobs with a scheduler table.
- A dead-letter dashboard page.
- Batch handlers: claim 100 rows, one transaction.
- Swap the backend behind a `Queue` trait and add an SQS implementation.

## Demo checklist

- [ ] kill -9 a worker mid-job; the reaper returns its jobs
- [ ] the same job key run twice produces one effect
- [ ] SIGTERM exits cleanly with the current job completed
- [ ] a graph of queue depth during a 10k-job burst
