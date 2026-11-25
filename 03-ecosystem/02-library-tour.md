# 02 · The Library Tour

The crates that do the heavy lifting. Every entry states what it is for, the
version line to add, and a snippet that compiles.

## Serialisation

### `serde` + `serde_json`

The universal (de)serialisation framework. Almost every other crate integrates
with it.

```toml
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct User {
    id: u64,
    email: String,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(default)]
    active: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    avatar: Option<String>,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let json = r#"{"id":1,"email":"a@x.com","createdAt":"2026-01-01"}"#;
    let u: User = serde_json::from_str(json)?;
    println!("{}", serde_json::to_string_pretty(&u)?);
    Ok(())
}
```

Useful attributes: `rename_all = "camelCase"`, `tag = "type"` (internally
tagged enums), `flatten` (merge a nested struct), `deny_unknown_fields`,
`skip`, `with` (custom module for a field).

Alternatives: `rkyv` (zero-copy, very fast), `bincode`/`postcard` (compact
binary), `toml`, `serde_yaml`, `quick-xml`.

## Async runtime

### `tokio`

The default async runtime. Hyper, Axum, SQLx, reqwest and tonic all build on it.

```toml
tokio = { version = "1", features = ["rt-multi-thread", "macros", "time", "sync", "net"] }
```

Alternatives: `async-std` (simpler, less used now), `smol` (tiny), `embassy`
(embedded, no_std).

## Web

### `axum`

HTTP framework by the Tokio team. Built on `tower`, so every middleware is a
tower layer. Ergonomic extractors, no macro DSL.

```toml
axum = "0.8"
tokio = { version = "1", features = ["full"] }
```

```rust
use axum::{routing::get, Router, Json, extract::Path};
use serde::Serialize;

#[derive(Serialize)]
struct Health { ok: bool }

async fn health() -> Json<Health> { Json(Health { ok: true }) }

async fn user(Path(id): Path<u64>) -> String { format!("user {id}") }

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/health", get(health))
        .route("/users/{id}", get(user));   // 0.8 uses {id}, not :id
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```

| Framework | Style | Notes |
| --- | --- | --- |
| `axum` | extractors, tower | default choice, huge ecosystem |
| `actix-web` | actor-ish, macros | very fast, older design |
| `rocket` | macros, batteries included | nice DX, slower release cadence |
| `poem`, `warp`, `salvo` | variants | niche |

### `tower` / `tower-http`

Middleware: timeouts, rate limits, compression, tracing, CORS, static files.

```toml
tower-http = { version = "0.6", features = ["trace", "cors", "compression-gzip"] }
```

```rust
use tower_http::{trace::TraceLayer, cors::CorsLayer, compression::CompressionLayer};

let app = Router::new()
    .route("/", get(|| async { "ok" }))
    .layer(TraceLayer::new_for_http())
    .layer(CompressionLayer::new())
    .layer(CorsLayer::permissive());
```

### `reqwest`

HTTP client, sync or async.

```toml
reqwest = { version = "0.12", features = ["json", "rustls-tls"] }
```

```rust
let resp = reqwest::Client::new()
    .get("https://api.github.com/repos/rust-lang/rust")
    .header("User-Agent", "my-app")
    .send()
    .await?
    .error_for_status()?
    .json::<serde_json::Value>()
    .await?;
```

Reuse one `Client` for the whole process — it owns the connection pool. Creating
one per request destroys keep-alive and TLS session reuse.

## Databases

### `sqlx`

Async SQL with compile-time checked queries. No DSL, no hidden queries.

```toml
sqlx = { version = "0.8", features = ["runtime-tokio", "postgres", "macros", "chrono", "uuid", "migrate"] }
```

```rust
let user: Option<User> = sqlx::query_as::<_, User>("SELECT id, email FROM users WHERE id = $1")
    .bind(id)
    .fetch_optional(&pool)
    .await?;
```

With `DATABASE_URL` set at build time, `sqlx::query_as!` validates the SQL and
infers types. Runtime-checked `query_as` needs no build-time DB.

| Option | Style | Notes |
| --- | --- | --- |
| `sqlx` | async, raw SQL, checked | best default |
| `diesel` | sync, typed DSL, ORM | excellent compile-time safety, no async |
| `sea-orm` | async ORM on sqlx | entity generation |
| `rusqlite` | sync SQLite | simple, embedded |

## CLI

### `clap`

```toml
clap = { version = "4", features = ["derive", "env"] }
```

```rust
use clap::{Parser, Subcommand};

#[derive(Parser, Debug)]
#[command(name = "mytool", version, about = "Does useful things")]
struct Cli {
    /// Verbose logging
    #[arg(short, long, global = true)]
    verbose: bool,

    /// Config file
    #[arg(short, long, env = "MYTOOL_CONFIG", default_value = "mytool.toml")]
    config: String,

    #[command(subcommand)]
    cmd: Command,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// Import a file
    Import {
        #[arg(value_name = "FILE")]
        path: std::path::PathBuf,
        #[arg(long, default_value_t = false)]
        dry_run: bool,
    },
    /// Print statistics
    Stats {
        #[arg(long, value_parser = clap::value_parser!(u32).range(1..=100))]
        top: u32,
    },
}
```

