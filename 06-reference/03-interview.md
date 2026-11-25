# 03 · Interview Questions with Answers

Grouped by depth. The answers are the short version you would actually say out
loud; each points at the module with the detail.

## Fundamentals

**What are the three ownership rules?**

Every value has exactly one owner; there is only one owner at a time; when the
owner goes out of scope the value is dropped. Together they give memory safety
without a garbage collector.

**What is the difference between `&T` and `&mut T`?**

`&T` is a shared, read-only borrow — many may exist at once. `&mut T` is an
*exclusive* borrow — exactly one, and no shared borrows may coexist. The
exclusivity is what makes data races impossible to express.

**Why can't you have `&mut` and `&` at the same time?**

Because the compiler's guarantee to a `&mut` holder is "nobody else can observe
this value". Without it, `&mut` could not be optimised or safely sent across
threads.

**What does the borrow checker actually check?**

That every reference is valid for its whole use (no dangling), and that
aliasing-plus-mutation never happens simultaneously. It does this with lifetimes,
which are regions of code, not runtime values.

**When do you need explicit lifetimes?**

When the compiler cannot infer which input a returned reference derives from —
typically a function with two or more reference inputs returning a reference, or a
struct storing a reference.

**`String` vs `&str`?**

`String` owns a heap buffer and is growable. `&str` is a borrowed view (pointer +
length) into UTF-8 owned by someone else. Take `&str` in parameters; return
`String` when you must allocate.

**Why can't you index a `String` with `s[0]`?**

Because a `String` is UTF-8 and there is no single obvious meaning for "element
0" — byte 0, code point 0, or grapheme 0 all differ. Use `chars()`, `bytes()`, or
`s.get(0..n)` which returns `Option`.

**`Option<T>` vs `null`?**

`Option` is an enum in the type system: the compiler forces you to handle `None`.
There is no implicit null, no `NullPointerException`, and `Option<&T>` costs
nothing extra thanks to niche optimisation.

## Type system

**`impl Trait` vs `dyn Trait`?**

`impl Trait` is static dispatch — monomorphised per type, inlined, zero cost, but
cannot hold heterogeneous values. `dyn Trait` is a fat pointer with a vtable —
one indirect call, one copy of the code, works in a `Vec<Box<dyn Trait>>`.

**What is monomorphisation, and its downside?**

Generics are compiled once per concrete type, which is why they are fast. The
costs are binary size and compile time.

**What makes a trait object-safe?**

No generic methods, no methods returning `Self`, no associated constants. Anything
that would require knowing the concrete type at the call site breaks the vtable.

**Associated type vs generic parameter?**

An associated type allows exactly one implementation per type (`Iterator::Item`).
A generic parameter allows several (`Add<i32>` and `Add<f64>`).

**What does `Sized` mean, and why `?Sized`?**

`Sized` means the size is known at compile time. `str`, `[T]` and `dyn Trait` are
unsized, so a generic taking them by value needs `?Sized` and a reference.

**Why can't you implement a foreign trait for a foreign type?**

The orphan rule: at least one of the trait or the type must be local to your
crate. It prevents two crates from providing conflicting impls.

## Memory and pointers

**`Box` vs `Rc` vs `Arc`?**

`Box` is unique ownership with one heap allocation. `Rc` is reference-counted
sharing on one thread (non-atomic counter). `Arc` is the atomic version, safe
across threads, ~10–20× more expensive to clone.

**When do you need `RefCell`?**

When you must mutate through a shared reference and cannot express it with the
compile-time borrow checker — e.g. a graph or an observer list. Borrows are
checked at runtime and panic on violation.

**What is interior mutability, and its cost?**

Mutating through `&T` using `Cell`/`RefCell`/`Mutex`/atomics. `Cell` is free;
`RefCell` costs a runtime flag check; `Mutex` costs a lock.

**How do you leak memory in safe Rust?**

Create an `Rc` cycle. Two `Rc`s pointing at each other never reach zero. Break it
with `Weak`.

**What is `Drop`, and when does it run?**

A destructor trait, run when the owner goes out of scope, in reverse declaration
order, including during unwinding from a panic. It is why RAII works for locks,
files and transactions.

## Concurrency

**`Send` vs `Sync`?**

`Send`: the value can be moved to another thread. `Sync`: `&T` can be shared
between threads. `Rc` is neither; `Arc<T>` is both when `T: Send + Sync`.

