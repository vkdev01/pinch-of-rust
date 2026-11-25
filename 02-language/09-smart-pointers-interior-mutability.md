# 09 · Smart Pointers and Interior Mutability

A smart pointer is a struct that owns data and implements `Deref` (so it behaves
like a reference) and usually `Drop` (so it frees on scope exit). Rust has no
garbage collector — these types give you the specific sharing and lifetime
semantics you ask for.

## The cast

| Type | Ownership | Mutability | Thread-safe | Cost |
| --- | --- | --- | --- | --- |
| `Box<T>` | unique | as inner | if `T: Send` | one allocation |
| `Rc<T>` | shared, counted | immutable only | no | counter ++/-- |
| `Arc<T>` | shared, atomic counted | immutable only | yes | atomic ++/-- |
| `Cell<T>` | owns | `Copy` in/out, no borrow | no | zero |
| `RefCell<T>` | owns | runtime-checked `&mut` | no | one flag |
| `Mutex<T>` | owns | runtime-locked `&mut` | yes | lock/unlock |
| `RwLock<T>` | owns | many readers / one writer | yes | lock/unlock |
| `Cow<'a, T>` | borrowed or owned | write-on-clone | yes | enum |

## `Box<T>`

Heap allocation with a single owner. Three real uses:

```rust
// 1. Recursive types — the size must be known at compile time
#[derive(Debug)]
enum List {
    Cons(i32, Box<List>),
    Nil,
}

// 2. Trait objects
let handler: Box<dyn Fn(i32) -> i32> = Box::new(|x| x * 2);

// 3. Large values you want to move cheaply
struct Big([u8; 1_000_000]);
let b = Box::new(Big([0; 1_000_000]));   // moving b copies 8 bytes, not 1 MB
```

```rust
let x = Box::new(5);
println!("{}", *x);       // deref
println!("{}", x + 1);    // auto-deref in arithmetic
```

`Box<dyn Error>` is the classic "I don't care what the error type is" return:

```rust
fn run() -> Result<(), Box<dyn std::error::Error>> {
    let n: i32 = "42".parse()?;
    std::fs::write("out.txt", n.to_string())?;
    Ok(())
}
```

## `Rc<T>` — shared ownership, single thread

```rust
use std::rc::Rc;

let a = Rc::new(String::from("shared"));
let b = Rc::clone(&a);        // increments the count — cheap, no data copy
let c = a.clone();            // same thing

println!("count = {}", Rc::strong_count(&a));   // 3
drop(b);
println!("count = {}", Rc::strong_count(&a));   // 2
```

`Rc::clone` is idiomatic — writing it that way signals "this is a reference-count
bump, not a deep copy".

> **Gotcha:** `Rc<T>` gives shared *immutable* access only. To mutate you need
> `Rc<RefCell<T>>`. And `Rc` is **not** `Send` — using it across threads is a
> compile error, which is exactly the protection you want.

### Reference cycles leak

```rust
// parent -> child -> parent = never freed
struct Node {
    next: RefCell<Option<Rc<Node>>>,
    prev: RefCell<Option<Rc<Node>>>,   // cycle!
}
```

Break cycles with `Weak<T>`:

```rust
use std::rc::Weak;

struct Node {
    next: RefCell<Option<Rc<Node>>>,
    prev: RefCell<Option<Weak<Node>>>,  // weak: does not keep the parent alive
}

let weak: Weak<Node> = Rc::downgrade(&parent);
if let Some(p) = weak.upgrade() { /* parent still alive */ }
```

`Weak::upgrade` returns `Option<Rc<T>>` — `None` if the value has been dropped.

## `Arc<T>` — shared ownership across threads

```rust
use std::sync::Arc;

let data = Arc::new(vec![1, 2, 3]);
let mut handles = Vec::new();

for _ in 0..4 {
    let data = Arc::clone(&data);
    handles.push(std::thread::spawn(move || data.iter().sum::<i32>()));
}

let total: i32 = handles.into_iter().map(|h| h.join().unwrap()).sum();
assert_eq!(total, 24);
```

`Arc` costs one atomic increment per clone, which is ~10–20× more expensive than
`Rc`'s plain increment. Use `Rc` when you are single-threaded.

