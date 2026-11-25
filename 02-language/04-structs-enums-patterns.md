# 04 · Structs, Enums, Pattern Matching

Rust has no classes and no inheritance. It has structs (data), enums (data that
is one of several shapes), traits (shared behaviour, module 02.05) and
composition. This combination is why Rust code tends to have small, obvious
types.

## Structs

### Named fields

```rust
#[derive(Debug, Clone, PartialEq)]
struct User {
    id: u64,
    email: String,
    active: bool,
}

let u = User {
    id: 1,
    email: String::from("a@example.com"),
    active: true,
};

println!("{}", u.email);      // field access
```

### Field init shorthand and struct update

```rust
fn new_user(id: u64, email: String) -> User {
    User { id, email, active: true }    // `id` and `email` shorthand
}

let u2 = User { id: 2, ..u.clone() };   // remaining fields from u
```

`..base` **moves** non-`Copy` fields out of `base`. After that, `base` is
partially moved and cannot be used as a whole.

### Tuple structs

```rust
struct Meters(f64);
struct UserId(u64);

fn distance(a: Meters, b: Meters) -> Meters {
    Meters((a.0 - b.0).abs())
}
```

The newtype pattern: a one-field tuple struct that gives a distinct type to a
primitive. It prevents passing a `UserId` where a `u64` order id is expected,
at zero runtime cost.

```rust
// newtype with validation — the "smart constructor"
struct Email(String);

impl Email {
    pub fn parse(s: &str) -> Result<Self, &'static str> {
        if s.contains('@') { Ok(Email(s.to_lowercase())) }
        else { Err("missing @") }
    }
    pub fn as_str(&self) -> &str { &self.0 }
}
```

Now any function taking `Email` is guaranteed a validated address. This is the
single most valuable pattern in Rust application code.

### Unit structs

```rust
struct Marker;               // no data, zero size
```

Used for type-state and as trait impl targets.

## `impl` blocks

```rust
impl User {
    // associated function (no self) — the constructor convention
    pub fn new(id: u64, email: impl Into<String>) -> Self {
        Self { id, email: email.into(), active: true }
    }

    // method
    pub fn is_active(&self) -> bool { self.active }

    // mutating method
    pub fn deactivate(&mut self) { self.active = false; }

    // consuming method
    pub fn into_email(self) -> String { self.email }
}
```

`Self` is an alias for the type being implemented. `impl Into<String>` accepts
both `&str` and `String` without a generic parameter at the call site.

### Multiple `impl` blocks

Legal and useful: keep inherent methods separate from trait impls, or split by
feature flag.

```rust
impl User { /* inherent */ }
impl std::fmt::Display for User { /* trait */ }
```

### Builder pattern

Rust has no named/default arguments, so builders are the idiomatic answer for
anything with more than ~4 fields.

```rust
#[derive(Debug, Default)]
pub struct ServerConfig {
    host: String,
    port: u16,
    workers: usize,
    tls: bool,
}

#[derive(Default)]
pub struct ServerConfigBuilder {
    inner: ServerConfig,
}

impl ServerConfigBuilder {
    pub fn host(mut self, host: impl Into<String>) -> Self {
        self.inner.host = host.into(); self
    }
    pub fn port(mut self, port: u16) -> Self {
        self.inner.port = port; self
    }
    pub fn workers(mut self, n: usize) -> Self {
        self.inner.workers = n; self
    }
    pub fn tls(mut self, on: bool) -> Self {
        self.inner.tls = on; self
    }
    pub fn build(self) -> Result<ServerConfig, String> {
        if self.inner.host.is_empty() { return Err("host required".into()); }
        Ok(self.inner)
    }
}

let cfg = ServerConfigBuilder::default()
    .host("0.0.0.0")
    .port(8080)
    .workers(4)
    .build()?;
```

Taking `mut self` and returning `Self` makes the chain work by value. The
`derive(Default)` on the builder means every field has a sane starting point.

> **Gotcha:** if the builder's `build()` validates, do not also offer `Default`
> on the built type — two ways to construct an invalid value defeats the point.

