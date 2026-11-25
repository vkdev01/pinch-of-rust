# 12 · Macros

Rust has macros because it has no variadic generics and no reflection, and
because a lot of Rust's ergonomics are syntactic. You will *use* macros far more
often than you *write* them, but knowing how they work stops them feeling like
magic.

## Two families

| Kind | Example | How |
| --- | --- | --- |
| Declarative (`macro_rules!`) | `vec!`, `println!`, `matches!` | pattern-match on tokens |
| Procedural | `#[derive(Serialize)]`, `sqlx::query!` | a function over a token stream |

Procedural macros come in three flavours: derive macros, attribute macros, and
function-like macros. They must live in their own crate with
`proc-macro = true`.

## `macro_rules!` basics

```rust
macro_rules! square {
    ($x:expr) => {
        $x * $x
    };
}

assert_eq!(square!(3), 9);
```

A macro rule is `(matcher) => { expansion }`. Fragments are typed by a **fragment
specifier**:

| Specifier | Matches |
| --- | --- |
| `expr` | any expression |
| `ident` | an identifier |
| `ty` | a type |
| `pat` | a pattern |
| `stmt` | a statement |
| `block` | a `{ ... }` block |
| `item` | a function/struct/impl |
| `literal` | a literal |
| `tt` | a single token tree |
| `meta` | an attribute's contents |
| `path` | a `a::b::C` path |

### Multiple arms and repetition

```rust
macro_rules! my_vec {
    () => { Vec::new() };
    ($($x:expr),+ $(,)?) => {{
        let mut v = Vec::new();
        $( v.push($x); )+
        v
    }};
}

let a: Vec<i32> = my_vec![];
let b = my_vec![1, 2, 3];
let c = my_vec![1, 2, 3,];       // trailing comma allowed by $(,)?
```

- `$( ... )+` repeats one or more times, `*` zero or more, `?` optional.
- `$(,)?` accepts an optional trailing comma — always include it in list macros.
- `$($x:expr),+` means "one or more `expr`, separated by commas".

### A more useful example: a hash map literal

```rust
macro_rules! map {
    ($($k:expr => $v:expr),* $(,)?) => {{
        let mut m = std::collections::HashMap::new();
        $( m.insert($k, $v); )*
        m
    }};
}

let scores = map! {
    "alice" => 10,
    "bob" => 20,
};
```

### Hygiene

Macro-introduced identifiers do not collide with caller identifiers:

```rust
macro_rules! make_local {
    () => {
        let x = 1;      // this `x` is not visible to the caller
    };
}

let x = 99;
make_local!();
assert_eq!(x, 99);      // still 99 — hygiene
```

`$crate` refers to the defining crate, which is essential in exported macros:

```rust
#[macro_export]
macro_rules! log_info {
    ($($arg:tt)*) => {
        $crate::logger::log("INFO", &format!($($arg)*))
    };
}
```

Without `$crate`, a caller with a different `logger` in scope breaks.

## Derive macros

```rust
#[derive(Debug, Clone, PartialEq)]
struct User { id: u64 }
```

The compiler invokes a proc macro with the item's tokens and splices the result
back. Writing one requires `syn` and `quote`:

```rust
// In a crate with `proc-macro = true`
use proc_macro::TokenStream;
use quote::quote;
use syn::{parse_macro_input, DeriveInput};

#[proc_macro_derive(Describe)]
pub fn derive_describe(input: TokenStream) -> TokenStream {
    let ast = parse_macro_input!(input as DeriveInput);
    let name = &ast.ident;
    let expanded = quote! {
        impl Describe for #name {
            fn describe(&self) -> String {
                format!("{}: {:?}", stringify!(#name), self)
            }
        }
    };
    expanded.into()
}
```

`syn` parses Rust, `quote` builds Rust. Almost every derive macro in the
ecosystem is this shape plus attribute parsing.

## Attribute macros

```rust
#[tokio::main]
async fn main() { }

#[tracing::instrument]
fn handle(user_id: u64) { }

#[cfg(test)]
mod tests { }
```

An attribute macro receives the annotated item and returns a replacement. This is
how `#[tokio::main]` turns an `async fn main` into a runtime plus `block_on`.

## Function-like proc macros

```rust
let user = sqlx::query_as!(User, "SELECT id, email FROM users WHERE id = $1", id)
    .fetch_one(&pool)
    .await?;
```

