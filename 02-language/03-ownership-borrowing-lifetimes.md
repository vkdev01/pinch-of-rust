# 03 · Ownership, Borrowing, Lifetimes

This is the heart of Rust. Everything else in the language follows from these
three rules. Read this module twice.

## The three rules

1. Every value has exactly one **owner**.
2. There can only be one owner at a time.
3. When the owner goes out of scope, the value is **dropped** (its destructor
   runs, its memory is freed).

That is it. Memory safety, no garbage collector, no use-after-free, no double
free — all of it falls out of these three rules plus the borrow rules below.

## Move semantics

```rust
fn main() {
    let s1 = String::from("hello");
    let s2 = s1;                 // ownership MOVES to s2

    println!("{s1}");            // error[E0382]: borrow of moved value: `s1`
    println!("{s2}");            // fine
}
```

```text
error[E0382]: borrow of moved value: `s1`
 --> src/main.rs:5:15
  |
3 |     let s1 = String::from("hello");
  |         -- move occurs because `s1` has type `String`,
  |            which does not implement the `Copy` trait
4 |     let s2 = s1;
  |              -- value moved here
5 |     println!("{s1}");
  |               ^^^^ value borrowed here after move
```

In C++, `let s2 = s1` would be a copy (or a move that leaves `s1` "valid but
unspecified"). In Rust the compiler *tracks* it and rejects use after move.

### `Copy` vs move

Types that are cheap to duplicate implement `Copy` and are copied instead:

```rust
let a = 5;
let b = a;          // i32 is Copy — both valid
println!("{a} {b}");

let t = (1, 2.0, 'c');   // tuples of Copy types are Copy
let u = t;               // copied
```

| `Copy` | Not `Copy` |
| --- | --- |
| all integers, floats, `bool`, `char` | `String`, `Vec<T>`, `Box<T>` |
| `&T` (shared references) | `&mut T` |
| tuples/arrays of `Copy` types | most structs by default |

```rust
#[derive(Clone, Copy)]
struct Point { x: f64, y: f64 }   // now Point is copied, not moved
```

> **Rule of thumb:** derive `Copy` only for small, plain-data types (≤ 4 words).
> A `Copy` struct containing a 1 KB array silently copies on every assignment,
> and you will not see it in the code.

### Cloning is explicit

```rust
let s1 = String::from("hello");
let s2 = s1.clone();       // deep copy, allocates
println!("{s1} {s2}");     // both valid
```

Clone is visible at the call site. That is the point: allocation costs are
never hidden.

## Ownership and functions

Passing a value to a function moves it (unless it is `Copy`):

```rust
fn consume(s: String) {
    println!("{s}");
}   // s dropped here

fn main() {
    let s = String::from("hi");
    consume(s);
    consume(s);      // error[E0382]: use of moved value
}
```

Returning a value transfers ownership out:

```rust
fn make() -> String {
    String::from("new")
}
let s = make();      // we own it now
```

[[fig:ownership-flow]]

## Borrowing

Moving everything in and out of functions would be unbearable. Instead, **borrow**:

```rust
fn length(s: &String) -> usize {   // & = shared reference
    s.len()
}

fn main() {
    let s = String::from("hello");
    let n = length(&s);      // lend it
    println!("{s} is {n}");  // still ours
}
```

## The borrow rules

At any point in time, for a given value, you may have **either**:

- any number of shared borrows (`&T`), **or**
- exactly one mutable borrow (`&mut T`),

**but never both at once.** And references must always be valid (no dangling).

```rust
let mut v = vec![1, 2, 3];

let a = &v;
let b = &v;              // ok — two shared borrows
println!("{a:?} {b:?}"); // last use of a, b

let c = &mut v;          // ok — a and b are no longer used
c.push(4);
```

Violating it:

```rust
let mut v = vec![1, 2, 3];
let a = &v;
let c = &mut v;          // error[E0502]: cannot borrow `v` as mutable
                         // because it is also borrowed as immutable
println!("{a:?}");
c.push(4);
```

### Why this rule exists

It eliminates data races *at compile time*. A data race requires two threads
accessing the same memory, at least one writing, without synchronisation. If a
`&mut T` cannot coexist with any other reference, that situation cannot be
expressed. `Send`/`Sync` (module 02.10) extend the same argument across threads.

[[fig:canvas-borrow]]

### Non-lexical lifetimes (NLL)

Borrows end at their **last use**, not at the end of the block:

```rust
let mut v = vec![1, 2, 3];
let a = &v;
println!("{a:?}");       // last use of `a` here
v.push(4);               // fine — the shared borrow already ended
```

This is why Rust code from 2015 looked so contorted and modern Rust does not.

## `&mut` is not "mutable reference" in the C++ sense

`&mut T` means **exclusive** access. It is a guarantee to the compiler that
nobody else can see this value, which is why the optimiser can do so much.

```rust
fn add_one(x: &mut i32) { *x += 1; }   // note the deref

let mut n = 5;
add_one(&mut n);
assert_eq!(n, 6);
```

## Method receivers

```rust
struct Counter { n: u32 }

impl Counter {
    fn get(&self) -> u32 { self.n }              // shared borrow
    fn bump(&mut self) { self.n += 1; }          // exclusive borrow
    fn into_n(self) -> u32 { self.n }            // consumes
}
```

Pick the weakest receiver that works: `&self` unless you must mutate, `self`
only when the type is a one-shot builder or converter.

## Lifetimes

A lifetime is how long a reference is valid. You mostly do not write them — the
compiler infers them via **elision rules**. You write them when the compiler
cannot tell which input a returned reference came from.

### The problem

```rust
fn longest(a: &str, b: &str) -> &str {   // error[E0106]: missing lifetime specifier
    if a.len() > b.len() { a } else { b }
}
```

The compiler asks: the returned reference — is it tied to `a` or to `b`? It
cannot know, so it refuses.

```rust
fn longest<'a>(a: &'a str, b: &'a str) -> &'a str {
    if a.len() > b.len() { a } else { b }
}
```

Read `'a` as: "there is some region `'a` such that both inputs live at least
that long, and the output lives no longer than that." The returned reference is
valid for the **shorter** of the two inputs.

```rust
let s1 = String::from("long string");
{
    let s2 = String::from("xy");
    let r = longest(&s1, &s2);
    println!("{r}");     // ok
}
// println!("{r}");      // error if r were still used here — s2 is gone
```

### Elision rules

The compiler applies three rules, in order:

1. Each elided input lifetime becomes its own parameter.
2. If there is exactly **one** input lifetime, it is assigned to all elided
   outputs.
3. If there is a `&self` or `&mut self` parameter, its lifetime is assigned to
   all elided outputs.

```rust
fn first_word(s: &str) -> &str          // rule 2 → &'a str
fn name(&self) -> &str                  // rule 3 → tied to self
fn pair(a: &str, b: &str) -> &str       // rules do not apply → error, must annotate
```

### Lifetimes in structs

A struct holding a reference needs a lifetime parameter:

```rust
struct Excerpt<'a> {
    text: &'a str,
}

impl<'a> Excerpt<'a> {
    fn announce(&self, msg: &str) -> &str {
        // rule 3: returned ref tied to &self, not to msg
        self.text
    }
}
```

> **Rule of thumb:** if you find yourself adding lifetimes to a struct, ask
> whether it should own the data (`String` instead of `&str`). Structs with
> lifetimes propagate that parameter into every type that uses them. For domain
> types, owning is almost always simpler.

### `'static`

`'static` means "valid for the entire program". String literals are `'static`.
A `'static` bound on a trait object or thread also means "contains no borrows":

```rust
let s: &'static str = "in the binary";
let v: Vec<Box<dyn std::error::Error + 'static>> = vec![];
```

> **Gotcha:** `'static` does **not** mean "leaked" or "lives forever in RAM". It
> means "no shorter lifetime could invalidate it". `Box::leak` gives you one,
> but so do all literals, and neither costs anything at runtime.

### `'_` and anonymous lifetimes

```rust
struct Parser<'a> { input: &'a str }
impl Parser<'_> { }        // "_ = infer the lifetime here"
```

### Higher-ranked trait bounds (HRTB), briefly

When you accept a closure that takes a reference of any lifetime:

```rust
fn apply<F>(f: F) -> String
where
    F: for<'a> Fn(&'a str) -> String,   // for<'a> = HRTB
{
    f("hello")
}
```

You will meet `for<'a>` mostly in error messages about closures and `Fn` traits.
It means "this works for every lifetime, not one particular one".

## Common borrow-checker fights, and the real fix

### 1. Mutating while iterating

```rust
let mut v = vec![1, 2, 3];
for x in &v {
    if *x == 2 { v.push(4); }   // error[E0499]: cannot borrow `v` as mutable
}
```

Fixes, in order of preference:

```rust
// a) collect what to do, then do it
let to_add: Vec<i32> = v.iter().filter(|&&x| x == 2).map(|_| 4).collect();
v.extend(to_add);

// b) index-based, if you must mutate in place
for i in 0..v.len() {
    if v[i] == 2 { v[i] = 4; }
}

// c) retain / drain / split_at_mut for structural edits
v.retain(|&x| x != 2);
```

### 2. Returning a reference to a local

```rust
fn bad() -> &String {          // error[E0515]: returns a value referencing
    let s = String::from("x"); // data owned by the current function
    &s
}
```

Fix: return owned (`String`), or take the storage as a parameter
(`fn fill(buf: &mut String)`).

### 3. Two `&mut` into the same `Vec`

```rust
let mut v = vec![1, 2, 3, 4];
let (a, b) = v.split_at_mut(2);   // two disjoint &mut slices — legal
a[0] = 10;
b[0] = 30;
```

`splice_at_mut`, `iter_mut`, `chunks_mut`, `split_at_mut` exist precisely to
express "two disjoint mutable pieces".

### 4. Self-referential structs

```rust
struct Bad {
    data: String,
    slice: &str,   // needs a lifetime; and it would point into `data`,
}                  // which moves when the struct moves
```

Do not build these. Options: store indices instead of slices, use
`owning_ref`/`yoke`/`self_cell`, or restructure so the borrow is local.

### 5. Storing a borrow in a struct that outlives the source

Symptom: `error[E0597]: does not live long enough`. The fix is nearly always
"make the struct own a `String`/`Arc<str>`".

## Interior mutability: the escape hatch

When you need to mutate through a shared reference, use `Cell`/`RefCell`
(single-threaded) or `Mutex`/`RwLock`/atomics (multi-threaded). The borrow
rules are then checked at runtime instead of compile time. Details in
[Smart pointers](09-smart-pointers-interior-mutability.md).

## A worked example: a text buffer with borrowed views

```rust
/// Splits a line into (key, value) without allocating.
fn split_kv(line: &str) -> Option<(&str, &str)> {
    let (k, v) = line.split_once('=')?;
    Some((k.trim(), v.trim()))
}

/// A view over a document: borrows, never copies.
struct Line<'a> {
    number: usize,
    text: &'a str,
}

fn lines_with<'a>(doc: &'a str, needle: &str) -> Vec<Line<'a>> {
    doc.lines()
        .enumerate()
        .filter(|(_, l)| l.contains(needle))
        .map(|(i, l)| Line { number: i + 1, text: l })
        .collect()
}

fn main() {
    let doc = "a=1\nb=2\n# note\nc=3";
    for l in lines_with(doc, "=") {
        let (k, v) = split_kv(l.text).unwrap();
        println!("line {}: {k} -> {v}", l.number);
    }
}
```

`lines_with` returns `Vec<Line<'a>>` where `'a` is the lifetime of `doc`. The
compiler proves the vector cannot outlive the document. Zero copies, zero
allocation beyond the `Vec` itself.

---

## Exercises

1. Write `fn longest_word(s: &str) -> &str`. Why does this compile without an
   explicit lifetime? Which elision rule applies?
2. Write `fn first_of(a: &str, b: &str) -> &str` returning whichever is
   non-empty. Add the lifetime annotation. Then call it where `b` is a temporary
   and observe the error.
3. Explain why this fails, then fix it without cloning:
   ```rust
   let mut v = vec![String::from("a")];
   let first = &v[0];
   v.push(String::from("b"));
   println!("{first}");
   ```
4. Write a struct `WordIndex<'a>` holding `Vec<&'a str>` of unique words. Then
   rewrite it to own `Vec<String>` and compare the API ergonomics.
5. Implement `fn split_twice(s: &mut Vec<i32>) -> (&mut [i32], &mut [i32])`
   using `split_at_mut`. Call it and mutate both halves.

**Next:** [Structs, enums, pattern matching](04-structs-enums-patterns.md)
