---
summary: Worker pools, rate limiters, fan-out, debounce — the concurrency patterns that keep appearing, written correctly.
level: Advanced
time: 18 min
tags: [concurrency, async, patterns]
---

# Concurrency recipes

## A worker pool over a channel

```rust
use tokio::sync::mpsc;
use std::sync::Arc;

pub async fn pool<T, F, Fut>(workers: usize, cap: usize, f: F) -> mpsc::Sender<T>
where
    T: Send + 'static,
    F: Fn(T) -> Fut + Send + Sync + 'static,
    Fut: std::future::Future<Output = ()> + Send,
{
    let (tx, rx) = mpsc::channel::<T>(cap);
    let rx = Arc::new(tokio::sync::Mutex::new(rx));
    let f = Arc::new(f);

    for _ in 0..workers {
        let rx = Arc::clone(&rx);
        let f = Arc::clone(&f);
        tokio::spawn(async move {
            loop {
                let job = { rx.lock().await.recv().await };
                match job {
                    Some(j) => f(j).await,
                    None => break,          // all senders dropped
                }
            }
        });
    }
    tx
}
```

The inner braces matter: the `MutexGuard` is dropped before `f(j).await`, so the
workers actually run in parallel instead of serialising on the receiver lock.

## Limit concurrency without a semaphore

```rust
use futures::stream::{self, StreamExt};

let results: Vec<_> = stream::iter(urls)
    .map(|u| async move { fetch(u).await })
    .buffer_unordered(16)          // at most 16 in flight
    .collect()
    .await;
```

This is the single most useful line in async Rust. `buffer_unordered` keeps
throughput high without opening 10,000 sockets.

## Rate limit to N per second

```rust
use std::time::Duration;
use tokio::time::Instant;

pub struct RateLimiter { interval: Duration, next: Instant }

impl RateLimiter {
    pub fn new(per_second: u32) -> Self {
        Self {
            interval: Duration::from_micros(1_000_000 / per_second as u64),
            next: Instant::now(),
        }
    }

    pub async fn acquire(&mut self) {
        let now = Instant::now();
        if self.next > now {
            tokio::time::sleep_until(self.next).await;
        }
        self.next = Instant::now() + self.interval;
    }
}
```

For a distributed limit, use `governor` (token bucket, correct under contention) or
a Redis counter with an expiry.

## Fan out, then collect in order

```rust
use futures::future::join_all;

let futures = ids.iter().map(|id| async move { load(*id).await });
let results = join_all(futures).await;      // preserves input order
```

`join_all` returns in order; `FuturesUnordered` returns as they complete. Choose
deliberately — most bugs here are a mistaken assumption about which one you used.

## Timeout one step, not the whole pipeline

```rust
let db = tokio::time::timeout(Duration::from_millis(200), query(&pool))
    .await
    .map_err(|_| Error::Timeout("db"))??;
```

## Debounce rapid events

```rust
use tokio::sync::mpsc;

pub async fn debounce<T: Send + 'static>(
    mut rx: mpsc::Receiver<T>,
    window: Duration,
    mut on_settled: impl FnMut(T),
) {
    let mut pending: Option<T> = None;
    loop {
        tokio::select! {
            maybe = rx.recv() => match maybe {
                Some(v) => pending = Some(v),       // replace, restart the window
                None => break,
            },
            _ = tokio::time::sleep(window), if pending.is_some() => {
                if let Some(v) = pending.take() { on_settled(v); }
            }
        }
    }
}
```

## Share state across tasks

```rust
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Clone)]
pub struct Cache { inner: Arc<RwLock<std::collections::HashMap<String, String>>> }

impl Cache {
    pub async fn get(&self, k: &str) -> Option<String> {
        self.inner.read().await.get(k).cloned()      // guard dropped at the end of the expression
    }
    pub async fn set(&self, k: String, v: String) {
        self.inner.write().await.insert(k, v);
    }
}
```

> **Trap:** `let g = self.inner.read().await;` held across an `.await` blocks every
> writer for the duration of unrelated work. Copy what you need, drop the guard.

## Cancel a task properly

```rust
let handle = tokio::spawn(work());

tokio::select! {
    _ = &mut handle => {}                       // finished
    _ = tokio::signal::ctrl_c() => {
        handle.abort();                          // dropped, not awaited
        handle.await.ok();                       // observe the cancellation
    }
}
```

`abort()` is not instant: the task is cancelled at its next `.await`. Anything
that must not be interrupted belongs in a separate task or a transaction.

## Parallel CPU work inside an async service

```rust
// never do CPU work on the executor
let hash = tokio::task::spawn_blocking(move || expensive_hash(bytes)).await?;
```

One blocked worker thread starves every task scheduled on it. `spawn_blocking`
uses a separate, growable pool sized for exactly this.

**Next:** [Testing recipes](05-testing.md)