`query_as!` connects to the database **at compile time**, checks the SQL, and
infers the result type. A typo in a column name is a compile error. This is
Rust's answer to "ORM or raw SQL?" — raw SQL with compile-time verification.

Other examples: `serde_json::json!`, `include_str!`, `env!`, `format_args!`.

## Macros from the standard library you should know

```rust
println!("{name} is {age}");        // inline format args
eprintln!("error: {e}");            // to stderr
format!("{a}-{b}");
write!(&mut buf, "{x}")?;           // into a String or io::Write
vec![0u8; 1024];
assert_eq!(a, b);
assert!(cond, "message {val}");
debug_assert!(cond);                // compiled out in release
matches!(x, Some(1..=9));
todo!();                            // panics with "not yet implemented"
unimplemented!();
unreachable!();
dbg!(expr);                         // prints file:line and returns the value
include_str!("data.txt");           // file contents as &'static str
include_bytes!("logo.png");
env!("CARGO_PKG_VERSION");
concat!("a", "b");
stringify!(a + b);
cfg!(debug_assertions);
```

`dbg!` is worth internalising: it prints `[src/main.rs:12] value = 42` to stderr
and **returns** the value, so you can drop it inline:

```rust
let x = dbg!(compute()) * 2;
```

## When to write a macro (rarely)

Write one when:

- You need a **variadic** API (`vec!`, `println!`).
- You must generate code from a list (`impl_from!` for 20 types).
- You need compile-time verification against external data (`sqlx::query!`).
- The alternative is a boilerplate impl repeated per type.

Do **not** write one when a generic function or trait would do. A macro has no
type checking until it is expanded, no IDE support for its body, and errors point
at the expansion site.

```rust
// Do not do this
macro_rules! add { ($a:expr, $b:expr) => { $a + $b }; }

// Do this
fn add<T: std::ops::Add<Output = T>>(a: T, b: T) -> T { a + b }
```

## Debugging a macro

```bash
$ cargo install cargo-expand
$ cargo expand                     # the whole crate, post-expansion
$ cargo expand path::to::module    # one item
```

`cargo expand` is the single most useful tool when a derive macro misbehaves.
Read the generated code, find the line that fails, fix the input.

## A worked example: a `time_it!` macro

```rust
macro_rules! time_it {
    ($label:expr, $body:block) => {{
        let __start = std::time::Instant::now();
        let __result = $body;
        eprintln!("{}: {:?}", $label, __start.elapsed());
        __result
    }};
}

fn main() {
    let sum = time_it!("sum", {
        (1..=1_000_000u64).sum::<u64>()
    });
    println!("{sum}");
}
```

The `__` prefix on introduced identifiers is convention — hygiene already
protects them, but it signals intent to readers.

## A worked example: generating `From` impls

```rust
trait ApiError: Sized {
    fn internal(msg: impl Into<String>) -> Self;
}

macro_rules! impl_from_error {
    ($from:ty => $to:ty) => {
        impl From<$from> for $to {
            fn from(e: $from) -> Self {
                <$to as ApiError>::internal(e.to_string())
            }
        }
    };
    ($($from:ty => $to:ty),+ $(,)?) => {
        $( impl_from_error!($from => $to); )+
    };
}

#[derive(Debug)]
enum AppError { Internal(String) }

impl ApiError for AppError {
    fn internal(msg: impl Into<String>) -> Self { AppError::Internal(msg.into()) }
}

impl_from_error! {
    std::io::Error => AppError,
    std::num::ParseIntError => AppError,
}
```

One line per conversion instead of five. `thiserror`'s `#[from]` does the same
thing with less rope.

---

## Exercises

1. Write `macro_rules! hashmap` supporting `k => v` pairs, empty, and trailing
   comma. Test all three.
2. Write `macro_rules! unless` — `unless!(cond, { ... })` runs the block when
   `cond` is false.
3. Write a `min!` macro that works with any number of arguments (at least one)
   using recursion or a fold over `$( )*`.
4. Use `cargo expand` on a `#[derive(Serialize)]` struct and read the generated
   code.
5. Convert a repeated `impl From<X> for MyError` block (five types) into a
   declarative macro and confirm `?` still works.
6. Explain why `$crate` matters in an exported macro.

**Next:** [Cargo in depth](../03-ecosystem/01-cargo-deep-dive.md)
