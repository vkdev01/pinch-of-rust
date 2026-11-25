# 10 · Concurrency

Rust's pitch is "fearless concurrency": data races are a **compile error**, not a
production incident. This module covers threads, channels, shared state, and the
two marker traits that make it all work.

## `Send` and `Sync`

Two auto-traits. You almost never implement them; you do need to read them in
error messages.

- `T: Send` — a `T` can be **moved** to another thread.
- `T: Sync` — a `&T` can be **shared** between threads.

```text
error[E0277]: `Rc<u32>` cannot be sent between threads safely
   = help: within `Rc<u32>`, the trait `Send` is not implemented
```

`Rc<T>` is neither `Send` nor `Sync` (its counter is not atomic). `Arc<T>` is
both, when `T: Send + Sync`. `RefCell<T>` is `Send` but not `Sync`. `Mutex<T>` is
both, when `T: Send`.

| Type | `Send` | `Sync` |
| --- | --- | --- |
| `i32`, `String`, `Vec<T>` (if `T`) | yes | yes |
| `Rc<T>` | no | no |
| `Arc<T>` | if `T: Send + Sync` | if `T: Send + Sync` |
| `RefCell<T>` | if `T: Send` | **no** |
| `Mutex<T>` | if `T: Send` | if `T: Send` |
| `Cell<T>` | if `T: Send` | no |
| raw pointers | no | no |

## Threads

```rust
use std::thread;
use std::time::Duration;

let handle = thread::spawn(|| {
    for i in 0..3 {
        println!("worker {i}");
        thread::sleep(Duration::from_millis(10));
    }
    42                       // the closure's return value
});

handle.join().unwrap();      // wait and get 42
```

### `move` closures

A spawned thread may outlive the stack frame that created it, so anything it
borrows must be moved in:

```rust
let name = String::from("worker");
thread::spawn(move || {
    println!("{name}");      // without `move`: error[E0373]
});
```

### Named threads and stack size

```rust
thread::Builder::new()
    .name("db-pool".into())
    .stack_size(4 * 1024 * 1024)
    .spawn(|| { /* deep recursion safe */ })
    .unwrap()
    .join()
    .unwrap();
```

Names show up in panic messages and profilers. Worth the extra line.

### Scoped threads — borrow without `Arc`

```rust
let data = vec![1, 2, 3];

thread::scope(|s| {
    s.spawn(|| println!("{:?}", &data));   // borrows, no move, no Arc
    s.spawn(|| println!("{}", data.len()));
});
// scope guarantees both threads finished
```

`thread::scope` (stable since 1.63) removes the need for `Arc` in the common
"parallel loop over borrowed data" case. Prefer it.

## Channels

Message passing: no shared state, no locks.

```rust
use std::sync::mpsc;

let (tx, rx) = mpsc::channel();

for id in 0..4 {
    let tx = tx.clone();
    std::thread::spawn(move || {
        tx.send(format!("done {id}")).unwrap();
    });
}
drop(tx);                     // drop the original, or the loop never ends

for msg in rx {               // blocks until all senders are dropped
    println!("{msg}");
}
```

`mpsc` = multi-producer, single-consumer. For work queues you usually want the
crossbeam or flume crate, or `tokio::sync::mpsc` in async code.

### Bounded channels apply backpressure

```rust
use std::sync::mpsc::sync_channel;

let (tx, rx) = sync_channel(100);   // blocks when the buffer is full
```

An unbounded channel in a producer-faster-than-consumer pipeline is a memory
leak with extra steps. Bound it.

## Shared state

```rust
use std::sync::{Arc, Mutex};
use std::thread;

#[derive(Debug)]
struct Stats { requests: u64, errors: u64 }

let stats = Arc::new(Mutex::new(Stats { requests: 0, errors: 0 }));
let mut handles = Vec::new();

for _ in 0..8 {
    let stats = Arc::clone(&stats);
    handles.push(thread::spawn(move || {
        for _ in 0..1000 {
            let mut g = stats.lock().unwrap();
            g.requests += 1;
        }
    }));
}
for h in handles { h.join().unwrap(); }

assert_eq!(stats.lock().unwrap().requests, 8000);
```

> **Gotcha:** holding a `MutexGuard` across a long operation serialises
> everything. Copy the values you need out, drop the guard, then do the work:
> ```rust
> let snapshot = { let g = stats.lock().unwrap(); *g };
> // guard dropped here — now do slow work with `snapshot`
> ```

### Deadlock: the lock-ordering problem

```rust
// thread A: lock(a) then lock(b)
// thread B: lock(b) then lock(a)   → deadlock
```

Fixes, in order of preference: never hold two locks at once; if you must,
always acquire in a documented global order; or use `try_lock` with a timeout.

