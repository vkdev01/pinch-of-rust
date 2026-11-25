# 05 · Parallel data patterns

Four patterns cover almost all parallel data work. Each has a Rust shape you can
recognise and reuse.

## 1. Map — one function over many items

```rust
use rayon::prelude::*;

let results: Vec<u64> = input.par_iter().map(|x| hash(x)).collect();
```

`collect` preserves input order even though execution is out of order. If order does
not matter and you only need side effects, use `for_each`.

## 2. Reduce — many partial results into one

```rust
let total: u64 = input.par_iter().map(|x| expensive(x)).sum();

// custom reduction
let stats = input.par_iter().fold(
    || (0u64, u64::MAX, 0u64),                       // identity
    |(sum, min, max), &x| (sum + x, min.min(x), max.max(x)),
).reduce(
    || (0u64, u64::MAX, 0u64),
    |a, b| (a.0 + b.0, a.1.min(b.1), a.2.max(b.2)),
);
```

`fold`/`reduce` is the shape for any statistic you cannot get from a built-in
method. The identity closure runs once per thread; the reduce closure merges.

## 3. Chunk — disjoint mutable slices

```rust
use std::thread;

fn scale(data: &mut [f32], factor: f32) {
    let workers = thread::available_parallelism().map(|n| n.get()).unwrap_or(1);
    let chunk = data.len().div_ceil(workers);

    thread::scope(|s| {
        for part in data.chunks_mut(chunk) {
            s.spawn(move || {
                for x in part { *x *= factor; }
            });
        }
    });
}
```

This is the pattern for in-place work: no atomics, no locks, no allocation. The
borrow checker guarantees the chunks do not overlap.

## 4. Fan-out / fan-in with bounded concurrency

```rust
use futures::stream::{self, StreamExt};

let results: Vec<Result<Payload, Error>> = stream::iter(urls)
    .map(|url| async move { fetch(url).await })
    .buffer_unordered(16)          // at most 16 in flight
    .collect()
    .await;
```

`buffer_unordered(16)` is the single most useful line in async Rust: it keeps
throughput high without opening 10,000 sockets. The bound *is* the design.

## Backpressure: the pattern people skip

```rust
use tokio::sync::mpsc;

// bounded queue between stages: a slow consumer slows the producer
let (tx, mut rx) = mpsc::channel::<Batch>(32);

tokio::spawn(async move {
    while let Some(batch) = rx.recv().await {
        process(batch).await;      // if this is slow, send().await blocks
    }
});
```

An unbounded channel is a memory leak with extra steps. The queue depth is the
buffer you accept during a spike; after that, the producer must wait.

## Work stealing, in one paragraph

rayon gives each worker a deque of tasks. A worker pushes/pops at its own end (LIFO,
cache-hot). When idle, it steals from the *other* end of another worker's deque
(FIFO, cold). LIFO-locally + FIFO-stealing is why it scales: you mostly run your own
recent work, and stealing is rare.

```rust
// recursive divide-and-conquer is exactly what work stealing is built for
fn quicksort_par(v: &mut [u64]) {
    if v.len() <= 4096 { v.sort_unstable(); return; }
    let mid = partition(v);
    let (left, right) = v.split_at_mut(mid);
    rayon::join(|| quicksort_par(left), || quicksort_par(right));
}
```

`rayon::join` runs the first closure on the current thread and offers the second to
the pool. The 4096-element cutoff matters: below it, parallelism costs more than it
saves.

## Scaling: what the numbers actually look like

| Work per item | 1 thread | 8 threads | Speedup |
| --- | --- | --- | --- |
| 10 ns | 100 ms | 95 ms | 1.05× |
| 100 ns | 1.0 s | 150 ms | 6.7× |
| 1 µs | 10 s | 1.3 s | 7.7× |

Anything under ~100 ns per item is dominated by scheduling. The threshold is why
"parallelise everything" produces slower programs.

## Shared-state patterns, ranked

| Pattern | Contention | Use when |
| --- | --- | --- |
| no sharing (chunking) | none | always, if possible |
| per-thread accumulators + merge | none | statistics |
| channels | low | ownership moves between stages |
| `RwLock` | medium | read-heavy shared state |
| `Mutex` | high | short critical sections |
| atomics | high | single-word state |

Design goal: move every workload one row up this table.

## A complete pipeline

```rust
use std::sync::mpsc;
use std::thread;

pub fn pipeline(input: Vec<String>) -> Vec<usize> {
    let (tx1, rx1) = mpsc::sync_channel::<String>(256);
    let (tx2, rx2) = mpsc::sync_channel::<usize>(256);

    // stage 1: parse (2 workers)
    for _ in 0..2 {
        let rx1 = rx1.clone();                 // not Clone on mpsc::Receiver — see note
        let tx2 = tx2.clone();
        thread::spawn(move || {
            for line in rx1 {
                let n = line.len();
                let _ = tx2.send(n);
            }
        });
    }
    drop(tx2);

    for line in input { let _ = tx1.send(line); }
    drop(tx1);

    rx2.iter().collect()
}
```

`std::sync::mpsc::Receiver` is not `Clone`. For multi-consumer stages use
`crossbeam::channel` (which is also faster) or wrap the receiver in
`Arc<Mutex<Receiver>>`.

## Exercises

1. Implement the `scale` function and verify identical results to a serial loop.
2. Build the fan-out pipeline with `buffer_unordered(8)` and measure against `join_all`.
3. Find the parallel speedup crossover on your machine: time a `par_iter` map at
   1 µs, 100 ns and 10 ns of work per item.

**Next:** [Designing APIs](../09-design/01-api-design.md)
