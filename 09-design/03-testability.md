# 03 · Designing for testability

Testability is a design property, not a testing activity. Code that is hard to test
is usually badly coupled, and the fix is architectural.

## Inject what you cannot control

Three things make code untestable: the clock, randomness, and I/O. Abstract all
three at the boundary.

```rust
pub trait Clock: Send + Sync {
    fn now(&self) -> chrono::DateTime<chrono::Utc>;
}

pub struct SystemClock;
impl Clock for SystemClock {
    fn now(&self) -> chrono::DateTime<chrono::Utc> { chrono::Utc::now() }
}
```

```rust
pub fn is_expired(token: &Token, clock: &dyn Clock) -> bool {
    clock.now() > token.expires_at
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixed(chrono::DateTime<chrono::Utc>);
    impl Clock for Fixed {
        fn now(&self) -> chrono::DateTime<chrono::Utc> { self.0 }
    }

    #[test]
    fn expires_after_deadline() {
        let token = Token { expires_at: chrono::Utc::now() };
        let later = Fixed(token.expires_at + chrono::Duration::seconds(1));
        assert!(is_expired(&token, &later));
    }
}
```

No `sleep`, no flakiness, no wall-clock dependency. This one change removes most
slow tests in a typical codebase.

## Test the domain without the world

```rust
// domain: pure, so a test is three lines
#[test]
fn cannot_withdraw_more_than_balance() {
    let mut acct = Account::new(Paise(100));
    let err = acct.withdraw(Paise(150)).unwrap_err();
    assert_eq!(err, LedgerError::InsufficientFunds {
        needed: Paise(150), available: Paise(100),
    });
}
```

If a business rule needs a database to test, the rule is in the wrong layer.

## Fakes over mocks

```rust
#[cfg(test)]
#[derive(Default)]
pub struct InMemoryUsers {
    rows: std::sync::Mutex<std::collections::HashMap<u64, User>>,
}

#[cfg(test)]
#[async_trait::async_trait]
impl UserRepo for InMemoryUsers {
    async fn find(&self, id: UserId) -> Result<Option<User>, RepoError> {
        Ok(self.rows.lock().unwrap().get(&id.0).cloned())
    }
    async fn save(&self, user: &User) -> Result<(), RepoError> {
        self.rows.lock().unwrap().insert(user.id.0, user.clone());
        Ok(())
    }
}
```

A hand-written fake is 20 lines, has no framework, and lets you assert on state
rather than on call counts. Reach for `mockall` only when you must assert *that* a
call happened.

## Test the HTTP layer in-process

```rust
use axum::body::Body;
use axum::http::{Request, StatusCode};
use tower::ServiceExt;

#[tokio::test]
async fn create_user_returns_201() {
    let app = router(test_state());
    let res = app
        .oneshot(
            Request::post("/v1/users")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"email":"a@x.com"}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::CREATED);
}
```

`oneshot` runs routing, extractors, middleware and error mapping with no socket and
no port. This is the highest-value test in a service.

## Test the database with a database

```rust
#[sqlx::test(migrations = "./migrations")]
async fn persists_and_finds(pool: sqlx::PgPool) {
    let repo = PgUserRepo::new(pool);
    repo.save(&User::new(1, "a@x.com")).await.unwrap();
    assert_eq!(repo.find(UserId(1)).await.unwrap().unwrap().email, "a@x.com");
}
```

Never mock the query layer — you end up testing your mock and shipping SQL typos.

## Golden tests for output

```rust
#[test]
fn renders_invoice() {
    let html = render(&fixture_invoice());
    insta::assert_snapshot!(html);
}
```

Snapshots are the right tool for CLI output, JSON payloads and rendered documents —
anywhere writing assertions by hand is busywork. `cargo insta review` shows a diff
and lets you accept it deliberately.

## What to test, ranked

1. **The invariant that costs money** — a ledger nets to zero.
2. **The boundary** — empty, one, max, invalid UTF-8, negative.
3. **The error path** — every `Err` variant reachable, with the right payload.
4. **The regression** — one test per bug fixed, named after the bug.

Coverage percentage is a weak signal; `cargo mutants` tells you whether your tests
would notice a change at all.

## Exercises

1. Introduce a `Clock` trait and remove every `sleep` from your test suite.
2. Write an in-memory `UserRepo` and test a use case with no database.
3. Add a snapshot test for a JSON endpoint and review it with `cargo insta`.

**Next:** [Concurrency architecture](04-concurrency-architecture.md)
