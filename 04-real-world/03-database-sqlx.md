# 03 · Databases with SQLx

SQLx is async SQL with **compile-time query checking**. You write SQL, and the
compiler verifies it against a real database schema.

## Setup

```toml
[dependencies]
sqlx = { version = "0.8", features = [
    "runtime-tokio",
    "tls-rustls",
    "postgres",
    "macros",
    "migrate",
    "chrono",
    "uuid",
    "json",
] }
tokio = { version = "1", features = ["full"] }
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
serde = { version = "1", features = ["derive"] }
```

```bash
$ export DATABASE_URL="postgres://user:pass@localhost:5432/appdb"
```

`DATABASE_URL` is needed at **build** time for `query!`/`query_as!` macros. For
CI without a live DB, use `SQLX_OFFLINE=true` with a cached `.sqlx/` directory
(see below).

## Connection pool

```rust
use sqlx::postgres::PgPoolOptions;
use std::time::Duration;

pub async fn connect(database_url: &str) -> anyhow::Result<sqlx::PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(10)          // match the DB's max_connections / replicas
        .min_connections(2)
        .acquire_timeout(Duration::from_secs(5))
        .idle_timeout(Duration::from_secs(600))
        .max_lifetime(Duration::from_secs(1800))
        .connect(database_url)
        .await?;
    Ok(pool)
}
```

> **Rule of thumb:** `max_connections × replicas < database max_connections`.
> Ten replicas with a default pool of 10 against a Postgres with 100 connections
> gives you connection-refused errors under load, not slow queries.

## Migrations

```bash
$ sqlx migrate add create_users
$ sqlx migrate run
$ sqlx migrate revert
$ sqlx migrate info
```

```sql
-- migrations/20260101000000_create_users.sql
CREATE TABLE users (
    id          BIGSERIAL PRIMARY KEY,
    email       TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    plan        TEXT NOT NULL DEFAULT 'free',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email ON users (email);
```

Run them at startup:

```rust
sqlx::migrate!("./migrations").run(&pool).await?;
```

`migrate!` embeds the SQL files into the binary at compile time — the container
needs no migrations directory at runtime. Migrations are checksummed, so editing
an applied migration is an error (correctly).

> **Gotcha:** never edit a migration that has run anywhere. Add a new one. The
> checksum mismatch will stop your production deploy.

## Typed queries

### Compile-time checked (the point of SQLx)

```rust
#[derive(Debug, sqlx::FromRow, serde::Serialize)]
pub struct User {
    pub id: i64,
    pub email: String,
    pub name: String,
    pub plan: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

pub async fn find(pool: &sqlx::PgPool, id: i64) -> sqlx::Result<Option<User>> {
    sqlx::query_as!(User, "SELECT id, email, name, plan, created_at FROM users WHERE id = $1", id)
        .fetch_optional(pool)
        .await
}

pub async fn list(pool: &sqlx::PgPool, limit: i64, offset: i64) -> sqlx::Result<Vec<User>> {
    sqlx::query_as!(User,
        "SELECT id, email, name, plan, created_at FROM users ORDER BY id LIMIT $1 OFFSET $2",
        limit, offset)
        .fetch_all(pool)
        .await
}

pub async fn create(pool: &sqlx::PgPool, email: &str, name: &str) -> sqlx::Result<User> {
    sqlx::query_as!(User,
        r#"INSERT INTO users (email, name)
           VALUES ($1, $2)
           RETURNING id, email, name, plan, created_at"#,
        email, name)
        .fetch_one(pool)
        .await
}
```

Three guarantees you get from `query_as!`:

1. The SQL parses and the tables/columns exist.
2. The parameter count and types match.
3. The result columns match the struct's fields (including nullability —
   a `NULL`-able column requires `Option<T>`).

A typo in a column name is a **compile error**, not a 3 a.m. incident.

### Runtime-checked (when you cannot have a build-time DB)

```rust
sqlx::query_as::<_, User>("SELECT id, email, name, plan, created_at FROM users WHERE id = $1")
    .bind(id)
    .fetch_optional(pool)
    .await
```

Same API, no compile-time verification. Use this in a workspace where the DB is
not available at build time, and keep at least the integration tests on the
checked macros.

### Offline mode for CI

```bash
$ cargo sqlx prepare          # writes .sqlx/*.json — COMMIT THIS
$ SQLX_OFFLINE=true cargo build
```