## Enums

An enum is a type that is exactly one of a fixed set of variants, and each
variant may carry data. This replaces the C "tag + union" pattern and makes
illegal states unrepresentable.

```rust
#[derive(Debug, Clone, PartialEq)]
enum Shape {
    Circle { radius: f64 },
    Rect { w: f64, h: f64 },
    Triangle(f64, f64),        // tuple variant
    Empty,                     // unit variant
}

impl Shape {
    fn area(&self) -> f64 {
        match self {
            Shape::Circle { radius } => std::f64::consts::PI * radius * radius,
            Shape::Rect { w, h } => w * h,
            Shape::Triangle(b, h) => 0.5 * b * h,
            Shape::Empty => 0.0,
        }
    }
}
```

`match self` on `&self` binds `radius: &f64` — match ergonomics dereference
automatically. No `*` needed to read it.

### `Option<T>` and `Result<T, E>` are ordinary enums

```rust
enum Option<T> { Some(T), None }
enum Result<T, E> { Ok(T), Err(E) }
```

There is no null in Rust. `Option<T>` costs nothing extra when `T` is a
non-nullable pointer (`Option<Box<T>>` is pointer-sized), because the niche
optimisation stores `None` in the null bit pattern.

### Making illegal states unrepresentable

Before:

```rust
struct Connection {
    connected: bool,
    socket: Option<TcpStream>,
    last_error: Option<String>,
}   // 8 valid-looking combinations, 3 of them nonsense
```

After:

```rust
enum Connection {
    Connected(TcpStream),
    Disconnected { last_error: String },
    Connecting,
}
```

Now every combination is meaningful and `match` forces you to handle each.

## Pattern matching in depth

```rust
let point = (3, -7);
match point {
    (0, 0) => println!("origin"),
    (x, 0) => println!("on x at {x}"),
    (0, y) => println!("on y at {y}"),
    (x, y) if x == y => println!("diagonal at {x}"),
    (x, y) => println!("({x}, {y})"),
}
```

### Patterns everywhere

```rust
let (a, b) = (1, 2);                       // let
fn f((x, y): (i32, i32)) -> i32 { x + y }  // function parameters
for (i, v) in vec.iter().enumerate() { }   // for
if let Some(v) = o { }                     // if let
while let Some(v) = it.next() { }          // while let
let Some(v) = o else { return };           // let-else
match x { Some(v) => v, None => 0 }        // match
```

### Pattern syntax reference

| Pattern | Matches |
| --- | --- |
| `_` | anything, binds nothing |
| `x` | anything, binds to `x` |
| `1` / `'a'` / `"s"` | a literal |
| `1..=5` / `'a'..='z'` | a range (integers, chars) |
| `A \| B` | either |
| `Some(x)` | a variant, binding its payload |
| `Point { x, y: 0 }` | a struct with a field pattern |
| `Point { x, .. }` | a struct, ignoring the rest |
| `[a, b, ..]` | a slice with at least two elements |
| `(a, b)` | a tuple |
| `ref x` / `&x` | bind by reference / destructure a reference |
| `x @ 1..=9` | bind and test |
| `NAME` | a unit struct or const — **not** a new binding |

> **Gotcha:** a bare identifier in a pattern *binds*, it does not compare. This
> compiles and always matches:
> ```rust
> const MAX: i32 = 10;
> let MAX = 5;                 // new binding, shadows the const — warning
> match 7 { MAX => println!("ten"), _ => {} }   // matches anything!
> ```
> Use a path (`Self::MAX`) or a literal to compare. Clippy warns about
> `bindings_with_variant_name`.

### Destructuring with `..` and nested patterns

```rust
struct Order { id: u64, items: Vec<Item>, total: f64 }

match order {
    Order { id, items, .. } if items.is_empty() => println!("{id} empty"),
    Order { total, .. } => println!("total {total}"),
}
```

### `matches!` macro

```rust
if matches!(status, Status::Active | Status::Trial) { }
```

