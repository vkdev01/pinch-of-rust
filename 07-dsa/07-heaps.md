# 07 · Heaps and priority queues

A heap answers one question fast: *what is the smallest (or largest) thing right
now?* Every scheduler, every top-K query and every shortest-path search is built
on it.

## `BinaryHeap` is a max-heap

```rust
use std::cmp::Reverse;
use std::collections::BinaryHeap;

let mut h = BinaryHeap::new();
h.push(3); h.push(9); h.push(1);
assert_eq!(h.peek(), Some(&9));       // O(1)
assert_eq!(h.pop(), Some(9));         // O(log n)

// min-heap: Reverse is a zero-cost wrapper that flips the ordering
let mut min: BinaryHeap<Reverse<u32>> = BinaryHeap::new();
min.push(Reverse(5));
min.push(Reverse(2));
assert_eq!(min.pop(), Some(Reverse(2)));
```

It is a `Vec` underneath, arranged as a complete binary tree: parent at `i`, children
at `2i+1` and `2i+2`. No pointers, no allocation per element, and `into_sorted_vec()`
gives you a sorted `Vec` with no extra allocation.

## Top-K without sorting everything

```rust
/// The k largest values, in O(n log k) and O(k) memory.
pub fn top_k<I: IntoIterator<Item = i64>>(items: I, k: usize) -> Vec<i64> {
    let mut heap: std::collections::BinaryHeap<std::cmp::Reverse<i64>> =
        std::collections::BinaryHeap::with_capacity(k + 1);

    for x in items {
        heap.push(std::cmp::Reverse(x));
        if heap.len() > k {
            heap.pop();                     // drop the smallest of the kept k
        }
    }
    let mut out: Vec<i64> = heap.into_iter().map(|r| r.0).collect();
    out.sort_unstable_by(|a, b| b.cmp(a));
    out
}

assert_eq!(top_k(0..10, 3), vec![9, 8, 7]);
```

Sorting 100M rows to find 10 is a classic waste. This is O(n log k) with a tiny
working set — and it is the same code a "top 10 slowest endpoints" dashboard needs.

## The scheduler pattern

Timers are a min-heap keyed by deadline:

```rust
use std::cmp::Reverse;
use std::collections::BinaryHeap;
use std::time::{Duration, Instant};

struct Timer { at: Instant, id: u64 }

impl PartialEq for Timer { fn eq(&self, o: &Self) -> bool { self.at == o.at } }
impl Eq for Timer {}
impl PartialOrd for Timer { fn partial_cmp(&self, o: &Self) -> Option<std::cmp::Ordering> { Some(self.cmp(o)) } }
impl Ord for Timer { fn cmp(&self, o: &Self) -> std::cmp::Ordering { self.at.cmp(&o.at) } }

pub struct Scheduler {
    heap: BinaryHeap<Reverse<Timer>>,
    next_id: u64,
}

impl Scheduler {
    pub fn new() -> Self { Self { heap: BinaryHeap::new(), next_id: 1 } }

    pub fn schedule_in(&mut self, d: Duration) -> u64 {
        let id = self.next_id;
        self.next_id += 1;
        self.heap.push(Reverse(Timer { at: Instant::now() + d, id }));
        id
    }

    /// Fire everything that is due. Returns the ids that fired.
    pub fn advance(&mut self) -> Vec<u64> {
        let now = Instant::now();
        let mut fired = Vec::new();
        while let Some(Reverse(t)) = self.heap.peek() {
            if t.at > now { break; }
            fired.push(self.heap.pop().unwrap().0.id);
        }
        fired
    }
}
```

`tokio::time` is this structure with a hierarchical timing wheel on top, because a
heap with 1M timers has a poor constant factor. For 10,000 timers, a heap is fine.

## Dijkstra's frontier

```rust
use std::cmp::Reverse;
use std::collections::BinaryHeap;

/// adjacency[i] = [(neighbour, weight)]
pub fn dijkstra(adj: &[Vec<(usize, u64)>], start: usize) -> Vec<u64> {
    const INF: u64 = u64::MAX;
    let mut dist = vec![INF; adj.len()];
    let mut heap = BinaryHeap::new();

    dist[start] = 0;
    heap.push(Reverse((0u64, start)));

    while let Some(Reverse((d, u))) = heap.pop() {
        if d > dist[u] { continue; }          // stale entry, skip
        for &(v, w) in &adj[u] {
            let nd = d + w;
            if nd < dist[v] {
                dist[v] = nd;
                heap.push(Reverse((nd, v)));
            }
        }
    }
    dist
}
```

The `if d > dist[u] { continue }` line is what makes the "lazy deletion" variant
correct — stale heap entries are simply ignored rather than removed.

## Where heaps decide system behaviour

| System | Heap usage |
| --- | --- |
| Rate limiter | earliest-allowed-time queue |
| Job scheduler | due-time priority queue |
| Load balancer | least-connections selection |
| Search ranking | top-K merge across shards |
| Log compaction | smallest-SSTable-first merge |
| Dijkstra / A* | frontier |

## Exercises

1. Implement `top_k` and compare against `sort_unstable` at 10M items for k = 10.
2. Build the `Scheduler` and drive 1M timers, measuring `advance()` cost.
3. Add A* (heuristic) on top of the Dijkstra code and compare nodes visited on a grid.

**Next:** [Graphs](08-graphs.md)