`.sqlx/` stores the schema metadata for every checked query, so CI needs no
database. Regenerate it whenever a query or migration changes — add
`cargo sqlx prepare --check` to CI to catch a stale cache.

## Inserts, updates, upserts

```rust
// insert, ignore the result
let res = sqlx::query("INSERT INTO events (kind, payload) VALUES ($1, $2)")
    .bind("signup")
    .bind(serde_json::json!({"source": "web"}))
    .execute(pool)
    .await?;
println!("inserted {}", res.rows_affected());

// upsert — the most useful Postgres idiom
sqlx::query_as!(User,
    r#"INSERT INTO users (email, name)
       VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE
         SET name = EXCLUDED.name, updated_at = now()
       RETURNING id, email, name, plan, created_at"#,
    email, name)
    .fetch_one(pool)
    .await?;

// partial update with COALESCE — one query, no dynamic SQL
sqlx::query_as!(User,
    r#"UPDATE users
       SET name = COALESCE($2, name), plan = COALESCE($3, plan), updated_at = now()
       WHERE id = $1
       RETURNING id, email, name, plan, created_at"#,
    id, name, plan)
    .fetch_optional(pool)
    .await?;
```

That `COALESCE` pattern is how you do a PATCH without building SQL strings, which
is what keeps you safe from injection and from a combinatorial explosion of
queries.

## Transactions

```rust
pub async fn transfer(
    pool: &sqlx::PgPool,
    from: i64,
    to: i64,
    amount: i64,
) -> anyhow::Result<()> {
    let mut tx = pool.begin().await?;

    let debited = sqlx::query("UPDATE accounts SET balance = balance - $1 WHERE id = $2 AND balance >= $1")
        .bind(amount).bind(from)
        .execute(&mut *tx)
        .await?;

    if debited.rows_affected() == 0 {
        anyhow::bail!("insufficient funds");   // tx drops → ROLLBACK
    }

    sqlx::query("UPDATE accounts SET balance = balance + $1 WHERE id = $2")
        .bind(amount).bind(to)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(())
}
```

`&mut *tx` is needed because the executor borrows the connection. Dropping the
transaction without `commit()` rolls back automatically — RAII again, and the
reason a `?` inside a transaction is safe.

## Dynamic filters without string building

```rust
pub struct UserFilter { pub plan: Option<String>, pub q: Option<String> }

pub async fn search(pool: &sqlx::PgPool, f: &UserFilter, limit: i64) -> sqlx::Result<Vec<User>> {
    sqlx::query_as!(User,
        r#"SELECT id, email, name, plan, created_at FROM users
           WHERE ($1::text IS NULL OR plan = $1)
             AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%' OR email ILIKE '%' || $2 || '%')
           ORDER BY id DESC
           LIMIT $3"#,
        f.plan, f.q, limit)
        .fetch_all(pool)
        .await
}
```

> **Gotcha:** `$1::text IS NULL OR plan = $1` needs the explicit cast so Postgres
> can infer the parameter type. Without `::text` you get "could not determine
> data type of parameter $1".

For genuinely dynamic query shapes (variable column lists, sorts), use
`QueryBuilder` — it parameterises values correctly:

```rust
use sqlx::QueryBuilder;

let mut qb: QueryBuilder<sqlx::Postgres> =
    QueryBuilder::new("SELECT id, email, name, plan, created_at FROM users WHERE 1=1");

if let Some(plan) = &f.plan {
    qb.push(" AND plan = ").push_bind(plan);
}
qb.push(" ORDER BY id DESC LIMIT ").push_bind(limit);

let rows = qb.build_query_as::<User>().fetch_all(pool).await?;
```

Never `format!` a value into SQL. `push_bind` is the only safe way.

## Row-by-row streaming for large results

```rust
use futures::TryStreamExt;

let mut rows = sqlx::query_as!(User, "SELECT id, email, name, plan, created_at FROM users")
    .fetch(pool);

while let Some(user) = rows.try_next().await? {
    process(user).await?;      // constant memory, regardless of table size
}
```

`fetch_all` on a 10M-row table will exhaust memory. `fetch` streams.

## JSON columns

