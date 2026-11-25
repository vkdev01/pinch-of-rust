# 05 · Traits and Generics

Traits are Rust's answer to interfaces. Generics are its answer to templates.
Together they give you polymorphism with **zero runtime cost** — but they also
generate the error messages that Rust is famous for. This module teaches you to
read them.

## Defining a trait

```rust
trait Summary {
    fn summarize(&self) -> String;                 // required

    fn preview(&self) -> String {                  // provided, overridable
        format!("{}...", &self.summarize()[..10.min(self.summarize().len())])
    }
}
```

```rust
struct Article { title: String, body: String }

impl Summary for Article {
    fn summarize(&self) -> String {
        format!("{}: {}", self.title, self.body)
    }
}
```

A trait is a set of guarantees. Any function that takes `impl Summary` can rely
on all of them and knows nothing else about the concrete type.

## Generic functions

```rust
fn largest<T: PartialOrd + Copy>(list: &[T]) -> T {
    let mut max = list[0];
    for &item in list {
        if item > max { max = item; }
    }
    max
}
```

`T: PartialOrd + Copy` is a **bound**: `T` must support comparison and copying.
Without it, `item > max` does not compile because the compiler cannot assume
anything about `T`.

```rust
// equivalent, with a where clause — better for long bounds
fn largest<T>(list: &[T]) -> T
where
    T: PartialOrd + Copy,
{ /* ... */ }
```

### Monomorphisation, and its cost

Generic functions are compiled **once per concrete type**. `largest::<i32>` and
`largest::<f64>` are two separate functions in the binary. That is why generics
are as fast as hand-written code, and why they increase binary size and compile
time.

Use `dyn Trait` (below) instead when binary size or compile time dominates, or
when the set of types is open.

## `impl Trait` in argument position

```rust
fn notify(item: &impl Summary) {
    println!("{}", item.summarize());
}
```

Sugar for `fn notify<T: Summary>(item: &T)`. Use it for one generic parameter;
use explicit `<T>` when you need two parameters of the same type.

```rust
fn compare(a: &impl Summary, b: &impl Summary) { }        // may be different types
fn compare<T: Summary>(a: &T, b: &T) { }                  // must be the same type
```

## `impl Trait` in return position

```rust
fn evens() -> impl Iterator<Item = u32> {
    (0..).filter(|n| n % 2 == 0).take(10)
}
```

The concrete type (`Filter<Take<RangeFrom<u32>>, ...>`) is unnameable, so
`impl Trait` lets you return it without boxing. This is the standard way to
return iterators and futures.

## Trait objects: `dyn Trait`

```rust
fn render_all(items: &[Box<dyn Summary>]) {
    for item in items {
        println!("{}", item.summarize());
    }
}
```

| | `impl Trait` / `<T: Trait>` | `dyn Trait` |
| --- | --- | --- |
| Dispatch | static (inlined, monomorphised) | dynamic (vtable) |
| Cost per call | zero | one indirect call |
| Binary size | grows per type | one |
| Heterogeneous collections | no | yes |
| Compile time | higher | lower |

> **Rule of thumb:** generics by default; `dyn` when you need a collection of
> mixed types, a plugin boundary, or you are fighting compile time.

## Object safety

Not every trait can become `dyn Trait`. A trait is object-safe only if it has no
generic methods, no `Self: Sized` requirements, and no associated constants or
methods returning `Self`.

```rust
trait NotObjectSafe {
    fn clone_me(&self) -> Self;     // returns Self → not object-safe
}

trait ObjectSafe {
    fn name(&self) -> &str;         // fine
}
```

Fix: add `where Self: Sized` to the offending method so it is excluded from the
vtable.

## Common standard traits

| Trait | Method | Gives you |
| --- | --- | --- |
| `Clone` | `.clone()` | explicit deep copy |
| `Copy` | — | implicit copy semantics |
| `Debug` | `{:?}` | developer output |
| `Display` | `{}` | user output |
| `PartialEq` / `Eq` | `==` | comparison (Eq = total equality) |
| `PartialOrd` / `Ord` | `<`, `.sort()` | ordering |
| `Hash` | — | usable as `HashMap` key |
| `Default` | `T::default()` | zero/empty value |
| `From` / `Into` | `.into()` | infallible conversion |
| `TryFrom` / `TryInto` | `.try_into()` | fallible conversion |
| `AsRef` / `Borrow` | `.as_ref()` | cheap re-interpretation |
| `Iterator` | `for`, `.map()` | iteration |
| `Deref` | `*x`, auto-deref | smart pointer behaviour |
| `Drop` | — | destructor |
| `Send` / `Sync` | — | thread safety markers |

### Deriving

```rust
#[derive(Debug, Clone, PartialEq, Eq, Hash, Default)]
struct Id(u64);
```

Derive is a procedural macro that writes the impl. For `Hash` + `Eq` pairs, both
are needed for `HashMap` keys. `Ord` requires `PartialOrd + Eq`.

### Implementing `Display` and `Error`

```rust
use std::fmt;

#[derive(Debug)]
struct ParseError { line: usize, msg: String }

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "line {}: {}", self.line, self.msg)
    }
}

impl std::error::Error for ParseError {}
```

Once `Display + Debug + Error` exist, the type works with `?`, `Box<dyn Error>`,
`anyhow`, `thiserror`, and every logging crate.

## Supertraits

```rust
trait Repository: Send + Sync {
    fn get(&self, id: u64) -> Option<&Record>;
}

// any T: Repository is also Send + Sync
fn spawn_worker<R: Repository + 'static>(repo: R) { }
```

`Send + Sync` supertraits are the standard way to say "this abstraction is
usable from async tasks".

## Associated types vs generic parameters

