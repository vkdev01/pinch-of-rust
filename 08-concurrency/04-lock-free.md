# 04 · Lock-free structures

Lock-free means: at least one thread always makes progress. It is not a synonym for
"faster" — it is a property you trade complexity for, and only when a profile says
the lock is the bottleneck.

## The single most useful lock-free structure: SPSC ring

One producer, one consumer, fixed size, no allocation after construction. This is
the market-data feed, the audio buffer, the logging channel.

```rust
use std::cell::UnsafeCell;
use std::sync::atomic::{AtomicUsize, Ordering};

/// Bounded single-producer / single-consumer queue. Capacity must be a power of two.
pub struct Spsc<T> {
    buf: Box<[UnsafeCell<Option<T>>]>,
    mask: usize,
    head: AtomicUsize,   // written by the producer
    tail: AtomicUsize,   // written by the consumer
}

unsafe impl<T: Send> Sync for Spsc<T> {}

impl<T> Spsc<T> {
    pub fn new(cap: usize) -> Self {
        assert!(cap.is_power_of_two(), "capacity must be a power of two");
        let buf = (0..cap).map(|_| UnsafeCell::new(None)).collect::<Vec<_>>().into_boxed_slice();
        Self { buf, mask: cap - 1, head: AtomicUsize::new(0), tail: AtomicUsize::new(0) }
    }

    /// Producer only. Returns the value back if the queue is full.
    pub fn push(&self, value: T) -> Result<(), T> {
        let head = self.head.load(Ordering::Relaxed);
        let next = (head + 1) & self.mask;

        // acquire: see the consumer's progress before overwriting a slot
        if next == self.tail.load(Ordering::Acquire) {
            return Err(value);                       // full
        }
        unsafe { *self.buf[head].get() = Some(value); }

        // release: the slot write above is visible before the new head
        self.head.store(next, Ordering::Release);
        Ok(())
    }

    /// Consumer only.
    pub fn pop(&self) -> Option<T> {
        let tail = self.tail.load(Ordering::Relaxed);
        if tail == self.head.load(Ordering::Acquire) {
            return None;                             // empty
        }
        let value = unsafe { (*self.buf[tail].get()).take() };
        self.tail.store((tail + 1) & self.mask, Ordering::Release);
        value
    }
}
```

Three details that make it correct and fast:

- **`& self.mask` instead of `% cap`** — one AND instruction, no division.
- **Relaxed on your own index** — only you write it, so no ordering needed.
- **Acquire/Release on the other side's index** — that is the actual handoff.

> **Gotcha:** SPSC is not MPSC. Two producers on this structure corrupt each other.
> For many producers, use `crossbeam::channel` or `flume`, which implement the real
> thing.

## Batching: where the real win is

```rust
// 1 item per atomic op = ~20 ns of overhead per item
while let Some(x) = q.pop() { process(x); }

// amortise the atomic cost over a batch
let mut batch = Vec::with_capacity(64);
loop {
    batch.clear();
    while batch.len() < 64 {
        match q.pop() { Some(x) => batch.push(x), None => break }
    }
    if batch.is_empty() { break; }
    process_batch(&batch);
}
```

In a market-data handler, batching is often a bigger win than the lock-free
structure itself.

## The ABA problem

```text
Thread A reads value 5.
Thread B changes 5 -> 7 -> 5.
Thread A's CAS(5 -> 6) succeeds, believing nothing changed.
```

A's assumption ("if it is still 5, nothing happened") is false. Fixes:

1. **A counter alongside the pointer** — pack `(version, index)` into a `u64` and CAS
   the whole word.
2. **Hazard pointers / epoch reclamation** (`crossbeam-epoch`) — the standard answer
   for reusing memory.
3. **Do not free** — bump-allocate and never reuse (fine for a fixed-size feed).

```rust
/// Versioned index: 32-bit index + 32-bit counter in one atomic word.
#[derive(Clone, Copy)]
struct Tagged(u64);

impl Tagged {
    fn new(index: u32, version: u32) -> Self { Tagged(((version as u64) << 32) | index as u64) }
    fn index(self) -> u32 { self.0 as u32 }
    fn version(self) -> u32 { (self.0 >> 32) as u32 }
    fn bump(self, index: u32) -> Self { Tagged::new(index, self.version().wrapping_add(1)) }
}
```

## Use the library, not your own

| Need | Crate |
| --- | --- |
| MPMC channels | `crossbeam-channel`, `flume` |
| concurrent map | `dashmap`, `papaya` |
| epoch reclamation | `crossbeam-epoch` |
| lock-free queue/stack | `crossbeam-queue` |
| atomics for wide types | `portable-atomic` |
| async-aware primitives | `tokio::sync` |

Every one of these has years of bug reports behind it. Writing your own is a
research project, not a task.

## When lock-free is the wrong answer

- The critical section is long (>100 ns): a lock is faster, because contention cost
  grows with retry length.
- You have more than ~4 threads on the same word: cache-line ping-pong dominates.
- You need a multi-word invariant: you want a lock.
- You cannot test it: untested lock-free code is a latent outage.

> **Rule of thumb:** measure the mutex first. If it is not the bottleneck, lock-free
> buys you nothing and costs you a week.

## Testing: `loom` and stress

```rust
// loom explores interleavings; a stress test explores timing
#[test]
fn stress_spsc() {
    let q = std::sync::Arc::new(Spsc::new(1024));
    let producer = { let q = q.clone(); std::thread::spawn(move || {
        for i in 0..1_000_000u64 {
            while q.push(i).is_err() { std::hint::spin_loop(); }
        }
    })};

    let mut seen = 0u64;
    while seen < 1_000_000 {
        if q.pop().is_some() { seen += 1; }
    }
    producer.join().unwrap();
    assert_eq!(seen, 1_000_000);
}
```

Run the stress test under `cargo +nightly miri test` for the small cases and on a
loaded machine for the large ones.

## Exercises

1. Implement `Spsc` and push/pop 10M items between two threads; measure throughput.
2. Add a batch API (`push_batch`, `pop_batch`) and compare against one-at-a-time.
3. Break the SPSC by adding a second producer, observe the corruption, then fix it
   with `crossbeam::channel`.

**Next:** [Parallel data patterns](05-parallel-patterns.md)
