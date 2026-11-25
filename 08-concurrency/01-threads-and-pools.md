# 01 · Threads and pools

Module 02.10 taught the rules. This module is about using them: which thread model,
how many, and what actually costs you throughput.

## The three thread models

| Model | Cost per unit | Best for |
| --- | --- | --- |
| OS thread | 8 MB stack, ~20 µs spawn | few, long-lived, CPU-bound |
| scoped thread | same, but borrowed data | parallel loops over `&[T]` |
| task (async) | ~100 bytes, ~1 µs spawn | thousands of I/O waits |

Threads give you parallelism. Async gives you concurrency without parallelism. You
usually want both: a tokio runtime for I/O, and a rayon pool for CPU work.

## Sizing a pool

```rust
use std::thread;

// one worker per physical core for CPU-bound work
fn cpu_bound_workers() -> usize {
    thread::available_parallelism().map(|n| n.get()).unwrap_or(1)
}
```

> **Rule of thumb:** CPU-bound → `num_cpus`. I/O-bound → `num_cpus × (1 + wait_time /
> compute_time)`, and in practice you let tokio's runtime size itself and add
> `spawn_blocking` for the slow parts.

Oversubscription is not free: 64 CPU threads on 8 cores spends more time in context
switches and cache thrash than doing work.

[[fig:thread-scaling]]

## Scoped threads: borrow instead of `Arc`

```rust
fn parallel_sum(data: &[u64]) -> u64 {
    let workers = cpu_bound_workers();
    let chunk = data.len().div_ceil(workers);
    let total = std::sync::atomic::AtomicU64::new(0);

    std::thread::scope(|s| {
        for part in data.chunks(chunk) {
            let total = &total;              // borrowed, not cloned
            s.spawn(move || {
                let local: u64 = part.iter().sum();
                total.fetch_add(local, std::sync::atomic::Ordering::Relaxed);
            });
        }
    });                                       // scope joins every thread

    total.into_inner()
}
```

`thread::scope` removes the `'static` bound, which removes the need for `Arc` in the
most common case. It also guarantees the join — a panicking thread propagates when
the scope ends.

## Two `&mut` into one slice

```rust
let mut v: Vec<u64> = (0..8).collect();
let (left, right) = v.split_at_mut(4);

std::thread::scope(|s| {
    s.spawn(|| left.sort_unstable());
    s.spawn(|| right.sort_unstable());
});
```

The borrow checker accepts this because `split_at_mut` proves the halves are
disjoint. `chunks_mut(n)` gives you n disjoint `&mut [T]` the same way.

## A pool that reuses threads

Spawning a thread per job costs ~20 µs and 8 MB of address space. For 10,000 short
jobs that is 200 ms of pure overhead.

```rust
use std::sync::{mpsc, Arc, Mutex};
use std::thread;

type Job = Box<dyn FnOnce() + Send + 'static>;

pub struct Pool {
    tx: Option<mpsc::Sender<Job>>,
    workers: Vec<thread::JoinHandle<()>>,
}

impl Pool {
    pub fn new(size: usize) -> Self {
        let (tx, rx) = mpsc::channel::<Job>();
        let rx = Arc::new(Mutex::new(rx));

        let workers = (0..size)
            .map(|_| {
                let rx = Arc::clone(&rx);
                thread::spawn(move || loop {
                    // take the job, then drop the lock BEFORE running it
                    let job = { rx.lock().unwrap().recv() };
                    match job {
                        Ok(f) => f(),
                        Err(_) => break,       // channel closed
                    }
                })
            })
            .collect();

        Self { tx: Some(tx), workers }
    }

    pub fn execute(&self, job: Job) {
        if let Some(tx) = &self.tx {
            let _ = tx.send(job);
        }
    }
}

impl Drop for Pool {
    fn drop(&mut self) {
        drop(self.tx.take());                  // close the channel
        for w in self.workers.drain(..) { let _ = w.join(); }
    }
}
```

The braces around `rx.lock().unwrap().recv()` are the whole design: the mutex is
held only while waiting for a job, not while running it. Hold it across `f()` and
you have a single-threaded pool that looks parallel.

## rayon: the pool you should not write

```toml
rayon = "1"
```

```rust
use rayon::prelude::*;

let total: u64 = data.par_iter().sum();
let squares: Vec<u64> = data.par_iter().map(|x| x * x).collect();

// custom pool, so CPU work never starves the async runtime
let pool = rayon::ThreadPoolBuilder::new().num_threads(4).build()?;
let result = pool.install(|| heavy_parallel_work());
```

rayon uses work stealing: an idle thread takes half of a busy thread's queue. That
is why `par_iter` scales without you writing a scheduler.

> **Gotcha:** nested `par_iter` oversubscribes. Parallelise the outermost loop only.

## Blocking work inside async

```rust
// WRONG: blocks a tokio worker thread for the whole computation
async fn bad() { let _ = expensive_cpu(); }

// RIGHT: hands it to the blocking pool
async fn good() -> u64 {
    tokio::task::spawn_blocking(expensive_cpu).await.unwrap()
}
```

tokio's default worker count is one per core. One blocked worker can stall every
task scheduled on it, which is why a single `std::fs::read` in a handler can look
like a global outage.

## Measuring whether threads helped

```rust
use std::time::Instant;

fn bench<F: FnOnce() -> T, T>(label: &str, f: F) -> T {
    let t = Instant::now();
    let out = f();
    println!("{label}: {:?}", t.elapsed());
    out
}
```

Scaling is rarely linear. At 1M items you might see 3.6× on 4 threads; at 1,000
items you will see 0.8×. Measure the crossover and pick the threshold.

## Exercises

1. Sum 100M `u64` single-threaded, with `thread::scope`, and with rayon. Report all three.
2. Write the `Pool` and compare 10,000 short jobs against spawning 10,000 threads.
3. Sort two halves of a 10M-element `Vec` in scoped threads and merge them.

**Next:** [Synchronisation primitives](02-synchronisation.md)
