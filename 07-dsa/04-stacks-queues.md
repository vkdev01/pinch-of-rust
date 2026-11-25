# 04 · Stacks, queues and ring buffers

Three structures cover most real work, and all three are contiguous in Rust.

## Stack — `Vec`

```rust
let mut stack = Vec::with_capacity(64);
stack.push(1);
stack.push(2);
assert_eq!(stack.pop(), Some(2));
assert_eq!(stack.last(), Some(&1));
```

A `Vec` used as a stack is the fastest general-purpose stack there is. Use it for
DFS, undo history, and the evaluation stack of an expression parser.

## Queue — `VecDeque`

```rust
use std::collections::VecDeque;

let mut q = VecDeque::with_capacity(1024);
q.push_back(1);
q.push_back(2);
q.push_front(0);                 // O(1), unlike Vec::insert(0, _)
assert_eq!(q.pop_front(), Some(0));
```

`VecDeque` is a ring buffer internally: two indices into one allocation, wrapping.
That is why both ends are O(1).

## Writing the ring buffer yourself

You need this when the queue must be fixed-size and allocation-free — a log buffer,
an audio callback, a market-data feed.

```rust
pub struct Ring<T> {
    buf: Vec<Option<T>>,
    head: usize,     // next write position
    len: usize,
}

impl<T> Ring<T> {
    pub fn new(cap: usize) -> Self {
        let mut buf = Vec::with_capacity(cap);
        buf.resize_with(cap, || None);
        Self { buf, head: 0, len: 0 }
    }

    pub fn capacity(&self) -> usize { self.buf.len() }
    pub fn len(&self) -> usize { self.len }
    pub fn is_full(&self) -> bool { self.len == self.buf.len() }

    /// Overwrites the oldest element when full — the right default for logs.
    pub fn push(&mut self, value: T) {
        let cap = self.buf.len();
        self.buf[self.head] = Some(value);
        self.head = (self.head + 1) % cap;
        self.len = (self.len + 1).min(cap);
    }

    pub fn pop(&mut self) -> Option<T> {
        if self.len == 0 { return None; }
        let cap = self.buf.len();
        let idx = (self.head + cap - self.len) % cap;   // oldest
        self.len -= 1;
        self.buf[idx].take()
    }
}
```

The `% cap` is a modulo per operation. With a power-of-two capacity, `& (cap - 1)`
is a single instruction — worth doing in a hot loop.

## The queue that is a channel

A bounded MPSC channel *is* a queue with backpressure. Prefer it to hand-rolling:

```rust
use tokio::sync::mpsc;

let (tx, mut rx) = mpsc::channel::<Job>(1_000);
// send().await blocks when full -> the producer slows down instead of OOM
```

## Priority queue — `BinaryHeap`

```rust
use std::cmp::Reverse;
use std::collections::BinaryHeap;

let mut max_heap = BinaryHeap::new();
max_heap.push(3); max_heap.push(9);
assert_eq!(max_heap.pop(), Some(9));

// min-heap: wrap in Reverse
let mut min_heap: BinaryHeap<Reverse<u32>> = BinaryHeap::new();
min_heap.push(Reverse(9));
min_heap.push(Reverse(1));
assert_eq!(min_heap.pop(), Some(Reverse(1)));
```

## The pattern these three unlock: the sliding window

Maximum of every window of size k, in O(n) — the classic monotonic deque:

```rust
use std::collections::VecDeque;

fn window_max(nums: &[i32], k: usize) -> Vec<i32> {
    let mut dq: VecDeque<usize> = VecDeque::new();   // indices, values decreasing
    let mut out = Vec::with_capacity(nums.len().saturating_sub(k) + 1);

    for i in 0..nums.len() {
        while dq.front().is_some_and(|&j| j + k <= i) { dq.pop_front(); }
        while dq.back().is_some_and(|&j| nums[j] <= nums[i]) { dq.pop_back(); }
        dq.push_back(i);
        if i + 1 >= k { out.push(nums[*dq.front().unwrap()]); }
    }
    out
}

assert_eq!(window_max(&[1, 3, -1, -3, 5, 3, 6, 7], 3), vec![3, 3, 5, 5, 6, 7]);
```

Two deques in one pass: this is the shape of every "last N seconds" metric
aggregator.

## Where these show up in production

| Structure | Real use |
| --- | --- |
| `Vec` stack | expression parsers, DFS, undo stacks |
| `VecDeque` | BFS frontiers, round-robin schedulers, reconnect buffers |
| ring buffer | market-data feeds, audio callbacks, bounded log tails |
| bounded channel | backpressure between pipeline stages |
| `BinaryHeap` | timers, Dijkstra, top-K queries, rate limiters |

## Exercises

1. Implement the `Ring` with power-of-two masking and benchmark 10M pushes.
2. Write a "last 60 seconds" rate counter using `VecDeque<(Instant, u32)>`.
3. Implement a task scheduler that pops due timers from a `BinaryHeap<Reverse<(Instant, TaskId)>>`.

**Next:** [Hashing and maps](05-hashing.md)
