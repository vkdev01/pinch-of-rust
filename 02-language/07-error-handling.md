# 07 · Error Handling

Rust has no exceptions. Errors are values, returned as `Result<T, E>`. This is
the single biggest structural difference from Python/Java/JS, and it is worth
learning properly because half of all Rust code review comments are about it.

## The two kinds of failure

| | Recoverable | Unrecoverable |
| --- | --- | --- |
| Example | file not found, invalid input, network timeout | index out of bounds, assertion failure, bug |
| Mechanism | `Result<T, E>` | `panic!` |
| Caller's job | handle it | nothing — the process aborts or unwinds |

> **Rule of thumb:** `panic!` is for *programmer* errors (invariant violations).
> `Result` is for *expected* failures. "The user typed garbage" is not a panic;
> "this match arm is unreachable but I got here anyway" is.

## `panic!`

```rust
fn main() {
    panic!("boom: {}", 42);
}
```

```text
thread 'main' panicked at src/main.rs:2:5:
boom: 42
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace
```

Things that panic implicitly:

```rust
let v = vec![1];
v[10];                          // index out of bounds
let n: i32 = "x".parse().unwrap();   // unwrap on Err
let d = 1 / 0;                  // integer division by zero
let s = String::from("héllo");
&s[0..2];                       // byte index not on a char boundary
```

### Unwinding vs aborting

By default a panic **unwinds**: it runs destructors up the stack and then the
thread ends. That is safe but costs binary size.

```toml
[profile.release]
panic = "abort"    # smaller binary, no unwinding, no catch_unwind
```

