# 01 · Complexity, measured

Big-O tells you how a structure scales. It does not tell you which one is faster
on your machine — that is a cache question, and in Rust you can measure it.

## The two questions

```text
1. How does cost grow with n?          -> Big-O
2. What is the constant in front?      -> cache lines, allocations, branches
```

A `Vec` scan of 1,000 `u32`s beats a `HashMap` lookup: 4 KB is L1-resident and the
branch predictor handles a linear scan perfectly. Asymptotics only win once n is
big enough that the cache stops helping.

[[fig:complexity]]

## Counting the real cost

```rust
use std::hint::black_box;

fn main() {
    let n = 100_000usize;
    let data: Vec<u32> = (0..n as u32).collect();

    // allocation count is often the dominant term
    let mut out = Vec::new();               // grows: log2(n) reallocations
    for x in &data { out.push(*x); }

    let mut pre = Vec::with_capacity(n);    // zero reallocations
    for x in &data { pre.push(black_box(*x)); }

    println!("{} {}", out.len(), pre.len());
}
```

`black_box` stops the optimiser deleting the loop — without it, benchmarks measure
nothing.

## The instrument that matters: `perf stat`

```bash
$ cargo build --release
$ perf stat -e cycles,instructions,cache-misses,branch-misses ./target/release/app
```

```text
    1,204,883,441      cycles
    3,101,228,904      instructions     #  2.57  insn per cycle
       41,220,118      cache-misses     #  8.1% of all cache refs
        2,118,004      branch-misses    #  1.2% of all branches
```

| Reading | What it means |
| --- | --- |
| IPC < 1.0 | memory-bound — fix the data layout before the algorithm |
| High cache-misses | the working set does not fit; shrink the element or reorder |
| High branch-misses | unpredictable data — sort first, or go branchless |

## Growth you can see in a benchmark

```rust
// benches/growth.rs
use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion};

fn linear(v: &[u64]) -> u64 { v.iter().sum() }

fn quadratic(v: &[u64]) -> u64 {
    let mut n = 0;
    for a in v {
        for b in v {
            if a == b { n += 1; }
        }
    }
    n
}

fn bench(c: &mut Criterion) {
    let mut g = c.benchmark_group("growth");
    for n in [1_000usize, 10_000, 100_000] {
        let v: Vec<u64> = (0..n as u64).collect();
        g.bench_with_input(BenchmarkId::new("linear", n), &v, |b, v| {
            b.iter(|| linear(black_box(v)))
        });
    }
    g.finish();
}

criterion_group!(benches, bench);
criterion_main!(benches);
```

Plot time against n: a straight line is linear, a straight line on a log-log plot
with slope 2 is quadratic. Guessing is what the plot replaces.

## Amortised cost is not free cost

`Vec::push` is amortised O(1) but occasionally O(n) when it reallocates. In a
latency-sensitive path that one reallocation is a spike. `with_capacity` moves the
spike to a place you chose.

```rust
let mut v = Vec::with_capacity(exact_len);   // the honest version
```

The same applies to `String`, `HashMap`, and `VecDeque`.

## Choosing a structure: the decision table

| Need | Structure | Cost |
| --- | --- | --- |
| ordered sequence, index access | `Vec<T>` | O(1) index, O(n) insert |
| push/pop both ends | `VecDeque<T>` | O(1) both ends |
| key → value, unordered | `HashMap<K, V>` | O(1) avg |
| key → value, ordered/range | `BTreeMap<K, V>` | O(log n) |
| membership | `HashSet<T>` / bitset | O(1) |
| priority queue | `BinaryHeap<T>` | O(log n) |
| prefix search | trie / `BTreeMap<String, _>` range | O(len) |
| graph | `Vec<Vec<u32>>` adjacency | O(V+E) |

> **Rule of thumb:** start with `Vec` and `HashMap`. Move to `BTreeMap` when you
> need order or ranges, and to a specialised structure only after a profile says so.

## Exercises

1. Benchmark a linear scan vs a `HashSet` lookup at n = 10, 100, 10,000. Find the
   crossover on your machine.
2. Run `perf stat` on a `Vec<Vec<u32>>` (array of arrays) and on a flat
   `Vec<u32>` with manual indexing. Explain the cache-miss difference.
3. Implement `with_capacity` vs push-growth for 10M items and compare wall time.

**Next:** [Arrays, slices and the cache](02-arrays-and-cache.md)
