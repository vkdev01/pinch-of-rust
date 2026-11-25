# 11 · Async / Await

Async Rust is the part most people bounce off. The core idea is small; the
ecosystem around it is large. This module builds the mental model first, then
shows the patterns you will actually write.

## The mental model

An `async fn` returns a **future**: a value representing work that has not
happened yet. A future does nothing until something **polls** it. A runtime
(tokio, async-std, smol) drives the polling.

```rust
async fn fetch() -> String {
    "data".to_string()
}

fn main() {
    let fut = fetch();     // NOTHING has run yet
    // fut is dropped here; fetch() never executed
}
```

Compare with threads: spawning a thread starts it. Calling an async fn starts
nothing. That difference is why you must `.await` or hand the future to a
runtime.

### `Future` is a trait

```rust
trait Future {
    type Output;
    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output>;
}

enum Poll<T> { Ready(T), Pending }
```

`poll` returns `Ready(value)` when done, `Pending` when it is waiting. The
runtime registers a waker and sleeps the thread until something is ready. That
is how one thread handles thousands of connections: it is never *blocked*, it is
only ever *waiting*.

> **Rule of thumb:** `async` is about **waiting**, not about **speed**. CPU work
> in an async task blocks the executor and starves every other task on that
> thread. Use `tokio::task::spawn_blocking` or rayon for that.

## Tokio setup

```toml
[dependencies]
tokio = { version = "1", features = ["rt-multi-thread", "macros", "time", "net", "fs", "sync"] }
```

`features = ["full"]` is convenient for learning; in production list only what
you use — it cuts compile time noticeably.

```rust
#[tokio::main]
async fn main() {
    let n = compute().await;
    println!("{n}");
}

async fn compute() -> u32 {
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    42
}
```

`#[tokio::main]` is sugar for building a multi-threaded runtime and blocking on
the future. For more control:

```rust
fn main() {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(4)
        .enable_all()
        .build()
        .unwrap();
    rt.block_on(async { /* ... */ });
}
```

## Concurrency: `join!`, `try_join!`, `spawn`

```rust
use tokio::time::{sleep, Duration};

async fn slow(name: &str, ms: u64) -> String {
    sleep(Duration::from_millis(ms)).await;
    format!("{name} done")
}

#[tokio::main]
async fn main() {
    // sequential — 300ms total
    let a = slow("a", 100).await;
    let b = slow("b", 200).await;

    // concurrent — 200ms total
    let (a, b) = tokio::join!(slow("a", 100), slow("b", 200));

    // concurrent, fail fast on the first error
    let (x, y) = tokio::try_join!(fallible("x"), fallible("y"))?;

    // detached: runs on its own, needs 'static
    let handle = tokio::spawn(async move { slow("c", 50).await });
    let c = handle.await.unwrap();       // JoinHandle::await returns Result
}
```

| Tool | Meaning |
| --- | --- |
| `.await` in sequence | run one after another |
| `join!` | run all, wait for all |
| `try_join!` | run all, return early on first error |
| `spawn` | run on the runtime, independent lifetime |
| `spawn_blocking` | run blocking code on a dedicated thread pool |
| `select!` | wait for the *first* to complete |

### `select!`

```rust
use tokio::time::{sleep, Duration};

tokio::select! {
    v = slow("fast", 50) => println!("fast won: {v}"),
    v = slow("slow", 500) => println!("slow won: {v}"),
}
// the losing future is dropped — cancellation is drop
```

This is how timeouts are implemented:

```rust
let result = tokio::select! {
    r = do_work() => r,
    _ = sleep(Duration::from_secs(5)) => Err(anyhow::anyhow!("timeout")),
};
```

Or simply:

```rust
let r = tokio::time::timeout(Duration::from_secs(5), do_work()).await??;
```

> **Gotcha:** `select!` cancels by *dropping* the losing future. If that future
> was halfway through a multi-step operation, you get a partial write. Guard
> non-cancellable work with `tokio::spawn` (a spawned task is not cancelled when
> its handle is dropped) or make the operation idempotent.

## Blocking inside async

```rust
// WRONG — blocks the worker thread
async fn bad() -> String {
    std::fs::read_to_string("big.txt").unwrap()
}

// RIGHT — tokio's async fs (uses a blocking pool internally)
async fn good() -> std::io::Result<String> {
    tokio::fs::read_to_string("big.txt").await
}

// RIGHT for CPU-heavy or non-tokio blocking libraries
async fn also_good() -> String {
    tokio::task::spawn_blocking(|| expensive_cpu_work())
        .await
        .unwrap()
}
```

Never call `std::thread::sleep` in async code — it blocks the whole worker. Use
`tokio::time::sleep`.

## Shared state in async

```rust
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};

// Fine for short critical sections, but blocks the thread briefly
let state = Arc::new(std::sync::Mutex::new(0));

// async-aware: .await instead of blocking
let state = Arc::new(Mutex::new(0));
{
    let mut g = state.lock().await;
    *g += 1;
}
```

> **Rule of thumb:** use `std::sync::Mutex` when the lock is held across no
> `.await`. Use `tokio::sync::Mutex` only when you must hold it across an
> `.await` — it is slower and it makes deadlocks easier.

Channels:

```rust
use tokio::sync::mpsc;

let (tx, mut rx) = mpsc::channel::<String>(100);

tokio::spawn(async move {
    for i in 0..5 { tx.send(format!("job {i}")).await.unwrap(); }
});

while let Some(msg) = rx.recv().await {
    println!("{msg}");
}
```

## `Send + 'static` bounds, and why spawn complains