Much cleaner than `if let ... { true } else { false }`.

## Methods on enums: the state machine pattern

```rust
#[derive(Debug)]
enum State { Idle, Running { since: u64 }, Failed(String) }

impl State {
    fn tick(self) -> State {
        match self {
            State::Idle => State::Running { since: 0 },
            State::Running { since } if since > 100 => State::Failed("timeout".into()),
            State::Running { since } => State::Running { since: since + 1 },
            s @ State::Failed(_) => s,
        }
    }
}
```

Taking `self` and returning `State` makes transitions explicit and total.

## `Default`, `From`, `TryFrom`

```rust
#[derive(Default)]
struct Config { port: u16, debug: bool }

impl From<&str> for Meters {
    fn from(s: &str) -> Self { Meters(s.parse().unwrap_or(0.0)) }
}

impl TryFrom<i64> for Meters {
    type Error = &'static str;
    fn try_from(v: i64) -> Result<Self, Self::Error> {
        if v < 0 { Err("negative") } else { Ok(Meters(v as f64)) }
    }
}
```

`From`/`TryFrom` give you `.into()` / `.try_into()` for free, and they compose
with generic APIs.

## Debugging output

```rust
#[derive(Debug)]
#[debug("{id}")]
struct User { id: u64 }
```

`{:?}` is derived; `{:#?}` pretty-prints. For custom user-facing output,
implement `Display` by hand:

```rust
impl std::fmt::Display for Shape {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Shape::Circle { radius } => write!(f, "circle r={radius}"),
            Shape::Rect { w, h } => write!(f, "rect {w}x{h}"),
            Shape::Triangle(b, h) => write!(f, "triangle b={b} h={h}"),
            Shape::Empty => write!(f, "empty"),
        }
    }
}
```

## A worked example: a config parser with typed values

```rust
use std::collections::HashMap;

#[derive(Debug, PartialEq)]
enum Value { Int(i64), Float(f64), Bool(bool), Text(String) }

#[derive(Debug, Default)]
struct Config(HashMap<String, Value>);

impl Config {
    fn parse(src: &str) -> Result<Self, String> {
        let mut map = HashMap::new();
        for (n, line) in src.lines().enumerate() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') { continue; }
            let (k, v) = line.split_once('=')
                .ok_or_else(|| format!("line {}: missing '='", n + 1))?;
            let k = k.trim().to_string();
            let v = v.trim();
            let val = if let Ok(i) = v.parse::<i64>() {
                Value::Int(i)
            } else if let Ok(f) = v.parse::<f64>() {
                Value::Float(f)
            } else if v == "true" || v == "false" {
                Value::Bool(v == "true")
            } else {
                Value::Text(v.trim_matches('"').to_string())
            };
            map.insert(k, val);
        }
        Ok(Config(map))
    }

    fn get(&self, key: &str) -> Option<&Value> { self.0.get(key) }
}

fn main() {
    let cfg = Config::parse("port = 8080\nratio = 0.5\n# comment\ndebug = true\nname = \"api\"")
        .unwrap();
    assert_eq!(cfg.get("port"), Some(&Value::Int(8080)));
    assert_eq!(cfg.get("debug"), Some(&Value::Bool(true)));
    assert_eq!(cfg.get("name"), Some(&Value::Text("api".into())));
    println!("{cfg:#?}");
}
```

---

## Exercises

1. Add a `Scale(f64)` variant to `Shape` that scales every other shape. Decide
   whether `Scale` should be a variant or a method — justify it.
2. Implement `Email` as a validated newtype and use it in a `User` struct.
   Confirm no code path can construct an invalid `Email`.
3. Write `fn classify(input: &str) -> Token` with at least five variants
   including one carrying data, and a `Display` impl.
4. Build a `ServerConfigBuilder` with a `build()` that rejects port 0. Add a
   test for the rejection.
5. Rewrite this without `match`:
   ```rust
   let msg = match opt { Some(n) => format!("{n}"), None => "none".into() };
   ```

**Next:** [Traits and generics](05-traits-generics.md)
