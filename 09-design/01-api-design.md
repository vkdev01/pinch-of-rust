# 01 · Designing a Rust API

An API is a promise. Rust gives you unusually sharp tools for making the promise
enforceable at compile time.

## Make the wrong call impossible

```rust
// the stringly-typed version: every caller must remember the rules
pub fn transfer(from: &str, to: &str, amount: f64) -> Result<(), String>;

// the typed version: the compiler enforces them
pub fn transfer(from: AccountId, to: AccountId, amount: Paise) -> Result<(), LedgerError>;
```

Four bugs become impossible in the second signature: mixing up the arguments,
passing rupees where paise are expected, a float rounding error, and an
unstructured error nobody can match on.

## Newtypes for every unit

```rust
pub struct Meters(pub f64);
pub struct Seconds(pub f64);
pub struct Paise(pub i64);

fn distance(a: Meters, b: Meters) -> Meters { Meters((a.0 - b.0).abs()) }
// distance(Meters(1.0), Seconds(2.0))  -> does not compile
```

Zero runtime cost, and it documents the unit in the type rather than in a comment.

## Take the most general borrowed input

```rust
// narrow: forces the caller to build a String
pub fn greet(name: String) -> String;

// general: accepts &str, String, Cow, &String
pub fn greet(name: &str) -> String;

// most general: anything string-like, no allocation at the call site
pub fn greet(name: impl AsRef<str>) -> String {
    format!("Hello, {}!", name.as_ref())
}
```

Rules that hold up:

| Position | Take |
| --- | --- |
| read-only text | `&str` |
| read-only sequence | `&[T]` |
| read-only map | `&HashMap<K, V>` |
| any iterator | `impl IntoIterator<Item = T>` |
| anything string-like | `impl AsRef<str>` |
| owned output | `String` / `Vec<T>` |

## Builders instead of boolean soup

```rust
// unreadable at the call site, and it grows a parameter every quarter
fn connect(host: &str, port: u16, tls: bool, retries: u8, timeout_ms: u64) -> Conn;

// named, optional, and validated once
#[derive(Debug, Clone)]
pub struct ConnConfig { host: String, port: u16, tls: bool, retries: u8 }

#[derive(Default)]
pub struct ConnConfigBuilder { inner: ConnConfig }

impl ConnConfigBuilder {
    pub fn host(mut self, host: impl Into<String>) -> Self { self.inner.host = host.into(); self }
    pub fn port(mut self, port: u16) -> Self { self.inner.port = port; self }
    pub fn tls(mut self, on: bool) -> Self { self.inner.tls = on; self }
    pub fn build(self) -> Result<ConnConfig, ConfigError> {
        if self.inner.host.is_empty() { return Err(ConfigError::MissingHost); }
        if self.inner.port == 0 { return Err(ConfigError::BadPort); }
        Ok(self.inner)
    }
}
```

> **Rule of thumb:** more than four parameters, or any boolean parameter, means a
> builder or a config struct.

## Errors are part of the API

```rust
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]                                   // add variants without breaking callers
pub enum StoreError {
    #[error("key not found")]
    NotFound,
    #[error("value too large: {size} > {max}")]
    TooLarge { size: usize, max: usize },
    #[error("backend unavailable")]
    Unavailable(#[source] std::io::Error),
}
```

Three requirements for a public error type:

1. **`Display`** that a human can act on.
2. **`source()`** so the cause chain survives.
3. **`#[non_exhaustive]`** so adding a variant is not a semver break.

Never return `Box<dyn Error>` from a library. The caller cannot match on it and you
have taken away their ability to retry intelligently.

## Object safety and `impl Trait` in return position

```rust
// returns an unnameable type — the caller gets zero-cost iteration
pub fn evens(&self) -> impl Iterator<Item = u32> + '_ {
    self.data.iter().copied().filter(|n| n % 2 == 0)
}

// returns a trait object — the caller can box it, store it, mix types
pub fn handler(&self) -> Box<dyn Fn(u32) -> u32 + Send + Sync> { ... }
```

`impl Trait` in return position is the default. Use `Box<dyn _>` when the caller
needs to store heterogeneous values.

## Sealed traits

```rust
mod private { pub trait Sealed {} }

/// Implementable only inside this crate, so you can add methods later.
pub trait Encoder: private::Sealed {
    fn encode(&self, out: &mut Vec<u8>);
}

impl private::Sealed for Json {}
impl Encoder for Json { fn encode(&self, out: &mut Vec<u8>) { out.push(b'j'); } }
```

This is how you ship a trait without freezing its method set.

## Documentation that cannot rot

```rust
/// Splits a line into a key and a value.
///
/// # Examples
/// ```
/// # use mycrate::split_kv;
/// assert_eq!(split_kv("a=1"), Some(("a", "1")));
/// assert_eq!(split_kv("nope"), None);
/// ```
///
/// # Errors
/// Returns `None` when the line contains no `=`.
pub fn split_kv(line: &str) -> Option<(&str, &str)> {
    line.split_once('=')
}
```

Doc examples are compiled and run by `cargo test`. They are the only documentation
that cannot drift from the code.

## Semver discipline

| Change | Breaking? |
| --- | --- |
| add a method to a trait | yes (unless sealed) |
| add an enum variant | yes (unless `#[non_exhaustive]`) |
| add a struct field | yes (unless `#[non_exhaustive]` or private) |
| add a defaulted generic parameter | yes |
| add a new public function | no |
| change `impl Trait` to a named type | yes |

`cargo-semver-checks` in CI catches the ones you miss.

## Exercises

1. Turn a `fn send(to: &str, amount: f64, currency: &str)` into a typed API that
   cannot be misused.
2. Add a builder with validation to an existing struct and make the invalid states
   unconstructable.
3. Write a `#[non_exhaustive]` error enum with `#[source]` and confirm `{:#}` prints
   the whole chain.

**Next:** [Architecture and boundaries](02-architecture.md)