**How does Rust prevent data races?**

A data race needs two threads, one writing, no synchronisation. That requires
`&mut` accessible from two threads, or a shared borrow alongside a mutation —
both forbidden. `Send`/`Sync` extend the argument across thread boundaries.

**`Mutex<T>` vs `RwLock<T>`?**

`Mutex` allows one accessor of any kind; `RwLock` allows many readers or one
writer. `RwLock` only wins when reads dominate and critical sections are long
enough for contention to matter.

**What is mutex poisoning?**

If a thread panics while holding the lock, the mutex is marked poisoned and later
`lock()` calls return `Err`. `into_inner()` on the error recovers the data.

**Threads vs async — when each?**

Threads for CPU-bound work and a small number of long-running tasks; async for
many concurrent I/O waits. Async multiplexes waiting; it does not speed up
computation.

**What does `async fn` return, and when does it run?**

A `Future` — a state machine. Nothing runs until something polls it (`.await` or a
runtime).

**Why must futures be `Pin`ned?**

A future's states may contain references into itself. Moving it after polling
would invalidate those references, so `Pin` guarantees a stable address.

**What happens when you `select!` and one branch loses?**

The losing future is **dropped**, which is cancellation. If it was mid-operation,
you can get a partial write — which is why non-cancellable work should be spawned.

## Errors and API design

**`panic!` vs `Result`?**

`panic!` is for programmer errors and violated invariants. `Result` is for
expected failures the caller can act on. "File not found" is a `Result`;
"index out of bounds in code that checked the length" is a panic.

**`thiserror` vs `anyhow`?**

`thiserror` derives a typed error enum for libraries — callers can match on
variants. `anyhow` is a boxed dynamic error with context for applications.
Never expose `anyhow` in a public library API.

**Why `#[non_exhaustive]` on a public error enum?**

So you can add variants without a breaking change, since downstream `match`es are
not exhaustive.

**Why should a handler return a generic message on 5xx?**

To avoid leaking internals (SQL text, file paths, stack frames) to a client. Log
the real error server-side.

**What is a smart constructor?**

A `fn parse(...) -> Result<Email, Error>` that validates and returns a newtype. It
makes invalid states unrepresentable: any `Email` in the type system is valid.

## Performance

**Why are iterators as fast as loops?**

After inlining, the iterator chain becomes the same machine code, minus the bounds
checks that the compiler can now prove unnecessary.

**What are zero-cost abstractions here, and which are not?**

Free: iterators, generics, newtypes, `Option<&T>`. Not free: `dyn` dispatch,
`Box`/`Rc`/`Arc`, `format!`, `RefCell`, `clone()`.

**How would you find a performance problem?**

Profile first: `perf` or `cargo flamegraph`, or `samply` for async. Find the widest
leaf frame. Only then change code, and re-measure with criterion.

**When is `clone()` the wrong answer?**

When it hides a design problem — usually a function that should borrow instead of
own, or a struct that should hold an `Arc`.

**What is the biggest single performance win available?**

Choosing the right algorithm and data structure. `HashSet` instead of a linear
scan is 1000×; no compiler flag competes.

## Ecosystem and practice

**How do you structure a large Rust project?**

A workspace with a `domain` crate that has no I/O (fast tests, stable API), plus
`api` and `worker` binaries. Logic in `lib.rs`, `main.rs` thin.

**What does `cargo clippy -D warnings` in CI buy you?**

A consistent floor of idiom and a class of bugs caught before review —
`redundant_clone`, `ptr_arg`, `large_enum_variant`, `unwrap_used`.

**How do you test an HTTP handler without a network?**

`app.oneshot(request)` with `tower::ServiceExt`. It runs routing, extractors,
middleware and error mapping in-process.

**How do you handle schema changes safely?**

Migrations that are additive and reversible: add nullable columns, backfill, then
constrain. `CREATE INDEX CONCURRENTLY` for large tables. Never edit an applied
migration — checksums will reject it.

**Why commit `Cargo.lock` for a binary?**

Reproducible builds. `cargo build --locked` in CI then fails if a dependency would
change, which is exactly the alert you want.

## Questions to ask them

A good signal in an interview is asking about the hard parts:

- What is your compile time, and what have you done about it?
- Where does `async` hurt you most?
- How do you handle the `Send + 'static` boundary in spawned tasks?
- Do you use `unsafe` anywhere, and how is it reviewed?
- What is your policy on adding dependencies?