```rust
trait Iterator {
    type Item;                       // associated type — ONE impl per type
    fn next(&mut self) -> Option<Self::Item>;
}

trait Add<Rhs = Self> {
    type Output;                     // generic parameter — MANY impls allowed
    fn add(self, rhs: Rhs) -> Self::Output;
}
```

Use an associated type when there is exactly one sensible choice per
implementation (`Item`). Use a generic parameter when a type could sensibly
implement it several ways (`Add<i32>` and `Add<f64>`).

## Static dispatch across a plugin boundary

```rust
trait Storage {
    fn put(&self, key: &str, val: &[u8]) -> std::io::Result<()>;
    fn get(&self, key: &str) -> std::io::Result<Vec<u8>>;
}

struct Memory(HashMap<String, Vec<u8>>);
struct Disk { root: PathBuf }

impl Storage for Memory { /* ... */ }
impl Storage for Disk { /* ... */ }

// generic: zero-cost, one copy of the handler per storage type
fn save<S: Storage>(s: &S) -> std::io::Result<()> {
    s.put("k", b"v")
}
```

## Trait objects at runtime: a plugin registry

```rust
trait Handler: Send + Sync {
    fn name(&self) -> &'static str;
    fn handle(&self, input: &str) -> String;
}

struct Registry { handlers: HashMap<&'static str, Box<dyn Handler>> }

impl Registry {
    fn new() -> Self { Self { handlers: HashMap::new() } }
    fn register(&mut self, h: impl Handler + 'static) {
        self.handlers.insert(h.name(), Box::new(h));
    }
    fn dispatch(&self, name: &str, input: &str) -> Option<String> {
        self.handlers.get(name).map(|h| h.handle(input))
    }
}
```

This is how routers, CLI subcommands and migration runners are structured
internally.

## Blanket implementations

```rust
trait Describe {
    fn describe(&self) -> String;
}

// anything that is Display gets Describe, for free
impl<T: std::fmt::Display> Describe for T {
    fn describe(&self) -> String { format!("value: {self}") }
}
```

Powerful and dangerous: a blanket impl blocks anyone else from implementing
`Describe` for their own type. The standard library uses this for
`impl<T: Display> ToString for T`.

## Extension traits

Adding methods to a type you do not own:

```rust
trait StrExt {
    fn title_case(&self) -> String;
}

impl StrExt for str {
    fn title_case(&self) -> String {
        self.split_whitespace()
            .map(|w| {
                let mut c = w.chars();
                match c.next() {
                    Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                    None => String::new(),
                }
            })
            .collect::<Vec<_>>()
            .join(" ")
    }
}

assert_eq!("hello world".title_case(), "Hello World");
```

This is how `itertools`, `tower`, `axum` and `sqlx` add ergonomics without
touching upstream types.

## Reading generic error messages

```rust
fn largest<T: PartialOrd>(list: &[T]) -> T { ... }
```

```text
error[E0507]: cannot move out of index of `[T]`
  |
  |     let mut max = list[0];
  |                   ^^^^^^^ move occurs because value has type `T`,
  |                           which does not implement the `Copy` trait
help: consider borrowing here
  |
  |     let mut max = &list[0];
```

The fix is to add `Copy` (as we did) or to work with `&T`. Reading these
messages: the `help:` block is usually the correct fix; the `note:` block
explains *why*.

### The `Sized` bound

```rust
fn by_value<T>(t: T) { }            // implicit T: Sized
fn by_ref<T: ?Sized>(t: &T) { }     // opt out — accepts str, [u8], dyn Trait
```

`?Sized` means "may not have a known size at compile time" — required for
`&str` and `dyn Trait` parameters.

## A worked example: a generic repository with a trait object fallback

```rust
#[derive(Debug, Clone, PartialEq)]
struct User { id: u64, email: String }

trait Repo {
    type Error;
    fn find(&self, id: u64) -> Result<Option<User>, Self::Error>;
    fn save(&mut self, user: User) -> Result<(), Self::Error>;
}

struct InMemory { rows: Vec<User> }

impl Repo for InMemory {
    type Error = std::convert::Infallible;

    fn find(&self, id: u64) -> Result<Option<User>, Self::Error> {
        Ok(self.rows.iter().find(|u| u.id == id).cloned())
    }

    fn save(&mut self, user: User) -> Result<(), Self::Error> {
        match self.rows.iter_mut().find(|u| u.id == user.id) {
            Some(existing) => *existing = user,
            None => self.rows.push(user),
        }
        Ok(())
    }
}

// generic in, so it monomorphises per backend and inlines
fn upsert<R: Repo>(repo: &mut R, user: User) -> Result<(), R::Error> {
    repo.save(user)
}

fn main() {
    let mut repo = InMemory { rows: Vec::new() };
    upsert(&mut repo, User { id: 1, email: "a@x.com".into() }).unwrap();
    assert_eq!(repo.find(1).unwrap().unwrap().email, "a@x.com");
}
```

---

## Exercises

1. Write `trait Area { fn area(&self) -> f64; }`, implement it for three shapes,
   then write `fn total(shapes: &[Box<dyn Area>]) -> f64`.
2. Convert `total` to a generic `fn total<A: Area>(shapes: &[A]) -> f64`. What
   can you no longer pass it, and why?
3. Implement `From<&str> for Meters` and confirm `"5".into()` works.
4. Write an extension trait `VecExt` adding `.second()` returning `Option<&T>`.
   Apply it to `Vec<i32>` and `Vec<String>`.
5. Take a trait with a method returning `Self` and make it object-safe using
   `where Self: Sized`.
6. Explain why `impl<T: Display> MyTrait for T` prevents you from also writing
   `impl MyTrait for MyStruct`.

**Next:** [Collections and iterators](06-collections-iterators.md)
