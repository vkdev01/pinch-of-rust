# 02 · Synchronisation primitives

Six primitives cover everything: `Mutex`, `RwLock`, `Condvar`, `Barrier`, `OnceLock`
and channels. Choosing the right one is the difference between a lock and a design.

## `Mutex` — exclusive access

```rust
use std::sync::{Arc, Mutex};

let counter = Arc::new(Mutex::new(0u64));
let handles: Vec<_> = (0..8).map(|_| {
    let c = Arc::clone(&counter);
    std::thread::spawn(move || {
        for _ in 0..10_000 {
            *c.lock().unwrap() += 1;
        }
    })
}).collect();
for h in handles { h.join().unwrap(); }

assert_eq!(*counter.lock().unwrap(), 80_000);
```

The guard is RAII: the lock releases when the `MutexGuard` drops, including on
panic. That is why Rust has no `finally { unlock() }` bug class.

### Poisoning

A panic while holding the lock marks it poisoned. Later `lock()` returns `Err`.

```rust
// for counters and caches, the data is usually still usable
let guard = mutex.lock().unwrap_or_else(|e| e.into_inner());
```

### The lock granularity trap

```rust
// BAD: holds the lock across I/O — every other thread waits on the network
let mut g = state.lock().unwrap();
let row = fetch_from_db(&g.pool, g.id).await;

// GOOD: copy out, drop, then work
let id = { state.lock().unwrap().id };
let row = fetch_from_db(id).await;
```

## `RwLock` — many readers, one writer

```rust
use std::sync::RwLock;

let cfg = RwLock::new(load_config());
let workers = cfg.read().unwrap().workers;      // concurrent
*cfg.write().unwrap() = reload();               // exclusive
```

Use it when reads vastly outnumber writes **and** the critical section is long
enough for contention to matter. For a 3-field struct read once, `Mutex` is faster —
`RwLock` pays for reader counting on every access.

## `Condvar` — wait for a condition

A mutex says "not now". A condvar says "wake me when this becomes true".

```rust
use std::sync::{Arc, Condvar, Mutex};
use std::collections::VecDeque;

pub struct BlockingQueue<T> {
    inner: Mutex<VecDeque<T>>,
    cv: Condvar,
    cap: usize,
}

impl<T> BlockingQueue<T> {
    pub fn new(cap: usize) -> Self {
        Self { inner: Mutex::new(VecDeque::with_capacity(cap)), cv: Condvar::new(), cap }
    }

    pub fn push(&self, value: T) {
        let mut q = self.inner.lock().unwrap();
        while q.len() == self.cap {
            q = self.cv.wait(q).unwrap();       // releases the lock while waiting
        }
        q.push_back(value);
        self.cv.notify_one();
    }

    pub fn pop(&self) -> T {
        let mut q = self.inner.lock().unwrap();
        while q.is_empty() {
            q = self.cv.wait(q).unwrap();
        }
        let v = q.pop_front().unwrap();
        self.cv.notify_one();
        v
    }
}
```

Two rules, both mandatory:

1. **Always re-check the condition in a `while` loop.** Spurious wakeups are real.
2. **`wait` takes the guard and returns it** — it releases the lock atomically, which
   is why you cannot deadlock between the check and the wait.

## `Barrier` — synchronise a phase

```rust
use std::sync::{Arc, Barrier};

let barrier = Arc::new(Barrier::new(4));
let handles: Vec<_> = (0..4).map(|i| {
    let b = Arc::clone(&barrier);
    std::thread::spawn(move || {
        // phase 1: every thread computes its slice
        let partial = (i * 100) as u64;
        // wait until all four have finished phase 1
        let idx = b.wait();
        // phase 2: read the shared result
        println!("thread {i} released at position {idx}, saw {partial}");
    })
}).collect();
for h in handles { h.join().unwrap(); }
```

This is how SIMD-style parallel algorithms do their iteration steps.

## `OnceLock` — initialise once, read forever

```rust
use std::sync::OnceLock;

static CONFIG: OnceLock<Config> = OnceLock::new();

fn config() -> &'static Config {
    CONFIG.get_or_init(|| Config::from_env().expect("config"))
}
```

`LazyLock` is the same thing with the initialiser inline:

```rust
use std::sync::LazyLock;
static RE: LazyLock<regex::Regex> = LazyLock::new(|| regex::Regex::new(r"^\d+$").unwrap());
```

Both are lock-free after the first call. Never use `static mut`.

## Channels — pass messages, not locks

```rust
use std::sync::mpsc;

let (tx, rx) = mpsc::sync_channel::<String>(100);   // bounded: backpressure

std::thread::spawn(move || {
    for i in 0..5 { let _ = tx.send(format!("job {i}")); }
});

for msg in rx { println!("{msg}"); }
```

| Primitive | Reach for it when |
| --- | --- |
| `Mutex<T>` | shared mutable state, short critical section |
| `RwLock<T>` | read-heavy shared state |
| `Condvar` | a thread must wait for a state change |
| `Barrier` | parallel phases must rendezvous |
| `OnceLock` | global initialised at startup |
| channel | ownership moves between threads; backpressure needed |
| atomics | counters, flags, single-word state |

## Deadlock: three shapes and their fixes

```rust
// 1. lock ordering — two threads take the same two locks in opposite order
//    FIX: one documented global order, or never hold two locks

// 2. lock across await — task holds a guard while awaiting, other tasks starve
//    FIX: scope the guard; use tokio::sync::Mutex only if you must hold across await

// 3. self-deadlock — a &mut method takes the lock it already holds
//    FIX: private unlocked internals, public locked wrappers
```

```rust
// the self-deadlock pattern, in full
struct State { inner: std::sync::Mutex<Inner> }

impl State {
    fn a(&self) { let mut g = self.inner.lock().unwrap(); self.b(&mut g); }   // ok
    fn b(&self, g: &mut Inner) { g.x += 1; }                                   // takes the guard
    // fn b(&self) { self.inner.lock()... }  <- deadlock if called from `a`
}
```

## Exercises

1. Implement `BlockingQueue` and prove no message is lost with 4 producers and 4 consumers.
2. Write a `RwLock`-based config cache and benchmark against `Mutex` under 95% reads.
3. Deliberately deadlock two mutexes, then fix it with a lock order and a comment.

**Next:** [Atomics and memory ordering](03-atomics.md)
