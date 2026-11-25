# 01 · Variables, Types, Mutability

Rust's type system is strict and its inference is good. You write types where
they document intent, and let inference handle the obvious cases.

## Bindings

```rust
fn main() {
    let x = 5;            // immutable binding, inferred i32
    let mut y = 5;        // mutable binding
    y += 1;               // fine

    let x = x + 1;        // shadowing: a NEW x, type may change
    let x = "now a str";  // legal — same name, different type

    const MAX: u32 = 100_000;   // compile-time constant, needs a type
    static GREETING: &str = "hi"; // 'static lifetime, one memory location

    println!("{x} {y} {MAX} {GREETING}");
}
```

### Immutable by default

```rust
let v = vec![1, 2, 3];
v.push(4);
```

```text
error[E0596]: cannot borrow `v` as mutable, as it is not declared as mutable
 --> src/main.rs:3:5
  |
2 |     let v = vec![1, 2, 3];
  |         - help: consider changing this to be mutable: `mut v`
3 |     v.push(4);
  |     ^^^^^^^^^^ cannot borrow as mutable
```

This is not ceremony. Immutability by default means: when reading unfamiliar
code you can assume most things do not change, and the compiler enforces it.

### Shadowing vs `mut`

| | `let x = 1; let x = x + 1;` | `let mut x = 1; x += 1;` |
| --- | --- | --- |
| Type can change | yes | no |
| New memory location | yes | same |
| Usable inside closures while old value borrowed | yes | no |
| Value moved from the old binding | possible | n/a |

Shadowing is idiomatic for *transforming* a value — parse a string, then
re-bind as a number:

```rust
let input = "42";
let input: u32 = input.parse().expect("not a number");
```

### `const` vs `static`

```rust
const LIMIT: usize = 1024;             // inlined at every use site
static VERSION: &str = env!("CARGO_PKG_VERSION"); // one address, may be mutable with unsafe
```

Use `const` by default. Use `static` when you need a stable address or a
non-`Copy` shared value (usually wrapped in `OnceLock` / `LazyLock`).

```rust
use std::sync::LazyLock;
static CONFIG: LazyLock<Config> = LazyLock::new(|| Config::from_env());
```

## Primitive types

| Category | Types | Notes |
| --- | --- | --- |
| Signed ints | `i8 i16 i32 i64 i128 isize` | `i32` is the default |
| Unsigned | `u8 u16 u32 u64 u128 usize` | `u8` for bytes, `usize` for indices/lengths |
| Floats | `f32 f64` | `f64` default; no `Eq`, no `Hash` |
| Bool | `bool` | 1 byte |
| Char | `char` | 4 bytes, a Unicode scalar value — **not** a byte |
| String slice | `&str` | borrowed UTF-8, `&'static str` for literals |
| String | `String` | owned, growable UTF-8 |
| Unit | `()` | the type of "no value" |
| Never | `!` | type of `panic!`, `return`, `loop {}` |

### Numeric literals

```rust
let a = 98_222;          // underscores for readability
let b = 0xff;            // hex
let c = 0o77;            // octal
let d = 0b1010_1010;     // binary
let e = b'A';            // byte literal, u8
let f = 6.022e23;        // float
let g: u8 = 255;
```

Integer literals default to `i32` unless context forces otherwise. This
compiles because context supplies the type:

```rust
let v: Vec<u64> = vec![1, 2, 3];   // literals are u64
```

### Conversions are explicit

Rust never implicitly converts between numeric types.

```rust
let a: i32 = 10;
let b: i64 = a;              // error[E0308]: mismatched types
let b: i64 = a as i64;       // ok — explicit cast

let x: u8 = 300;             // error: literal out of range for `u8`
let y = 300u16 as u8;        // ok, truncates to 44 — silent!
```

`as` truncates and wraps silently. When that matters, use the checked family:

```rust
let big: u16 = 300;
assert_eq!(big.checked_add(65_000), None);
assert_eq!(big.saturating_add(65_000), u16::MAX);
assert_eq!(big.wrapping_add(65_000), 44);          // wraps around
assert_eq!(u8::try_from(300).is_err(), true);      // fallible, no silent loss
```

> **Rule of thumb:** use `as` only for widening (`u32 as u64`, `f32 as f64`) or
> when you have proven the range. Use `try_from` for narrowing.

### Integer overflow

| Build | `a + b` overflowing |
| --- | --- |
| debug | panics: "attempt to add with overflow" |
| release | wraps silently |

```rust
let mut n: u8 = 255;
n += 1;                    // panics in debug, becomes 0 in release
```

This is the classic "works on my machine" bug. If overflow is possible, be
explicit: `checked_*`, `saturating_*`, `wrapping_*`.

## Strings: `&str` vs `String`

The distinction trips up everyone. It is worth getting right early.