Free from the derive: `--help`, `--version`, shell completions (with
`clap_complete`), validation and error messages.

Alternatives: `argh` (smaller), `bpaf`, `lexopt` (minimal, no deps).

### Terminal output

```toml
anyhow = "1"
indicatif = "0.17"        # progress bars
console = "0.15"          # colours, terminal width
dialoguer = "0.11"        # interactive prompts
owo-colors = "4"          # simple colours
```

## Errors and logging

```toml
thiserror = "2"           # libraries
anyhow = "1"              # applications
tracing = "0.1"           # structured logging
tracing-subscriber = { version = "0.3", features = ["env-filter", "json"] }
```

```rust
use tracing::{info, instrument, warn};

#[instrument(skip(pool), fields(user_id = id))]
async fn load(id: u64, pool: &sqlx::PgPool) -> anyhow::Result<()> {
    info!("loading user");
    warn!(retries = 2, "retrying");
    Ok(())
}
```

`tracing` beats `log` because it carries structured fields and spans, which
becomes real traces when you add `tracing-opentelemetry`.

## Time and IDs

```toml
chrono = { version = "0.4", features = ["serde"] }     # datetime, timezone-aware
time = "0.3"                                            # alternative
uuid = { version = "1", features = ["v4", "serde"] }   # UUIDs
ulid = "1"                                              # sortable IDs
```

```rust
use chrono::{DateTime, Utc, Duration};
let now: DateTime<Utc> = Utc::now();
let later = now + Duration::hours(1);
let id = uuid::Uuid::new_v4();
```

Prefer `Utc` everywhere internally; convert at the edges.

## Concurrency and parallelism

```toml
rayon = "1"                # data parallelism
crossbeam = "0.8"          # channels, scoped threads, lock-free structures
parking_lot = "0.12"       # faster Mutex/RwLock
dashmap = "6"              # concurrent HashMap
flume = "0.11"             # mpsc/MPMC channels
```

## Data and text

```toml
regex = "1"
glob = "0.3"
walkdir = "2"
memchr = "2"
csv = "1"
quick-xml = "0.36"
polars = { version = "0.4x", features = ["lazy"] }   # dataframes
arrow = "5x"
```

## Observability

```toml
prometheus = "0.13"
opentelemetry = "0.27"
opentelemetry-otlp = "0.27"
metrics = "0.24"
```

## Validation and config

```toml
validator = { version = "0.19", features = ["derive"] }
config = "0.14"
dotenvy = "0.15"
figment = "0.10"
```

## Testing

```toml
[dev-dependencies]
proptest = "1"
insta = "1"                # snapshot testing
mockall = "0.13"
wiremock = "0.6"           # mock HTTP servers
criterion = "0.5"
rstest = "0.23"            # fixtures and parametrised tests
```

## Utilities you will reach for constantly

```toml
itertools = "0.13"         # extra iterator adapters
once_cell = "1"            # Lazy / OnceCell (std has LazyLock now)
indexmap = "2"             # insertion-ordered HashMap
smallvec = "1"             # inline small vectors
bytes = "1"                # cheap byte buffers (axum/tokio use it)
humantime = "2"            # parse/format durations
tempfile = "3"             # temp dirs in tests
rand = "0.8"
```

## Picking a crate: a checklist

1. **Maintenance** — commits in the last 6 months? Issues answered?
2. **Downloads** — `cargo add` shows popularity; check the crates.io page.
3. **Dependency weight** — `cargo tree -p <crate> | wc -l`. A 200-crate tree for
   a small job is a red flag.
4. **Unsafe usage** — check `cargo geiger`; a parser with lots of `unsafe`
   deserves scrutiny.
5. **License** — most Rust is MIT/Apache-2.0 dual. `cargo deny` checks this in
   CI (module 03.04).
6. **Bus factor** — one maintainer with no releases for two years is a risk you
   are taking on.

---

## Exercises

1. Add `serde` with `rename_all = "camelCase"` and `skip_serializing_if` to a
   struct; verify with `serde_json::to_string`.
2. Stand up a two-route Axum server and hit it with `curl`.
3. Write a `clap` CLI with two subcommands and a `--verbose` global flag.
4. Use `sqlx` against SQLite to insert and query one row.
5. Replace a `log`-style `println!` with `tracing::info!` and add
   `tracing-subscriber` with `EnvFilter`.
6. Run `cargo tree -p regex | wc -l` and `cargo tree -p clap | wc -l`. Compare
   dependency weight.

**Next:** [Testing and benchmarking](03-testing.md)