## Interior mutability: `Cell` and `RefCell`

Sometimes you need to mutate through a `&T`. The borrow checker cannot see that
your usage is safe, so `Cell`/`RefCell` move the check to runtime.

### `Cell<T>` — copy in, copy out

```rust
use std::cell::Cell;

struct Counter { n: Cell<u32> }

impl Counter {
    fn bump(&self) { self.n.set(self.n.get() + 1); }   // &self, not &mut self
}

let c = Counter { n: Cell::new(0) };
c.bump();
c.bump();
assert_eq!(c.n.get(), 2);
```

Zero runtime cost — `Cell` just allows the write. Works for `Copy` types (or
`replace`/`take` for others). No references into the cell, which is why it is
free.

### `RefCell<T>` — runtime-checked borrows

```rust
use std::cell::RefCell;

let v = RefCell::new(vec![1, 2, 3]);

v.borrow_mut().push(4);            // runtime borrow
println!("{:?}", v.borrow());      // shared borrow

let a = v.borrow();
let b = v.borrow_mut();            // PANICS at runtime: already borrowed
```

The panic message is `already borrowed: BorrowMutError` (or
`already mutably borrowed: BorrowError`). Try `try_borrow` / `try_borrow_mut`
for a `Result` instead of a panic.

### The `Rc<RefCell<T>>` idiom

Shared *and* mutable, single thread. This is what a graph, an observer list, or
a DOM-like tree looks like in Rust.

```rust
use std::cell::RefCell;
use std::rc::Rc;

#[derive(Debug)]
struct Task {
    name: String,
    done: bool,
    subtasks: Vec<Rc<RefCell<Task>>>,
}

fn complete(t: &Rc<RefCell<Task>>) {
    t.borrow_mut().done = true;
    for s in &t.borrow().subtasks {
        complete(s);            // note: borrow released before recursing
    }
}

fn main() {
    let leaf = Rc::new(RefCell::new(Task { name: "leaf".into(), done: false, subtasks: vec![] }));
    let root = Rc::new(RefCell::new(Task {
        name: "root".into(), done: false, subtasks: vec![Rc::clone(&leaf)],
    }));
    complete(&root);
    assert!(leaf.borrow().done);
}
```

> **Gotcha:** holding a `borrow()` across a call that also borrows mutably is
> the classic `RefCell` panic. Collect into a `Vec` first, or drop the guard
> explicitly (`drop(guard)`) before recursing.

## `Mutex` and `RwLock`

```rust
use std::sync::{Arc, Mutex};

let counter = Arc::new(Mutex::new(0u64));
let mut handles = Vec::new();

for _ in 0..8 {
    let c = Arc::clone(&counter);
    handles.push(std::thread::spawn(move || {
        for _ in 0..1000 {
            *c.lock().unwrap() += 1;
        }
    }));
}
for h in handles { h.join().unwrap(); }
assert_eq!(*counter.lock().unwrap(), 8000);
```

`lock()` returns a `MutexGuard` — a RAII lock that releases on drop. It also
gives you `&mut T`, which is how `Mutex` provides mutation.

```rust
// prefer try_lock in async code — never block the executor
if let Ok(mut g) = m.try_lock() { *g += 1; }
```

### Mutex poisoning

If a thread panics while holding the lock, the mutex is **poisoned** and every
later `lock()` returns `Err`. `.unwrap()` then cascades the panic.

```rust
// accept the data anyway — usually the right call for counters/caches
let guard = m.lock().unwrap_or_else(|e| e.into_inner());
```

### `RwLock` vs `Mutex`

```rust
use std::sync::RwLock;
let cfg = RwLock::new(load());
let n = cfg.read().unwrap().workers;      // many readers in parallel
*cfg.write().unwrap() = reload();          // one writer, exclusive
```

Use `RwLock` when reads vastly outnumber writes **and** the critical section is
long enough for contention to matter. For short critical sections, `Mutex` is
usually faster (no reader-counting overhead). Measure.

## Atomics

For counters and flags, atomics beat a mutex by a wide margin.

```rust
use std::sync::atomic::{AtomicU64, AtomicBool, Ordering};

static REQUESTS: AtomicU64 = AtomicU64::new(0);
static READY: AtomicBool = AtomicBool::new(false);

REQUESTS.fetch_add(1, Ordering::Relaxed);
if READY.load(Ordering::Acquire) { /* ... */ }
READY.store(true, Ordering::Release);
```

