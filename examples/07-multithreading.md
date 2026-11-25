---
summary: Twelve concurrency recipes you will actually need — pools, caches, barriers, timeouts, cancellation, deadlock fixes.
level: Advanced
time: 18 min
tags: [concurrency, threads, patterns]
---

# Multithreading recipes

Each recipe is a problem, the code, and the trap that catches people.

## 1. Parallel map over a slice

```rust
use rayon::prelude::*;

let out: Vec<u64> = input.par_iter().map(|x| transform(*x)).collect();
// order preserved; results are identical to the sequential version
```

> **Trap:** `for_each` does not preserve order and gives no results. Use `map` +
> `collect` unless you genuinely only need side effects.

## 2. Parallel map that mutates in place

```rust
use rayon::prelude::*;

let mut data: Vec<f64> = vec![1.0; 1_000_000];
data.par_iter_mut().for_each(|x| *x *= 2.0);
```

`par_iter_mut` splits the slice into disjoint `&mut` chunks — no locks, no atomics.

## 3. A thread-safe counter without a mutex

```rust
use std::sync::atomic::{AtomicU64, Ordering};

let hits = AtomicU64::new(0);
hits.fetch_add(1, Ordering::Relaxed);      // counters: Relaxed is enough
let total = hits.load(Ordering::Relaxed);
```

## 4. A shared cache with `RwLock`

```rust
use std::collections::HashMap;
use std::sync::RwLock;

let cache: RwLock<HashMap<String, String>> = RwLock::new(HashMap::new());

// read path: concurrent
if let Some(v) = cache.read().unwrap().get("k") { use_it(v); }

// write path: exclusive, and the guard is dropped at the end of the statement
cache.write().unwrap().insert("k".into(), "v".into());
```

> **Trap:** `let g = cache.read().unwrap();` held across a slow operation blocks
> every writer. Copy what you need out and drop the guard.

## 5. Wait for a condition, correctly

```rust
use std::sync::{Condvar, Mutex};

let pair = (Mutex::new(false), Condvar::new());

// waiter
let (lock, cv) = &pair;
let mut ready = lock.lock().unwrap();
while !*ready {
    ready = cv.wait(ready).unwrap();       // re-check in a loop: spurious wakeups exist
}

// signaller
let (lock, cv) = &pair;
*lock.lock().unwrap() = true;
cv.notify_all();
```

## 6. Synchronise a phase across threads

```rust
use std::sync::{Arc, Barrier};

let barrier = Arc::new(Barrier::new(4));
let handles: Vec<_> = (0..4).map(|_| {
    let b = Arc::clone(&barrier);
    std::thread::spawn(move || {
        // phase 1
        b.wait();
        // phase 2 — every thread has finished phase 1
    })
}).collect();
for h in handles { h.join().unwrap(); }
```

## 7. Bounded parallelism without a semaphore

```rust
use futures::stream::{self, StreamExt};

let results: Vec<_> = stream::iter(items)
    .map(|item| async move { handle(item).await })
    .buffer_unordered(16)          // at most 16 in flight
    .collect()
    .await;
```

## 8. A timeout on one step

```rust
use std::time::Duration;

let value = tokio::time::timeout(Duration::from_millis(250), fetch(&pool))
    .await
    .map_err(|_| Error::Timeout)??;
```

## 9. Cancel a long task cleanly

```rust
let handle = tokio::spawn(work());

tokio::select! {
    _ = &mut handle => {}                 // finished
    _ = tokio::signal::ctrl_c() => {
        handle.abort();
        let _ = handle.await;             // observe the cancellation
    }
}
```

> **Trap:** cancellation is a drop at the next `.await`. Work that must not be
> interrupted belongs in its own task or a transaction.

## 10. Find a deadlock before it ships

```rust
// two locks taken in opposite order = deadlock
// thread A: lock(a) then lock(b)
// thread B: lock(b) then lock(a)

// FIX 1: a documented global order
fn transfer(a: &Account, b: &Account) {
    let (first, second) = if a.id < b.id { (a, b) } else { (b, a) };
    let _g1 = first.lock();
    let _g2 = second.lock();
    // ...
}

// FIX 2: one lock, not two — put both accounts behind a single mutex
```

## 11. Measure whether threads helped

```rust
use std::time::Instant;

fn timed<T>(label: &str, f: impl FnOnce() -> T) -> T {
    let t = Instant::now();
    let out = f();
    println!("{label}: {:?}", t.elapsed());
    out
}

timed("serial", || data.iter().map(|x| heavy(*x)).sum::<u64>());
timed("rayon", || data.par_iter().map(|x| heavy(*x)).sum::<u64>());
```

Report the ratio and the core count. A 1.2× win on 8 cores means the work per item is
too small to parallelise.

## 12. The lock-free handoff you can actually write

```rust
// one producer, one consumer, fixed size (full version in module 08.04)
let (tx, rx) = std::sync::mpsc::sync_channel::<Msg>(1024);   // bounded = backpressure

std::thread::spawn(move || {
    for i in 0..1_000_000 { tx.send(Msg::Tick(i)).unwrap(); }
});

while let Ok(msg) = rx.recv() { handle(msg); }
```

Before writing a lock-free queue, use `crossbeam-channel` or `flume`. They are
faster than what you will write and they are correct.

## The checklist

- [ ] shared state is immutable or `Arc<...>`
- [ ] every lock is held for a bounded, short time
- [ ] no lock held across `.await`
- [ ] every queue is bounded
- [ ] every long-lived task has an owner that notices it stopped
- [ ] cancellation leaves no partial state
- [ ] the p99 is measured, not just the mean

**Next:** [Desktop and GUI recipes](08-desktop-gui.md)