```rust
async fn handler(name: String) {
    let local = String::from("x");
    tokio::spawn(async {
        println!("{local}");     // error: borrowed data escapes
    });
}
```

`tokio::spawn` needs the future to be `Send + 'static`: it may run on another
thread and may outlive the current frame. Fixes:

```rust
let local = String::from("x");
tokio::spawn(async move {          // 1. move ownership in
    println!("{local}");
});

// 2. if a non-Send type is unavoidable, use spawn_local on a LocalSet
```

### Holding a non-`Send` guard across `.await`

```rust
let g = rc_refcell.borrow();
some_async().await;      // error: future is not Send
drop(g);
```

The error is `future cannot be sent between threads safely`. The fix is almost
always to scope the guard: `{ let g = ...; ... }` ending before the `.await`.

## `Pin` and why futures are pinned

A future is a state machine, and one state may contain a reference to another.
If the future moved in memory, those references would dangle. `Pin<&mut F>`
guarantees the future will not move.

In practice you meet `Pin` in:

- `Box::pin(fut)` when you need a heap-allocated future
- `Pin<Box<dyn Future<Output = T> + Send>>` in trait-object position
- error messages about "cannot move out of pinned"

You rarely write `Pin` by hand.

## Async traits

Since Rust 1.75, `async fn` in traits is stable — but the resulting futures are
not `Send` by default, which breaks `tokio::spawn`. The workaround:

```rust
use std::future::Future;

pub trait Repo: Send + Sync {
    fn find(&self, id: u64) -> impl Future<Output = Option<User>> + Send;
}

impl Repo for PgRepo {
    async fn find(&self, id: u64) -> Option<User> {
        sqlx::query_as("SELECT ...").fetch_optional(&self.pool).await.ok().flatten()
    }
}
```

Note: the trait declares the return type explicitly with `+ Send`, the impl uses
plain `async fn`. Alternatively use the `async-trait` crate, which boxes the
future (`Box<dyn Future + Send>`) and works on older toolchains at the cost of
one allocation per call.

## `Stream`s

An `async` iterator:

```rust
use futures::stream::{self, StreamExt};

let s = stream::iter(0..5).map(|n| async move { n * 2 });
let collected: Vec<i32> = s.collect().await;

// bounded concurrency over many items
let results: Vec<_> = stream::iter(urls)
    .map(|u| async move { fetch(u).await })
    .buffer_unordered(10)
    .collect()
    .await;
```

`buffer_unordered(10)` is the standard answer to "fetch 1000 URLs but only 10 at
a time". It is how you avoid both serial slowness and connection exhaustion.

## Common mistakes

```rust
// 1. forgetting .await — compiles with a warning, does nothing
fetch().await;      // right
fetch();            // warning: unused `impl Future` that must be used

// 2. holding a lock across await
let g = mutex.lock().await;
other_async().await;    // other tasks cannot get the lock meanwhile

// 3. sequential awaits in a loop when you wanted concurrency
for u in urls { fetch(u).await; }         // slow
// use stream::iter(...).buffer_unordered(10)

// 4. async recursion
async fn recurse(n: u32) { if n > 0 { Box::pin(recurse(n - 1)).await; } }
// without Box::pin: error, infinitely sized future

// 5. assuming a spawned task is cancelled when its handle drops — it is not
```

## A worked example: concurrent fetcher with rate limiting

```rust
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Semaphore;
use tokio::time::sleep;

async fn fetch_one(url: &str) -> Result<String, String> {
    sleep(Duration::from_millis(100)).await;      // pretend network
    if url.contains("bad") { return Err(format!("{url} failed")); }
    Ok(format!("{url} ok"))
}

async fn fetch_all(urls: Vec<String>, max_concurrent: usize) -> Vec<Result<String, String>> {
    let sem = Arc::new(Semaphore::new(max_concurrent));
    let mut tasks = Vec::with_capacity(urls.len());

    for url in urls {
        let sem = Arc::clone(&sem);
        tasks.push(tokio::spawn(async move {
            let _permit = sem.acquire().await.unwrap();   // limit concurrency
            fetch_one(&url).await
        }));
    }

    let mut out = Vec::with_capacity(tasks.len());
    for t in tasks {
        out.push(t.await.unwrap_or_else(|e| Err(format!("task panicked: {e}"))));
    }
    out
}

#[tokio::main]
async fn main() {
    let urls: Vec<String> = (0..20).map(|i| format!("https://example.com/{i}")).collect();
    let results = fetch_all(urls, 5).await;
    let ok = results.iter().filter(|r| r.is_ok()).count();
    println!("{ok}/{} succeeded", results.len());
}
```

A `Semaphore` permit is released when `_permit` drops at the end of the task —
RAII again.

---

## Exercises

1. Write two async fns sleeping 100 ms and 200 ms. Time `a.await; b.await;` vs
   `tokio::join!(a, b)`. Confirm ~300 ms vs ~200 ms.
2. Add a 50 ms timeout to a 200 ms operation with `tokio::time::timeout` and
   handle the `Elapsed` error.
3. Deliberately call `std::thread::sleep` inside an async task running on a
   1-worker runtime alongside a ticker, and observe the ticker stalling. Fix it.
4. Fetch 100 fake URLs with `buffer_unordered(10)` and compare against a
   sequential loop.
5. Implement an `async fn` in a trait with `+ Send` in the return position and
   spawn it.
6. Explain the compiler error when a `RefCell` borrow guard lives across an
   `.await` in a spawned task.

**Next:** [Macros](12-macros.md)