```rust
#[derive(serde::Serialize, serde::Deserialize)]
struct Prefs { theme: String, emails: bool }

let prefs: Prefs = sqlx::query_scalar("SELECT prefs FROM users WHERE id = $1")
    .bind(id)
    .fetch_one(pool)
    .await?;

sqlx::query("UPDATE users SET prefs = $1 WHERE id = $2")
    .bind(sqlx::types::Json(&prefs))
    .bind(id)
    .execute(pool)
    .await?;
```

## Repository pattern: testable data access

```rust
#[async_trait::async_trait]
pub trait UserRepo: Send + Sync {
    async fn find(&self, id: i64) -> anyhow::Result<Option<User>>;
    async fn create(&self, email: &str, name: &str) -> anyhow::Result<User>;
}

pub struct PgUserRepo { pool: sqlx::PgPool }

#[async_trait::async_trait]
impl UserRepo for PgUserRepo {
    async fn find(&self, id: i64) -> anyhow::Result<Option<User>> {
        Ok(sqlx::query_as!(User, "SELECT ... WHERE id = $1", id)
            .fetch_optional(&self.pool).await?)
    }
    async fn create(&self, email: &str, name: &str) -> anyhow::Result<User> {
        Ok(sqlx::query_as!(User, "INSERT ... RETURNING ...", email, name)
            .fetch_one(&self.pool).await?)
    }
}
```

Now handlers depend on `Arc<dyn UserRepo>`, and tests use an in-memory
implementation. Note `async_trait` here — with plain `async fn` in traits you
cannot easily make `dyn` objects.

## Testing against a real database

Two approaches:

**1. A throwaway database per test run** — use `sqlx::test`, which creates and
drops a fresh database and runs migrations:

```rust
#[sqlx::test(migrations = "./migrations")]
async fn creates_and_finds_user(pool: sqlx::PgPool) {
    let u = create(&pool, "a@x.com", "A").await.unwrap();
    let found = find(&pool, u.id).await.unwrap().unwrap();
    assert_eq!(found.email, "a@x.com");
}
```

**2. Testcontainers** — start Postgres in Docker from the test process:

```toml
[dev-dependencies]
testcontainers = "0.23"
testcontainers-modules = { version = "0.11", features = ["postgres"] }
```

```rust
use testcontainers_modules::{postgres::Postgres, testcontainers::runners::AsyncRunner};

let container = Postgres::default().start().await.unwrap();
let port = container.get_host_port_ipv4(5432).await.unwrap();
let url = format!("postgres://postgres:postgres@127.0.0.1:{port}/postgres");
```

> **Rule of thumb:** mock the repository in unit tests, use a real Postgres in
> integration tests. Never mock `sqlx` itself — you end up testing your mock.

## Postgres specifics worth knowing

```sql
-- keyset pagination: fast at any offset, unlike OFFSET
SELECT id, email FROM users WHERE id > $1 ORDER BY id LIMIT 50;

-- advisory lock for a singleton job
SELECT pg_try_advisory_lock(42);

-- skip locked: multiple workers, no duplicate work
SELECT id FROM jobs WHERE status = 'pending'
ORDER BY created_at
FOR UPDATE SKIP LOCKED
LIMIT 10;

-- jsonb containment query with an index
CREATE INDEX idx_events_payload ON events USING GIN (payload);
SELECT * FROM events WHERE payload @> '{"kind":"signup"}';
```

`FOR UPDATE SKIP LOCKED` is the single most useful pattern for a Postgres-backed
job queue — it is the whole of module 04.04.

## Connection-per-request vs pool

Use the pool. A `PgPool` is `Clone` and internally `Arc`-based; cloning it into
every handler is the intended usage.

---

## Exercises

1. Create a `users` table with a migration, then write `find`, `list` and
   `create` with `query_as!` and confirm a typo in a column name fails to compile.
2. Implement a PATCH handler using the `COALESCE` update pattern.
3. Write a `transfer` transaction with a balance check and a test that proves a
   failed transfer leaves both balances unchanged.
4. Add keyset pagination to `list` and compare `EXPLAIN ANALYZE` output against
   `OFFSET 100000`.
5. Build a `UserRepo` trait, a `PgUserRepo`, and an in-memory fake; write a
   handler test using the fake.
6. Run `cargo sqlx prepare` and confirm a build with `SQLX_OFFLINE=true` and no
   database.

**Next:** [Background jobs and queues](04-background-jobs.md)
