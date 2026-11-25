# 03 · Testing and Benchmarking

Rust's test story is unusually good: tests live in the same file, they are just
functions, and the doc examples in your comments are tests too.

## Unit tests

```rust
// src/lib.rs
pub fn add(a: i32, b: i32) -> i32 { a + b }

pub fn divide(a: f64, b: f64) -> Result<f64, &'static str> {
    if b == 0.0 { Err("division by zero") } else { Ok(a / b) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds() {
        assert_eq!(add(2, 2), 4);
    }

    #[test]
    fn divide_rejects_zero() {
        assert!(divide(1.0, 0.0).is_err());
    }

    #[test]
    #[should_panic(expected = "boom")]
    fn panics_with_message() {
        panic!("boom");
    }

    #[test]
    fn result_returning_test() -> Result<(), Box<dyn std::error::Error>> {
        let v: i32 = "42".parse()?;      // `?` works in tests
        assert_eq!(v, 42);
        Ok(())
    }

    #[test]
    #[ignore = "requires a database"]
    fn needs_db() { }
}
```

`#[cfg(test)]` means the module is only compiled for `cargo test`, so it costs
nothing in release builds. `use super::*` gives access to the parent module's
items — including private ones, which is why unit tests can test internals.

### Assertions

```rust
assert!(cond);
assert_eq!(a, b);                          // needs Debug + PartialEq
assert_ne!(a, b);
assert_eq!(a, b, "custom message: {a}");

// float comparison — never use ==
let (x, y) = (0.1 + 0.2, 0.3);
assert!((x - y).abs() < 1e-9);

// Option / Result helpers
assert!(result.is_ok());
assert_eq!(result.unwrap(), 5);
assert!(matches!(value, Some(1..=9)));
```

## Integration tests

`tests/` is a separate crate. It can only use your **public** API — which is
exactly the check you want for a library.

```rust
// tests/api.rs
use mylib::{add, divide};

#[test]
fn public_api_works() {
    assert_eq!(add(1, 1), 2);
    assert!(divide(1.0, 0.0).is_err());
}
```

```bash
$ cargo test --test api       # one integration test file
$ cargo test --lib            # only unit tests
```

### Shared helpers

```text
tests/
├── common/
│   └── mod.rs        # NOT compiled as its own test binary
└── users.rs          # uses `mod common;`
```

```rust
// tests/users.rs
mod common;

#[tokio::test]
async fn creates_user() {
    let app = common::spawn_test_app().await;
    // ...
}
```

Any `.rs` file directly in `tests/` becomes a test binary; a subdirectory does
not.

## Async tests

```toml
[dev-dependencies]
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

```rust
#[tokio::test]
async fn fetches() {
    let v = async { 1 + 1 }.await;
    assert_eq!(v, 2);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn concurrent() { }
```

## Doc tests

```rust
/// Multiplies two numbers.
///
/// ```
/// use mylib::mul;
/// assert_eq!(mul(3, 4), 12);
/// ```
///
/// Failing examples can be marked:
///
/// ```should_panic
/// mylib::mul(1, 0);   // this does not panic — this block FAILS
/// ```
///
/// ```no_run
/// mylib::mul(1, 2);   // compiled but not executed
/// ```
///
/// ```ignore
/// // neither compiled nor run
/// ```
///
/// ```compile_fail
/// let x: i32 = "string";
/// ```
pub fn mul(a: i32, b: i32) -> i32 { a * b }
```

Doc tests are why Rust's documentation is trustworthy: every example on docs.rs
was executed on the author's machine.

> **Gotcha:** doc tests link against your crate as an external user would, so
> they can only see public items. And they are slow to compile in bulk — `cargo
> test --lib` skips them when you are iterating fast.

## Test organisation that scales

```text
src/
├── lib.rs
├── domain/
│   ├── mod.rs
│   ├── user.rs          # #[cfg(test)] mod tests inline
│   └── order.rs
tests/
├── integration/
│   ├── mod.rs
│   ├── api_users.rs
│   └── api_orders.rs
└── e2e.rs
benches/
└── parse.rs
```

Rule: unit tests next to the code (they test internals), integration tests in
`tests/` (they test the API), end-to-end tests as a separate crate or a shell
script against a running service.

## Test doubles

### Hand-written traits (preferred)

```rust
pub trait Clock: Send + Sync {
    fn now(&self) -> chrono::DateTime<chrono::Utc>;
}

pub struct SystemClock;
impl Clock for SystemClock {
    fn now(&self) -> chrono::DateTime<chrono::Utc> { chrono::Utc::now() }
}

#[cfg(test)]
pub struct FixedClock(pub chrono::DateTime<chrono::Utc>);
#[cfg(test)]
impl Clock for FixedClock {
    fn now(&self) -> chrono::DateTime<chrono::Utc> { self.0 }
}
```

Time, randomness, and I/O are the three things worth abstracting. Everything else
can usually be tested directly.

### `mockall`

```toml
mockall = "0.13"
```

```rust
#[cfg_attr(test, mockall::automock)]
pub trait Mailer {
    fn send(&self, to: &str, body: &str) -> Result<(), String>;
}

#[cfg(test)]
mod tests {
    use super::*;
    use mockall::predicate::*;

    #[test]
    fn sends_welcome() {
        let mut m = MockMailer::new();
        m.expect_send()
            .with(eq("a@x.com"), contains("welcome"))
            .times(1)
            .returning(|_, _| Ok(()));
        notify(&m, "a@x.com");
    }
}
```

## Property-based testing with `proptest`

Instead of one example, generate hundreds and shrink failures to a minimal case.

```toml
[dev-dependencies]
proptest = "1"
```

```rust
use proptest::prelude::*;

fn encode(s: &str) -> String { s.chars().map(|c| c as u32).map(|n| format!("{n:x}")).collect() }

proptest! {
    #[test]
    fn roundtrip(s in ".*") {
        let enc = encode(&s);
        let dec: String = enc.split('-').filter(|p| !p.is_empty())
            .map(|p| char::from_u32(u32::from_str_radix(p, 16).unwrap()).unwrap())
            .collect();
        prop_assert_eq!(dec, s);
    }

    #[test]
    fn sort_is_idempotent(mut v in prop::collection::vec(any::<i32>(), 0..100)) {
        v.sort();
        let once = v.clone();
        v.sort();
        prop_assert_eq!(v, once);
    }
}
```

The value is in the shrunk counter-example: instead of `[1, 2, 3]` you get the
exact minimal input that breaks the invariant.

## Snapshot testing with `insta`

```toml
[dev-dependencies]
insta = { version = "1", features = ["json"] }
```

```rust
#[test]
fn renders_report() {
    let report = build_report(&sample_data());
    insta::assert_json_snapshot!(report);
}
```

First run writes `.snap.new` files; `cargo insta review` shows a diff and lets
you accept. Ideal for CLI output, HTML rendering, and JSON API responses.

## Benchmarking with `criterion`

```toml
[dev-dependencies]
criterion = { version = "0.5", features = ["html_reports"] }

[[bench]]
name = "parse"
harness = false
```

```rust
// benches/parse.rs
use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};

