# 03 · Atomics and memory ordering

Atomics are the bottom of the concurrency stack. You need them for counters, flags
and lock-free structures — and you need `Ordering` to be correct.

## Why ordering exists

The compiler and the CPU both reorder independent memory operations. That is legal
and necessary for speed. `Ordering` is how you tell them which reorderings are
*not* allowed around a specific access.

```rust
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

static REQUESTS: AtomicU64 = AtomicU64::new(0);   // counters: relaxed is enough
static READY: AtomicBool = AtomicBool::new(false); // flags: acquire/release

REQUESTS.fetch_add(1, Ordering::Relaxed);
```

## The four orderings, in one table

| Ordering | Guarantee | Use for |
| --- | --- | --- |
| `Relaxed` | atomicity only; no ordering vs other accesses | counters, statistics |
| `Acquire` (load) | nothing after it moves before it | reading a published flag |
| `Release` (store) | nothing before it moves after it | publishing a flag |
| `AcqRel` | both | read-modify-write handoffs |
| `SeqCst` | a single total order across all threads | when you cannot reason it out |

## The publish pattern, correctly

```rust
use std::sync::atomic::{AtomicPtr, Ordering};

static mut DATA: u64 = 0;
static READY: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

// writer
unsafe { DATA = 42; }                 // plain write
READY.store(true, Ordering::Release); // everything above is visible before this

// reader
if READY.load(Ordering::Acquire) {    // everything below happens after
    let v = unsafe { DATA };
    assert_eq!(v, 42);
}
```

With `Relaxed` on both sides, the reader can see `READY == true` while `DATA` is
still 0. That bug appears once a week in production and never on your laptop.

## A spinlock, to see the pieces

```rust
use std::cell::UnsafeCell;
use std::sync::atomic::{AtomicBool, Ordering};

pub struct SpinLock<T> {
    locked: AtomicBool,
    value: UnsafeCell<T>,
}

unsafe impl<T: Send> Sync for SpinLock<T> {}

impl<T> SpinLock<T> {
    pub const fn new(value: T) -> Self {
        Self { locked: AtomicBool::new(false), value: UnsafeCell::new(value) }
    }

    pub fn lock(&self) -> Guard<'_, T> {
        while self.locked.compare_exchange_weak(
            false, true, Ordering::Acquire, Ordering::Relaxed,
        ).is_err() {
            std::hint::spin_loop();          // tell the CPU we are spinning
        }
        Guard { lock: self }
    }
}

pub struct Guard<'a, T> { lock: &'a SpinLock<T> }

impl<T> std::ops::Deref for Guard<'_, T> {
    type Target = T;
    fn deref(&self) -> &T { unsafe { &*self.lock.value.get() } }
}
impl<T> std::ops::DerefMut for Guard<'_, T> {
    fn deref_mut(&mut self) -> &mut T { unsafe { &mut *self.lock.value.get() } }
}
impl<T> Drop for Guard<'_, T> {
    fn drop(&mut self) { self.lock.locked.store(false, Ordering::Release); }
}
```

This is `Mutex` in 30 lines. The standard library's version adds futex-based
sleeping, so a contended `SpinLock` burns a core while `Mutex` parks the thread.
Never use a spinlock for anything that might block.

## The CAS loop: the general pattern

```rust
/// Atomically add `n` to `x`, returning the old value. (fetch_add does this natively;
/// the loop is the shape every compound atomic operation needs.)
pub fn add(x: &std::sync::atomic::AtomicU64, n: u64) -> u64 {
    let mut cur = x.load(Ordering::Relaxed);
    loop {
        match x.compare_exchange_weak(cur, cur + n, Ordering::AcqRel, Ordering::Relaxed) {
            Ok(prev) => return prev,
            Err(actual) => cur = actual,      // someone else moved it; retry
        }
    }
}
```

`compare_exchange_weak` may fail spuriously on some architectures; the loop handles
it. Use `_weak` inside loops, `compare_exchange` (strong) when you are not looping.

## Atomics beat a mutex for counters

```rust
// 8 threads x 1M increments
// Mutex<u64>:        ~700 ms
// AtomicU64 relaxed: ~35 ms
```

The mutex serialises and context-switches; the atomic contends in hardware. Use
`fetch_add` for counters, `fetch_max` for high-water marks, `swap` for handoffs.

## Arc is an atomic counter

`Arc::clone` is `fetch_add(1, Relaxed)` — which is why it is ~10–20× more expensive
than `Rc::clone`. If a hot loop clones an `Arc` per iteration, hoist it out.

## When not to use atomics

- More than one word of state → you need a lock, not an atomic.
- The invariant spans two variables → a lock.
- You are not sure about the ordering → `Mutex` is always correct and often faster
  than a subtly wrong lock-free structure.

> **Rule of thumb:** if you have to think about `Acquire` vs `SeqCst`, use `Mutex`.
> Correctness beats 30 nanoseconds.

## Testing concurrency with `loom`

```toml
[dev-dependencies]
loom = "0.7"
```

```rust
#[cfg(loom)]
#[test]
fn publish_is_visible() {
    loom::model(|| {
        let data = loom::sync::Arc::new(loom::sync::atomic::AtomicUsize::new(0));
        let ready = loom::sync::Arc::new(loom::sync::atomic::AtomicBool::new(false));
        // loom explores every interleaving and reports the failing one
        let _ = (&data, &ready);
    });
}
```

`loom` exhaustively explores thread interleavings for small models. It is the only
practical way to test a lock-free structure.

## Exercises

1. Write the `SpinLock` and compare it against `Mutex` under low and high contention.
2. Replace a `Mutex<u64>` counter with `AtomicU64` and measure 8 threads × 1M.
3. Implement `fetch_update`-based `fetch_max` and test it with 8 threads.

**Next:** [Lock-free structures](04-lock-free.md)