| Ordering | Guarantee | Use |
| --- | --- | --- |
| `Relaxed` | atomicity only | counters, stats |
| `Acquire` / `Release` | pairs: a load sees everything before the matching store | flags, handoff |
| `SeqCst` | total order across all threads | when in doubt |

> **Rule of thumb:** `Relaxed` for statistics, `Acquire`/`Release` for
> publication of data, `SeqCst` only if you cannot reason about it.

## `Cow<'a, T>` — clone on write

```rust
use std::borrow::Cow;

fn normalise(input: &str) -> Cow<'_, str> {
    if input.contains('\t') {
        Cow::Owned(input.replace('\t', "    "))   // allocates only if needed
    } else {
        Cow::Borrowed(input)                      // zero cost
    }
}
```

Ideal for "usually no change" transformations: config parsing, HTML escaping,
path normalisation. Used heavily by `serde` and `regex`.

## Choosing, in one table

| Need | Use |
| --- | --- |
| Recursive type or trait object | `Box<T>` |
| Share read-only, one thread | `Rc<T>` |
| Share read-only, many threads | `Arc<T>` |
| Mutate through `&self`, one thread, `Copy` data | `Cell<T>` |
| Mutate through `&self`, one thread, complex data | `RefCell<T>` |
| Mutate through `&self`, many threads | `Mutex<T>` / `RwLock<T>` |
| Simple counter/flag, many threads | `Atomic*` |
| Usually borrowed, sometimes owned | `Cow<'a, T>` |
| Global config, init once | `OnceLock<T>` / `LazyLock<T>` |

> **Rule of thumb:** if your design needs `Rc<RefCell<...>>` in three places,
> the data model is probably wrong. Re-read module 02.03 and ask who really
> owns what. Interior mutability is a scalpel, not a general-purpose tool.

## A worked example: a shared cache with `Arc<RwLock<HashMap>>`

```rust
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

#[derive(Clone)]
struct CacheEntry { value: String, at: Instant }

#[derive(Clone)]
struct Cache {
    inner: Arc<RwLock<HashMap<String, CacheEntry>>>,
    ttl: Duration,
}

impl Cache {
    fn new(ttl: Duration) -> Self {
        Self { inner: Arc::new(RwLock::new(HashMap::new())), ttl }
    }

    fn get(&self, key: &str) -> Option<String> {
        let g = self.inner.read().ok()?;
        let e = g.get(key)?;
        if e.at.elapsed() > self.ttl { return None; }
        Some(e.value.clone())
    }

    fn put(&self, key: &str, value: &str) {
        if let Ok(mut g) = self.inner.write() {
            g.insert(key.to_string(), CacheEntry { value: value.into(), at: Instant::now() });
        }
    }
}

fn main() {
    let cache = Cache::new(Duration::from_secs(60));
    cache.put("a", "1");
    assert_eq!(cache.get("a").as_deref(), Some("1"));

    let c = cache.clone();          // cheap: Arc bump
    std::thread::spawn(move || c.put("b", "2")).join().unwrap();
    assert_eq!(cache.get("b").as_deref(), Some("2"));
}
```

`#[derive(Clone)]` on a struct holding an `Arc` clones the *handle*, not the
data. That is why `cache.clone()` is safe and free to pass into threads.

---

## Exercises

1. Write a recursive `Tree` enum using `Box` and a `depth()` method.
2. Convert an `Rc<RefCell<T>>` linked list to use `Weak` for the back-pointer
   and prove the cycle is broken by printing `Rc::strong_count`.
3. Implement a thread-safe counter three ways — `Mutex<u64>`, `AtomicU64`, and
   `RwLock<u64>` — and benchmark 8 threads × 1M increments.
4. Write `fn sanitise(s: &str) -> Cow<'_, str>` that strips control characters.
   Assert it borrows for clean input.
5. Build a `LazyLock<HashMap<&str, &str>>` for a static lookup table.
6. Explain why `Rc<T>` cannot be sent to another thread, and what the compiler
   error says.

**Next:** [Concurrency](10-concurrency.md)