fn parse_baseline(input: &str) -> usize { input.len() }

fn bench_parse(c: &mut Criterion) {
    let input = "a=1;b=2;c=3;".repeat(100);

    c.bench_function("baseline", |b| {
        b.iter(|| parse_baseline(black_box(&input)))
    });

    let mut group = c.benchmark_group("sizes");
    for size in [10, 100, 1000] {
        let data = "x".repeat(size);
        group.bench_with_input(BenchmarkId::from_parameter(size), &data, |b, d| {
            b.iter(|| parse_baseline(black_box(d)))
        });
    }
    group.finish();
}

criterion_group!(benches, bench_parse);
criterion_main!(benches);
```

```bash
$ cargo bench
$ cargo bench -- --save-baseline before
$ # make a change
$ cargo bench -- --baseline before
```

`black_box` stops the optimiser from constant-folding your benchmark into
nothing. Criterion does statistical analysis, detects regressions, and writes
HTML reports with plots to `target/criterion/`.

> **Gotcha:** benchmarking a debug build measures nothing useful. Criterion uses
> the `bench` profile (release-like) automatically — but `cargo run` does not.

## Running tests fast: `cargo-nextest`

```bash
$ cargo install cargo-nextest --locked
$ cargo nextest run
$ cargo nextest run --workspace --no-fail-fast
```

Nextest runs each test in its own process (so a segfault or a leaked global does
not poison the suite), parallelises better than `cargo test`, and has a cleaner
output format. On large suites it is 2–5× faster.

## Coverage

```bash
$ cargo install cargo-llvm-cov
$ cargo llvm-cov --html --open
$ cargo llvm-cov --workspace --lcov --output-path lcov.info
```

Do not chase 100%. Aim for coverage of decision points — every `match` arm, every
`Err` path — not every line.

## A worked example: testing an HTTP handler

```rust
use axum::{routing::get, Router, Json};
use serde::Serialize;

#[derive(Serialize)]
struct Pong { pong: bool }

async fn ping() -> Json<Pong> { Json(Pong { pong: true }) }

pub fn app() -> Router { Router::new().route("/ping", get(ping)) }

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use http_body_util::BodyExt;
    use tower::ServiceExt;          // for `oneshot`

    #[tokio::test]
    async fn ping_returns_pong() {
        let response = app()
            .oneshot(Request::builder().uri("/ping").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = response.into_body().collect().await.unwrap().to_bytes();
        let v: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(v["pong"], true);
    }
}
```

`oneshot` runs the router without binding a port. That is the fastest and most
reliable way to test HTTP handlers.

## CI gate

```yaml
- run: cargo fmt --all -- --check
- run: cargo clippy --workspace --all-targets -- -D warnings
- run: cargo nextest run --workspace
- run: cargo test --doc --workspace
```

---

## Exercises

1. Add a unit test module to a module with a private helper, and assert on the
   private function directly.
2. Write an integration test that uses only the public API, then make the
   function private and confirm it fails to compile.
3. Write a doc test that is `should_panic` and one that is `compile_fail`.
4. Introduce a `Clock` trait, implement `SystemClock` and `FixedClock`, and test
   a function that uses it.
5. Write a proptest for `fn reverse(s: &str) -> String` asserting
   `reverse(reverse(s)) == s`.
6. Benchmark two implementations of the same string parser with criterion and
   report the ratio.

**Next:** [Tooling and CI](04-tooling-ci.md)
