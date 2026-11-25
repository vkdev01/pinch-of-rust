# 02 · Architecture and boundaries

The most expensive decision in a Rust codebase is not which framework — it is where
the crate boundaries are, because those decide what recompiles and what can be
tested without a database.

## The three-layer layout that scales

```text
crates/
├── domain/        pure types + rules, no I/O, no async
├── app/           use cases: orchestrates domain + ports
├── adapters/      postgres, http, queue implementations
└── api/           binary: wires adapters into app, runs the server
```

Dependencies point **inward only**:

```text
api ──> adapters ──> app ──> domain
                              ^
                    nothing depends on this except the layers above
```

`domain` has no `sqlx`, no `axum`, no `tokio`. That single rule buys you:

- unit tests that run in microseconds
- a compile unit that almost never changes, so it never recompiles
- the ability to change the database without touching business rules

[[fig:arch-layers]]

## Ports and adapters, concretely

```rust
// crates/domain/src/lib.rs — the port is a trait, defined where it is used
#[async_trait::async_trait]
pub trait UserRepo: Send + Sync {
    async fn find(&self, id: UserId) -> Result<Option<User>, RepoError>;
    async fn save(&self, user: &User) -> Result<(), RepoError>;
}
```

```rust
// crates/adapters/src/pg_user_repo.rs — the adapter lives outside the domain
pub struct PgUserRepo { pool: sqlx::PgPool }

#[async_trait::async_trait]
impl UserRepo for PgUserRepo {
    async fn find(&self, id: UserId) -> Result<Option<User>, RepoError> {
        sqlx::query_as!(User, "SELECT id, email FROM users WHERE id = $1", id.0)
            .fetch_optional(&self.pool)
            .await
            .map_err(RepoError::from)
    }
    async fn save(&self, user: &User) -> Result<(), RepoError> { /* … */ Ok(()) }
}
```

```rust
// the app layer takes the trait, not the database
pub async fn rename(repo: &dyn UserRepo, id: UserId, name: &str) -> Result<(), AppError> {
    let mut user = repo.find(id).await?.ok_or(AppError::NotFound)?;
    user.rename(name)?;                       // domain rule, unit-testable
    repo.save(&user).await?;
    Ok(())
}
```

## When to split into crates

| Symptom | Action |
| --- | --- |
| `cargo build` takes minutes | split rarely-changed code out |
| you want tests without a DB | a domain crate with no I/O deps |
| two binaries share logic | a shared library crate |
| "for tidiness" | **do not** — modules are free, crates cost compile time |

Start with modules. Split when compile time or dependency isolation forces you.

## Feature flags as an architecture tool

```toml
[features]
default = ["postgres"]
postgres = ["sqlx/postgres"]
metrics = ["dep:prometheus"]
```

```rust
#[cfg(feature = "metrics")]
pub mod metrics;
```

> **Gotcha:** features are additive and unified across the graph. You cannot use one
> to disable something another crate enabled. Design them as "add capability".

## The dependency rule nobody enforces but you should

```toml
# crates/domain/Cargo.toml — the whole file is the architecture
[dependencies]
serde.workspace = true
thiserror.workspace = true
```

If `domain` ever needs `sqlx`, the layering has broken. That six-line manifest is
the cheapest architecture test in existence — a reviewer can see the violation in
the diff.

## Configuration at the edge

```rust
// parse once, at startup, into a typed struct; pass it down
pub struct Config { pub db: DbConfig, pub http: HttpConfig, pub limits: Limits }

impl Config {
    pub fn from_env() -> anyhow::Result<Self> { /* … */ }
}
```

Never call `std::env::var` deep inside a handler. Environment reads scattered through
the code are untestable and invisible.

## Async boundaries

```rust
// fine: async all the way down
async fn handler(...) -> Result<Json<T>, ApiError> { app::list(&repo).await }

// wrong: blocking inside async
async fn handler(...) { std::fs::read(path); }        // blocks a worker thread

// right: hand blocking work to the blocking pool
async fn handler(...) { tokio::task::spawn_blocking(move || std::fs::read(path)).await?; }
```

Keep the async boundary at the edge. The domain stays synchronous and pure; adapters
decide whether to be async.

## What good looks like, in one file tree

```text
crates/api/src/main.rs        ~40 lines: config, pool, router, serve, shutdown
crates/api/src/routes/        one file per resource, thin
crates/app/src/               one function per use case
crates/domain/src/            types, invariants, no I/O
crates/adapters/src/          one file per external system
```

If `main.rs` is 400 lines, the wiring has leaked into the entry point.

## Exercises

1. Take a single-crate service and split it into `domain` + `app` + `adapters` + `api`.
2. Prove the layering by adding a test that uses `app` with an in-memory repo.
3. Add a `metrics` feature that compiles a module only when enabled.

**Next:** [Designing for testability](03-testability.md)