```rust
let literal: &'static str = "hello";     // in the binary, immutable, borrowed
let owned: String = String::from("hello"); // on the heap, growable, owned

let s: &str = &owned;                    // String derefs to &str — free
let o: String = literal.to_string();     // copy into a String — allocates
```

| | `&str` | `String` |
| --- | --- | --- |
| Ownership | borrows | owns |
| Growable | no | yes |
| Cost to pass | pointer + length (16 bytes) | move or borrow |
| Where it lives | anywhere (stack, static, inside a String) | heap |

> **Rule of thumb:** take `&str` in function parameters, return `String` when
> you must allocate.

```rust
fn greet(name: &str) -> String {          // accepts &String too, via deref coercion
    format!("Hello, {name}!")
}

fn shout(name: &str) -> &str {            // returning a borrow: lifetime elision ties it to input
    name
}
```

### Strings are UTF-8, so indexing is not allowed

```rust
let s = "héllo";
let c = s[0];              // error[E0277]: the type `str` cannot be indexed by `{integer}`
```

`s[0]` is ambiguous: byte 0? char 0? They differ for any non-ASCII text. Use:

```rust
let chars: Vec<char> = s.chars().collect();
let first = s.chars().next();            // Option<char>
let bytes = s.as_bytes();                // &[u8], safe to index
let sliced = &s[0..1];                   // panics if 1 is not a char boundary
let safe = s.get(0..1);                  // Option<&str>
```

This is not a wart — it is the reason Rust programs do not mangle names in
Kannada, Tamil, or any non-ASCII text.

## Compound types

```rust
let tup: (i32, f64, char) = (500, 6.4, 'x');
let (a, b, c) = tup;            // destructure
let first = tup.0;              // or index

let arr: [i32; 3] = [1, 2, 3];  // fixed size, on the stack
let zeros = [0u8; 1024];        // 1 KB of zeros
let len = arr.len();            // 3, known at compile time
```

Arrays are fixed-length and stack-allocated. `Vec<T>` is the growable,
heap-allocated version — module 02.06.

## Type inference, and where it stops

```rust
let v = Vec::new();             // error: type annotations needed
let v: Vec<i32> = Vec::new();   // ok
let v = Vec::<i32>::new();      // ok — turbofish
let v: Vec<_> = (0..3).map(|i| i * 2).collect();  // `_` = "you infer it"
```

Inference works backwards from later use:

```rust
let mut v = Vec::new();
v.push(1u8);            // now v is Vec<u8> — inference succeeded
```

## `Debug` vs `Display`

```rust
#[derive(Debug)]
struct Point { x: i32, y: i32 }

println!("{:?}", Point { x: 1, y: 2 });   // Point { x: 1, y: 2 }
println!("{:#?}", Point { x: 1, y: 2 });  // pretty-printed, multi-line
println!("{}", Point { x: 1, y: 2 });     // error: `Point` doesn't implement Display
```

`Display` must be implemented by hand because there is no correct default
format for a user-facing message.

## Mutability, precisely

```rust
let mut v = vec![1, 2, 3];

let a = &v;          // shared borrow
let b = &v;          // another shared borrow — fine, many allowed
println!("{a:?} {b:?}");

let c = &mut v;      // error if `a` or `b` still used afterwards
c.push(4);
```

Mutability is a property of the *binding* and of the *borrow*, and the compiler
tracks both. That is module 02.03.

## A worked example

Parsing a small config line, using shadowing and explicit types:

```rust
fn parse_line(line: &str) -> Option<(String, u32)> {
    let (key, raw) = line.split_once('=')?;   // `?` on Option
    let key = key.trim().to_string();
    let value: u32 = raw.trim().parse().ok()?; // `.ok()?` converts Result to Option
    Some((key, value))
}

fn main() {
    assert_eq!(parse_line("port = 8080"), Some(("port".into(), 8080)));
    assert_eq!(parse_line("no equals sign"), None);
    assert_eq!(parse_line("port = abc"), None);

    let input = "  workers=4  ";
    let (k, v) = parse_line(input).unwrap();
    println!("{k} -> {v}");
}
```

Note how `?` on `Option` inside a function returning `Option` propagates `None`
without any match arms.

---

## Exercises

1. Write `fn describe(n: i64) -> String` that returns `"zero"`, `"negative"` or
   `"positive"` — then try `n: i128` and explain the change needed.
2. Demonstrate overflow: a `u8` counter incremented in a loop. Run it with
   `cargo run` and `cargo run --release`. Explain the two behaviours.
3. Convert `"300"` to a `u8` three ways: `as`, `parse::<u8>()`, and
   `u8::try_from`. Which succeed and which lose data?
4. Write `fn initials(full_name: &str) -> String` that works correctly for
   `"आदित्य शर्मा"` and `"Ada Lovelace"`. (Hint: `chars()`, not bytes.)
5. Predict the type of `let x = 0..10;`. Check with
   `let _: () = x;` and read the compiler's error.

**Next:** [Functions and control flow](02-functions-control-flow.md)
