# 04 · Concurrency architecture

Choosing a concurrency model is an architecture decision: it decides how failures
propagate, how you scale, and what you can test. Three models cover everything.

## The three models

| Model | State lives in | Failure mode | Scales by |
| --- | --- | --- | --- |
| shared state + locks | one place, guarded | deadlock, contention | more cores |
| actors / tasks + channels | one owner per task | mailbox overflow, stuck task | more tasks |
| request-scoped (stateless) | nowhere | timeout | more replicas |

> **Rule of thumb:** stateless request handling, channels between stages, locks only
> inside a single component.

## Model 1: shared state, kept small

```rust
#[derive(Clone)]
pub struct AppState {
    pub pool: sqlx::PgPool,                       // already internally shared
    pub cache: Arc<RwLock<LruCache>>,             // one guarded component
    pub started: std::time::Instant,              // immutable
}
```

The failure mode to design out: a lock held across `.await`.

```rust
// WRONG — the guard lives across the await, so every other request waits on the network
let mut g = state.cache.write().await;
let value = fetch(&state.pool, key).await?;
g.insert(key, value.clone());

// RIGHT — lock, copy, drop, work, lock again
if let Some(v) = state.cache.read().await.get(&key).cloned() { return Ok(v); }
let value = fetch(&state.pool, key).await?;
state.cache.write().await.insert(key, value.clone());
```

## Model 2: actors — one owner per piece of state

```rust
enum Cmd {
    Increment { by: u64, reply: tokio::sync::oneshot::Sender<u64> },
    Snapshot { reply: tokio::sync::oneshot::Sender<u64> },
}

async fn counter_actor(mut rx: tokio::sync::mpsc::Receiver<Cmd>) {
    let mut total = 0u64;
    while let Some(cmd) = rx.recv().await {
        match cmd {
            Cmd::Increment { by, reply } => { total += by; let _ = reply.send(total); }
            Cmd::Snapshot { reply } => { let _ = reply.send(total); }
        }
    }
}
```

No locks at all. The state is owned by one task; concurrency is message ordering.
Costs: every interaction is a round trip, and a slow actor becomes a queue. Benefits:
no deadlocks, trivially serialisable, and the actor's state is a plain local variable.

Use it for caches with eviction, connection registries, and anything where the
invariant spans several fields.

## Model 3: request-scoped — the default for web services

```rust
async fn handler(State(st): State<AppState>, Json(req): Json<Req>) -> Result<Json<Resp>, ApiError> {
    // no mutable global state; everything the request needs is passed in
    let user = st.repo.find(req.user_id).await?;
    Ok(Json(Resp { user }))
}
```

Scale by adding replicas. State lives in Postgres or Redis, never in the process.
This is the model that lets you run a rolling deploy without thinking about it.

## Supervision: what happens when a task dies

```rust
// a panicking spawned task is silent — the JoinHandle is dropped
tokio::spawn(async { panic!("boom"); });        // nobody notices

// supervise instead: restart, or fail loudly
async fn supervise<F, Fut>(name: &'static str, mut f: F)
where F: FnMut() -> Fut, Fut: std::future::Future<Output = ()> + Send + 'static {
    loop {
        let handle = tokio::spawn(f());
        match handle.await {
            Ok(()) => { tracing::warn!(task = name, "task exited"); return; }
            Err(e) if e.is_panic() => {
                tracing::error!(task = name, "task panicked, restarting in 1s");
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
            Err(_) => return,                    // cancelled
        }
    }
}
```

Every long-lived task needs an owner that notices it stopped.

## Cancellation and shutdown

```rust
let (tx, rx) = tokio::sync::watch::channel(false);

tokio::spawn(async move {
    let mut rx = rx;
    loop {
        tokio::select! {
            _ = rx.changed() => break,          // shutdown requested
            job = next_job() => process(job).await,
        }
    }
    tracing::info!("worker drained");
});
```

Two rules:

1. **Cancellation is drop.** A future dropped mid-`await` may leave partial work.
   Make the operation idempotent, or spawn it so it is not cancelled.
2. **Drain before exit.** Graceful shutdown means: stop accepting, finish in-flight,
   then exit. `axum::serve(...).with_graceful_shutdown(...)` does the first two.

## Backpressure is the architecture

```rust
// unbounded: a slow consumer becomes an OOM
let (tx, rx) = tokio::sync::mpsc::unbounded_channel();

// bounded: the producer waits, which is the correct behaviour
let (tx, rx) = tokio::sync::mpsc::channel(1_000);
```

Choose the depth deliberately: it is the burst you accept before the producer slows
down. Depth × item size is memory you have committed to.

## Where the CPU work goes

```text
HTTP handler (async, fast)
   └─ spawn_blocking / rayon pool (CPU, slow)
        └─ result back through a oneshot channel
```

Never run a 200 ms computation on a tokio worker. One blocked worker stalls every
task scheduled on it, which is why a single synchronous `std::fs::read` in a handler
looks like a global outage.

## A decision table

| Situation | Model |
| --- | --- |
| CRUD API | stateless + pool |
| in-memory cache with eviction | actor or `RwLock` |
| CPU-heavy endpoint | `spawn_blocking` / rayon |
| background jobs | bounded queue + supervised workers |
| fan-out to 50 services | `buffer_unordered(n)` |
| single-writer invariant | actor |
| counters and metrics | atomics |

## Exercises

1. Convert a `Mutex<HashMap>` cache to an actor and remove the lock entirely.
2. Add supervision to a background task and prove it restarts after a panic.
3. Add a bounded channel between two stages and measure the point where the producer
   starts waiting.

**Next:** [System design case studies](05-system-design.md)