## Parallelism with rayon

For CPU-bound work over a collection, rayon is the shortest path. It uses a
work-stealing pool and turns `.iter()` into `.par_iter()`.

```toml
rayon = "1"
```

```rust
use rayon::prelude::*;

let nums: Vec<u64> = (1..=1_000_000).collect();

let total: u64 = nums.par_iter().sum();
let squares: Vec<u64> = nums.par_iter().map(|n| n * n).collect();
let filtered: Vec<u64> = nums.par_iter().filter(|&&n| n % 3 == 0).copied().collect();

// order-preserving; use for_each for order-independent side effects
```

Rule: **parallelise the outermost loop only.** Nested `par_iter` causes
oversubscription.

```rust
// BAD: nested
matrix.par_iter().for_each(|row| {
    row.par_iter().for_each(|_| {});   // no
});
```

## Parallel map-reduce with a thread pool

```rust
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

fn parallel_sum(data: &[u64], threads: usize) -> u64 {
    let chunk = data.len().div_ceil(threads);
    let next = Arc::new(AtomicUsize::new(0));
    let total = Arc::new(AtomicUsize::new(0));

    std::thread::scope(|s| {
        for _ in 0..threads {
            let next = Arc::clone(&next);
            let total = Arc::clone(&total);
            s.spawn(move || {
                loop {
                    let start = next.fetch_add(chunk, Ordering::Relaxed);
                    if start >= data.len() { break; }
                    let end = (start + chunk).min(data.len());
                    let partial: u64 = data[start..end].iter().sum();
                    total.fetch_add(partial as usize, Ordering::Relaxed);
                }
            });
        }
    });

    total.load(Ordering::Relaxed) as u64
}
```

This is what rayon does internally, minus the cleverness. Writing it once by
hand is worth it for understanding work stealing.

## When to use threads vs async

| Workload | Use |
| --- | --- |
| CPU-bound, parallelisable over data | rayon / threads |
| Many I/O waits (network, disk) | async (module 02.11) |
| A fixed set of long-running tasks | threads |
| Thousands of concurrent connections | async |
| Simple background job, no I/O | thread |

Async does not make CPU work faster — it multiplexes waiting. Doing CPU work
inside an async task blocks the executor and starves every other task on that
worker thread.

## A worked example: a bounded worker pool

```rust
use std::sync::{mpsc, Arc, Mutex};
use std::thread;

type Job = Box<dyn FnOnce() + Send + 'static>;

struct Pool {
    workers: Vec<thread::JoinHandle<()>>,
    tx: Option<mpsc::Sender<Job>>,
}

impl Pool {
    fn new(size: usize) -> Self {
        let (tx, rx) = mpsc::channel::<Job>();
        let rx = Arc::new(Mutex::new(rx));
        let mut workers = Vec::with_capacity(size);

        for i in 0..size {
            let rx = Arc::clone(&rx);
            workers.push(thread::spawn(move || loop {
                let job = {
                    let guard = rx.lock().unwrap();
                    guard.recv()
                };                       // guard dropped before running the job
                match job {
                    Ok(f) => {
                        println!("worker {i} took a job");
                        f();
                    }
                    Err(_) => break,     // channel closed
                }
            }));
        }
        Pool { workers, tx: Some(tx) }
    }

    fn execute(&self, job: Job) {
        self.tx.as_ref().unwrap().send(job).unwrap();
    }
}

impl Drop for Pool {
    fn drop(&mut self) {
        drop(self.tx.take());            // close the channel
        for w in self.workers.drain(..) {
            w.join().unwrap();
        }
    }
}

fn main() {
    let pool = Pool::new(4);
    for i in 0..8 {
        pool.execute(Box::new(move || {
            println!("job {i} running on {:?}", thread::current().name());
        }));
    }
}   // Drop joins every worker — no threads leak
```

Two details that matter: the `MutexGuard` is scoped so the lock is not held
while the job runs (otherwise it is a single-threaded pool), and `Drop` closes
the channel so workers exit rather than blocking forever.

---

## Exercises

1. Spawn 10 threads that each increment a shared `AtomicUsize` 1000 times.
   Assert the total.
2. Build a producer/consumer pair with a bounded `sync_channel(4)` and observe
   the backpressure with timing prints.
3. Rewrite a `Vec`-summing loop with `rayon::par_iter()` and compare wall time
   on 10M elements.
4. Use `thread::scope` to sort four slices of one `&mut Vec` in parallel with
   `split_at_mut`.
5. Deliberately create a deadlock with two mutexes, then fix it with a
   consistent lock order.
6. Explain the compiler error you get when you try to move an `Rc<T>` into a
   `thread::spawn` closure.

**Next:** [Async / await](11-async-await.md)