Use `abort` for binaries where you never catch panics (most servers and CLIs).
Keep unwinding if you use `catch_unwind` (e.g. a web framework isolating a
handler's panic).

### `unwrap`, `expect`, `?`

```rust
let n: i32 = "42".parse().unwrap();        // panics with a useless message
let n: i32 = "42".parse().expect("port must be a number");  // panics with context

let n: i32 = "42".parse()?;                // propagates — the right default
```

> **Rule of thumb:** `unwrap()` is acceptable in tests, examples, and where the
> compiler has already proven the value exists (`split_once` right after a
> `contains` check). Everywhere else, use `?` or `expect` with a message that
> explains what was being attempted.

## `Result` basics

```rust
use std::fs;
use std::io;

fn read_len(path: &str) -> Result<usize, io::Error> {
    let s = fs::read_to_string(path)?;
    Ok(s.len())
}
```

`?` desugars to:

```rust
let s = match fs::read_to_string(path) {
    Ok(v) => v,
    Err(e) => return Err(From::from(e)),   // note the From — this is key
};
```

The `From::from` is why `?` can convert error types automatically: if
`impl From<io::Error> for MyError` exists, `?` in a function returning
`Result<_, MyError>` just works.

## Defining your own error type, by hand

```rust
use std::fmt;
use std::num::ParseIntError;

#[derive(Debug)]
pub enum ConfigError {
    Missing(&'static str),
    Invalid { key: String, reason: String },
    Io(std::io::Error),
    Parse(ParseIntError),
}

impl fmt::Display for ConfigError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Missing(k) => write!(f, "missing required key `{k}`"),
            Self::Invalid { key, reason } => write!(f, "`{key}` is invalid: {reason}"),
            Self::Io(e) => write!(f, "io error: {e}"),
            Self::Parse(e) => write!(f, "parse error: {e}"),
        }
    }
}

impl std::error::Error for ConfigError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(e) => Some(e),
            Self::Parse(e) => Some(e),
            _ => None,
        }
    }
}

impl From<std::io::Error> for ConfigError {
    fn from(e: std::io::Error) -> Self { Self::Io(e) }
}
impl From<ParseIntError> for ConfigError {
    fn from(e: ParseIntError) -> Self { Self::Parse(e) }
}
```

`source()` builds an error chain, which `anyhow` and most loggers print as
"caused by: ...". This is what makes a stack trace of causes possible without a
backtrace.

## `thiserror` — the derive version

In practice nobody writes the above by hand.

```toml
[dependencies]
thiserror = "2"
```

```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("missing required key `{0}`")]
    Missing(&'static str),

    #[error("`{key}` is invalid: {reason}")]
    Invalid { key: String, reason: String },

    #[error("io error")]
    Io(#[from] std::io::Error),           // #[from] also writes the From impl

    #[error("could not parse number")]
    Parse(#[from] std::num::ParseIntError),
}
```

One attribute does the `Display`, the `Error`, and the `From`. Use `thiserror`
for **library** error types — the enum is public API, callers can match on
variants, and the type has no hidden dependencies.

### `#[source]` and `#[from]`

```rust
#[derive(Debug, Error)]
pub enum AppError {
    #[error("database error")]
    Db(#[source] sqlx::Error),      // #[source] = no From impl, keeps the chain
}
```

## `anyhow` — the application version

```toml
anyhow = "1"
```

```rust
use anyhow::{Context, Result, bail, ensure};

fn load_config(path: &str) -> Result<Config> {
    let raw = std::fs::read_to_string(path)
        .with_context(|| format!("reading config from {path}"))?;

    let cfg: Config = toml::from_str(&raw)
        .context("parsing config TOML")?;

    ensure!(!cfg.host.is_empty(), "host must not be empty");
    if cfg.port == 0 { bail!("port must be non-zero"); }

    Ok(cfg)
}
```

`anyhow::Error` is a boxed `dyn Error` with a context chain. It is for
**binaries**: you print it, you do not match on it.

```rust
fn main() -> anyhow::Result<()> {
    let cfg = load_config("app.toml")?;
    Ok(())
}
```

With `{:#}` formatting you get the whole chain on one line; `{:?}` gives the
multi-line version with a backtrace if `RUST_BACKTRACE=1`.

### The rule

| Crate type | Error type |
| --- | --- |
| Library (others call it) | `thiserror` enum — typed, matchable, `#[non_exhaustive]` |
| Application / binary | `anyhow::Result<T>` — context, no ceremony |
| Both | `thiserror` in the domain crate, `anyhow` at the edges |

> **Gotcha:** never expose `anyhow::Error` in a public library API. Callers
> cannot match on it, cannot retry intelligently, and it locks them to your
> crate's version of `anyhow`.

## Converting between them

```rust
// domain (thiserror) → app (anyhow): automatic, via From<dyn Error>
fn handler() -> anyhow::Result<()> {
    let user = repo.find(1)?;      // DomainError → anyhow::Error
    Ok(())
}

// app → domain: explicit, you must decide the mapping
match handler() {
    Err(e) => return Err(DomainError::Internal(e.to_string())),
    Ok(()) => {}
}
```

## Error handling in `main`

Three shapes, in increasing order of usefulness:

```rust
// 1. panics on error — fine for examples
fn main() { let _ = run().unwrap(); }

// 2. prints Debug on error, exits 1
fn main() -> Result<(), Box<dyn std::error::Error>> { run()?; Ok(()) }

// 3. full control — message to stderr, exit code, no panic noise
fn main() -> std::process::ExitCode {
    match run() {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("error: {e:#}");
            std::process::ExitCode::FAILURE
        }
    }
}
```

Shape 2 is the one to reach for in a CLI. Shape 3 when the exit code matters
(e.g. `2` for usage errors, like `grep`).

## Retries and backoff

```rust
use std::time::Duration;
use anyhow::Result;

async fn with_retry<T, F, Fut>(attempts: u32, mut op: F) -> Result<T>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<T>>,
{
    let mut delay = Duration::from_millis(100);
    let mut last = None;
    for n in 0..attempts {
        match op().await {
            Ok(v) => return Ok(v),
            Err(e) => {
                tracing::warn!(attempt = n + 1, error = %e, "retrying");
                last = Some(e);
                tokio::time::sleep(delay).await;
                delay = (delay * 2).min(Duration::from_secs(10));
            }
        }
    }
    Err(last.unwrap())
}
```

Retry only **transient** errors: timeouts, 5xx, connection resets. Retrying a
400 or a validation error just wastes time. This is why typed errors matter —
`anyhow` cannot tell you which kind you got.

## Error design principles

**1. Make the error message actionable.** Include the value, the key, the path.

```rust
// bad
Err(Error::Invalid)

// good
Err(Error::Invalid { field: "port".into(), value: "abc".into(), expected: "u16" })
```

**2. Do not lose the source.** Always wire `#[source]`/`#[from]` so the chain
survives. `format!("{e}")` into a new `String` error throws away the cause.

**3. Mark public error enums `#[non_exhaustive]`.**

```rust
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum ApiError { #[error("not found")] NotFound }
```

This lets you add variants without a breaking change, because callers cannot
exhaustively match.

**4. Return `Result` from constructors that validate.** A smart constructor is
the only way to guarantee a type's invariant.

**5. Do not return `Result` when nothing can fail.** `fn name(&self) -> &str`,
not `-> Result<&str, Infallible>`.

## A worked example: layered errors

```rust
use thiserror::Error;

// ---- domain crate ----
#[derive(Debug, Error)]
pub enum DomainError {
    #[error("user {0} not found")]
    NotFound(u64),
    #[error("email already registered")]
    Duplicate,
    #[error("invalid email: {0}")]
    InvalidEmail(String),
}

// ---- infrastructure crate ----
#[derive(Debug, Error)]
pub enum StoreError {
    #[error(transparent)]
    Domain(#[from] DomainError),
    #[error("database unavailable")]
    Unavailable(#[source] sqlx::Error),
}

// ---- application (binary) ----
use anyhow::Context;

async fn create_user(email: &str) -> anyhow::Result<u64> {
    if !email.contains('@') {
        return Err(DomainError::InvalidEmail(email.into()))
            .context("validating signup payload");
    }
    // ...
    Ok(1)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let id = create_user("a@b.com").context("creating user")?;
    println!("created {id}");
    Ok(())
}
```

Printing that failure chain with `{:#}`:

```text
creating user: validating signup payload: invalid email: a@b.com
```

Every layer adds context without losing the original cause. That is the whole
design.

---

## Exercises

1. Write `fn parse_port(s: &str) -> Result<u16, ConfigError>` with a `thiserror`
   enum covering "empty", "not a number" and "out of range".
2. Add `#[from] std::io::Error` and confirm `?` works without a manual `From`.
3. Convert a `thiserror` enum into `anyhow::Result` at a binary boundary with
   `.context("loading config")` and print the chain with `{:#}`.
4. Write a retry helper that only retries a `Transient` variant of your own error
   enum, and immediately returns on `Permanent`.
5. Find every `unwrap()` in a small project and classify each as
   (a) provably safe, (b) should be `?`, (c) should be `expect` with a message.

**Next:** [Modules, crates, packages](08-modules-crates.md)
