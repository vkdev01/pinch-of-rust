# 09 · Sorting and selection

Sorting is the most-optimised operation in computing. Your job is to pick the right
one and stop re-implementing it.

## The standard library is fast

```rust
let mut v = vec![3, 1, 2];
v.sort_unstable();                    // pattern-defeating quicksort, no allocation
v.sort();                             // stable merge sort, allocates
v.sort_by_key(|x| x.0);               // sort a struct by a field
v.sort_by(|a, b| b.1.cmp(&a.1));      // custom ordering

v.select_nth_unstable(2);             // partition so v[2] is the 3rd smallest
```

| Method | Stable | Allocation | Use when |
| --- | --- | --- | --- |
| `sort_unstable` | no | no | default choice |
| `sort` | yes | yes | equal elements must keep order |
| `sort_by_key` | yes | yes | sort structs by a cheap key |
| `select_nth_unstable` | no | no | you need the k-th element, not order |

> **Rule of thumb:** `sort_unstable` unless stability is a requirement. It is
> usually 20–30% faster and never allocates.

## Radix sort: when comparison is the bottleneck

For fixed-width integer keys, sorting by bytes beats O(n log n) comparisons.

```rust
/// LSD radix sort on u32. O(4n), no comparisons, no allocation beyond two buffers.
pub fn radix_sort_u32(input: &mut [u32]) {
    let mut buf = vec![0u32; input.len()];
    let mut src = input;
    let mut dst = buf.as_mut_slice();

    for shift in (0..32).step_by(8) {
        let mut count = [0usize; 256];
        for &x in src.iter() { count[((x >> shift) & 0xFF) as usize] += 1; }

        let mut sum = 0;
        for c in count.iter_mut() { let t = *c; *c = sum; sum += t; }

        for &x in src.iter() {
            let b = ((x >> shift) & 0xFF) as usize;
            dst[count[b]] = x;
            count[b] += 1;
        }
        std::mem::swap(&mut src, &mut dst);
    }

    if !std::ptr::eq(src.as_ptr(), input.as_ptr()) {
        input.copy_from_slice(src);
    }
}
```

Use it for ids, timestamps and fixed-point prices. Not for floats (handle the sign
bit) and not for strings without a plan.

## Parallel sort

```rust
use rayon::prelude::*;

let mut v: Vec<u64> = (0..10_000_000).rev().collect();
v.par_sort_unstable();          // ~3-4x on 8 cores for large N
```

Parallel sort wins above ~100k elements. Below that, thread overhead dominates.

[[fig:canvas-sort]]

## Selection: the k-th element without sorting

```rust
use rand::Rng;

/// Quickselect: average O(n), worst case O(n²) — same as the library's
/// select_nth_unstable, which uses a better pivot strategy.
pub fn kth_smallest(v: &mut [i32], k: usize) -> i32 {
    let mut lo = 0usize;
    let mut hi = v.len() - 1;
    let mut rng = rand::thread_rng();

    loop {
        if lo == hi { return v[lo]; }
        let pivot = rng.gen_range(lo..=hi);
        v.swap(pivot, hi);

        let mut store = lo;
        for i in lo..hi {
            if v[i] < v[hi] { v.swap(i, store); store += 1; }
        }
        v.swap(store, hi);

        match store.cmp(&k) {
            std::cmp::Ordering::Equal => return v[store],
            std::cmp::Ordering::Less => lo = store + 1,
            std::cmp::Ordering::Greater => hi = store.saturating_sub(1),
        }
    }
}
```

For a p99 latency calculation over 10M samples, `select_nth_unstable` is the right
call — sorting the whole set to read one element is the wrong shape.

## Sorting things that are not `Ord`

```rust
#[derive(Debug)]
struct Row { score: f64, id: u64 }

let mut rows = vec![Row { score: 9.5, id: 1 }, Row { score: 9.5, id: 2 }];

// f64 is not Ord. Two honest options:
rows.sort_by(|a, b| b.score.total_cmp(&a.score).then(a.id.cmp(&b.id)));   // total_cmp handles NaN

// or sort by a key that IS Ord
rows.sort_by_key(|r| std::cmp::Reverse(r.id));
```

`partial_cmp().unwrap()` panics on NaN. `total_cmp` never does — use it for floats.

## Sorting is a design decision

| Situation | Approach |
| --- | --- |
| 10 items, once | `sort_unstable`, forget it |
| 10M items, repeated | radix or `par_sort_unstable` |
| top 10 of 10M | heap, not sort (lesson 07) |
| p99 of 10M | `select_nth_unstable` |
| already mostly sorted | `sort_unstable` detects runs — do not out-think it |
| stable order matters | `sort` |

## Exercises

1. Implement `radix_sort_u32` and benchmark against `sort_unstable` at 10M elements.
2. Use `select_nth_unstable` to compute p50/p95/p99 of 10M latencies and compare
   against a full sort.
3. Sort 1M structs by two keys and verify the ordering is correct for ties.

**Next:** [Threads and pools](../08-concurrency/01-threads-and-pools.md)
