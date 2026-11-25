---
summary: Fixtures, fakes, property tests, snapshot tests and database tests — the shapes that hold up as a codebase grows.
level: Intermediate
time: 15 min
tags: [testing, quality]
---

# Testing recipes

## A test that needs a fixture

```rust
fn fixture(name: &str) -> String {
    format!("{}/tests/fixtures/{name}", env!("CARGO_MANIFEST_DIR"))
}

#[test]
fn parses_sample() {
    let text = std::fs::read_to_string(fixture("sample.log")).unwrap();
    assert_eq!(parse(&text).unwrap().len(), 42);
}
```

`CARGO_MANIFEST_DIR` makes the path independent of where `cargo test` is run from.

## A test that needs a temp dir

```rust
#[test]
fn writes_and_reads_back() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("out.txt");
    std::fs::write(&path, b"hello").unwrap();
    assert_eq!(std::fs::read_to_string(&path).unwrap(), "hello");
}   // dir dropped -> removed, even if the assert fails
```

## Testing a trait with a hand-written fake

```rust
pub trait Clock: Send + Sync {
    fn now_ms(&self) -> u64;
}

#[cfg(test)]
struct FrozenClock(u64);

#[cfg(test)]
impl Clock for FrozenClock {
    fn now_ms(&self) -> u64 { self.0 }
}

#[test]
fn expires_after_ttl() {
    let clock = FrozenClock(1_000);
    let mut cache = Cache::new(500, &clock);
    cache.insert("k", "v");
    assert!(cache.get("k").is_some());
    // move time forward without sleeping
    let later = FrozenClock(1_600);
    assert!(cache.get_at("k", &later).is_none());
}
```

Injecting the clock is the single highest-value testability change you can make.
It removes `sleep()` from tests and makes expiry deterministic.

## A mock with `mockall`

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
    fn sends_one_welcome_email() {
        let mut m = MockMailer::new();
        m.expect_send()
            .with(eq("a@x.com"), contains("welcome"))
            .times(1)
            .returning(|_, _| Ok(()));

        notify_signup(&m, "a@x.com").unwrap();
    }
}
```

## A property test instead of 20 examples

```rust
use proptest::prelude::*;

fn encode(s: &str) -> String { s.bytes().map(|b| format!("{b:02x}")).collect() }
fn decode(s: &str) -> String {
    (0..s.len()).step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap() as char)
        .collect()
}

proptest! {
    #[test]
    fn roundtrip(s in "[ -~]{0,64}") {
        prop_assert_eq!(decode(&encode(&s)), s);
    }
}
```

The generator is constrained to printable ASCII — a property test with an
unconstrained input is usually testing the wrong thing.

## A snapshot test for output that is hard to assert on

```rust
#[test]
fn renders_report() {
    let html = render(&sample_data());
    insta::assert_snapshot!(html);
    // first run writes .snap.new; `cargo insta review` shows a diff and accepts it
}
```

Snapshots are the right tool for CLI output, rendered HTML and JSON payloads —
anything where writing assertions by hand is busywork.

## A database test with a real database

```rust
#[sqlx::test(migrations = "./migrations")]
async fn creates_and_finds(pool: sqlx::PgPool) {
    let id = create(&pool, "a@x.com").await.unwrap();
    let found = find(&pool, id).await.unwrap().unwrap();
    assert_eq!(found.email, "a@x.com");
}
```

`#[sqlx::test]` creates a fresh database per test and runs migrations. Never mock
the database layer — you end up testing your mock.

## An HTTP handler test with no network

```rust
use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use tower::ServiceExt;

#[tokio::test]
async fn health_returns_ok() {
    let app = router(test_state());
    let res = app
        .oneshot(Request::builder().uri("/healthz").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
}
```

`oneshot` runs the whole router — extractors, middleware, error mapping — in
process, in microseconds.

## A CLI test that checks exit codes

```rust
use assert_cmd::Command;

#[test]
fn exits_1_when_nothing_matches() {
    Command::cargo_bin("mytool").unwrap()
        .args(["search", "zzz", "."])
        .assert()
        .code(1);                 // not 0, not 2
}
```

## What to test, ranked

1. **The invariant that would cost money** — money nets to zero, a ledger balances.
2. **The boundary** — empty input, one element, the maximum, invalid UTF-8.
3. **The error path** — every `Err` variant is reachable and carries the right data.
4. **The regression** — one test per bug you fix, named after the bug.

Line coverage is a weak signal. Mutation testing (`cargo mutants`) tells you
whether your tests would notice a change at all.

**Next:** [Cargo and build recipes](06-cargo-and-build.md)
