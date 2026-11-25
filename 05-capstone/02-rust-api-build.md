# 02 · Building the Rust API

The full source of the `pulse` workspace. Every file here exists in the
`capstone/` directory of this repo.

## Workspace

```toml
# Cargo.toml
[workspace]
resolver = "2"
members = ["crates/domain", "crates/api", "crates/worker"]

[workspace.package]
version = "0.1.0"
edition = "2021"
license = "MIT OR Apache-2.0"

[workspace.dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["rt-multi-thread", "macros", "net", "signal", "time", "sync"] }
axum = "0.8"
sqlx = { version = "0.8", features = ["runtime-tokio", "tls-rustls", "postgres", "macros", "migrate", "chrono", "uuid", "json"] }
tower = "0.5"
tower-http = { version = "0.6", features = ["trace", "cors", "compression-gzip", "timeout", "limit"] }
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "json"] }
thiserror = "2"
anyhow = "1"
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1", features = ["v4", "serde"] }
sha2 = "0.10"
hex = "0.4"

[workspace.lints.clippy]
all = { level = "warn", priority = -1 }
```

## `crates/domain` — types and rules, no I/O

```rust
// crates/domain/src/lib.rs
pub mod dashboard;
pub mod events;
pub mod money;

pub use dashboard::*;
pub use events::*;
pub use money::*;
```

```rust
// crates/domain/src/money.rs
use serde::{Deserialize, Serialize};

/// An amount in paise (1 INR = 100 paise). Never use floats for money.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Paise(pub i64);

impl Paise {
    pub const ZERO: Paise = Paise(0);

    pub fn rupees(&self) -> f64 {
        self.0 as f64 / 100.0
    }

    pub fn checked_add(self, other: Paise) -> Option<Paise> {
        self.0.checked_add(other.0).map(Paise)
    }

    /// Percentage change from `self` to `next`, rounded to one decimal.
    pub fn pct_change(self, next: Paise) -> f64 {
        if self.0 == 0 {
            return 0.0;
        }
        let raw = (next.0 - self.0) as f64 / self.0 as f64 * 100.0;
        (raw * 10.0).round() / 10.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_to_rupees() {
        assert_eq!(Paise(499_000).rupees(), 4990.0);
    }

    #[test]
    fn computes_percentage_change() {
        assert_eq!(Paise(1000).pct_change(Paise(1120)), 12.0);
        assert_eq!(Paise(0).pct_change(Paise(500)), 0.0);
    }
}
```

```rust
// crates/domain/src/events.rs
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EventKind {
    ApiCall,
    StorageWrite,
    JobRun,
}

impl EventKind {
    pub fn as_str(self) -> &'static str {
        match self {
            EventKind::ApiCall => "api_call",
            EventKind::StorageWrite => "storage_write",
            EventKind::JobRun => "job_run",
        }
    }

    pub fn parse(s: &str) -> Result<Self, DomainError> {
        match s {
            "api_call" => Ok(EventKind::ApiCall),
            "storage_write" => Ok(EventKind::StorageWrite),
            "job_run" => Ok(EventKind::JobRun),
            other => Err(DomainError::UnknownEventKind(other.to_string())),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct IngestEvent {
    pub kind: String,
    #[serde(default = "one")]
    pub quantity: i64,
    #[serde(default)]
    pub meta: serde_json::Value,
}

fn one() -> i64 { 1 }

#[derive(Debug, Error, PartialEq)]
pub enum DomainError {
    #[error("unknown event kind `{0}`")]
    UnknownEventKind(String),
    #[error("quantity must be between 1 and 1,000,000 (got {0})")]
    BadQuantity(i64),
    #[error("event metadata must be a JSON object")]
    BadMeta,
}

impl IngestEvent {
    pub fn validate(&self) -> Result<(EventKind, i64), DomainError> {
        let kind = EventKind::parse(&self.kind)?;
        if !(1..=1_000_000).contains(&self.quantity) {
            return Err(DomainError::BadQuantity(self.quantity));
        }
        if !self.meta.is_null() && !self.meta.is_object() {
            return Err(DomainError::BadMeta);
        }
        Ok((kind, self.quantity))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unknown_kind() {
        let e = IngestEvent { kind: "nope".into(), quantity: 1, meta: serde_json::json!({}) };
        assert!(e.validate().is_err());
    }

    #[test]
    fn rejects_zero_quantity() {
        let e = IngestEvent { kind: "api_call".into(), quantity: 0, meta: serde_json::json!({}) };
        assert_eq!(e.validate(), Err(DomainError::BadQuantity(0)));
    }

    #[test]
    fn accepts_valid_event() {
        let e = IngestEvent { kind: "job_run".into(), quantity: 5, meta: serde_json::json!({}) };
        assert_eq!(e.validate().unwrap(), (EventKind::JobRun, 5));
    }
}
```

```rust
// crates/domain/src/dashboard.rs
use serde::{Deserialize, Serialize};
use crate::Paise;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Dashboard {
    pub mrr: Paise,
    pub mrr_change_pct: f64,
    pub active_users: i64,
    pub active_users_change_pct: f64,
    pub churn_pct: f64,
    pub plans: Vec<PlanRow>,
    pub usage: Vec<UsageDay>,
    pub invoices: Vec<InvoiceRow>,
    pub quota: Quota,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanRow {
    pub name: String,
    pub count: i64,
    pub mrr: Paise,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageDay {
    pub day: String,
    pub api_calls: i64,
    pub storage_writes: i64,
    pub job_runs: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvoiceRow {
    pub id: i64,
    pub number: String,
    pub amount: Paise,
    pub status: String,
    pub period: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Quota {
    pub used: i64,
    pub limit: i64,
}
```

## `crates/api` — the server

```rust
// crates/api/src/main.rs
use std::process::ExitCode;
use pulse_api::{config::Config, AppState, router};

#[tokio::main]
async fn main() -> ExitCode {
    if let Err(e) = run().await {
        eprintln!("fatal: {e:#}");
        return ExitCode::FAILURE;
    }
    ExitCode::SUCCESS
}

async fn run() -> anyhow::Result<()> {
    pulse_api::telemetry::init();

    let cfg = Config::from_env()?;
    let pool = pulse_api::db::connect(&cfg.database_url).await?;

    sqlx::migrate!("../../migrations").run(&pool).await?;
    tracing::info!("migrations applied");

    let state = AppState::new(pool, cfg.clone());
    let app = router(state);

    let listener = tokio::net::TcpListener::bind(&cfg.bind_addr).await?;
    tracing::info!(addr = %listener.local_addr()?, "listening");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async { tokio::signal::ctrl_c().await.ok(); };
    let term = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("install SIGTERM handler")
            .recv()
            .await;
    };
    tokio::select! { _ = ctrl_c => {}, _ = term => {} }
    tracing::info!("shutdown signal received");
}
```

```rust
// crates/api/src/lib.rs
pub mod auth;
pub mod config;
pub mod db;
pub mod error;
pub mod handlers;
pub mod telemetry;

use std::sync::Arc;
use axum::{routing::{get, post}, Router};
use sqlx::PgPool;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub cfg: config::Config,
}

impl AppState {
    pub fn new(pool: PgPool, cfg: config::Config) -> Arc<Self> {
        Arc::new(Self { pool, cfg })
    }
}

pub fn router(state: Arc<AppState>) -> Router {
    use tower_http::{compression::CompressionLayer, timeout::TimeoutLayer, trace::TraceLayer};

    Router::new()
        .route("/healthz", get(handlers::health::live))
        .route("/readyz", get(handlers::health::ready))
        .route("/v1/events", post(handlers::events::ingest))
        .route("/v1/dashboard", get(handlers::dashboard::get))
        .route("/v1/invoices", get(handlers::invoices::list))
        .route("/v1/invoices/{id}/pay", post(handlers::invoices::pay))
        .with_state(state)
        .layer(
            tower::ServiceBuilder::new()
                .layer(TraceLayer::new_for_http())
                .layer(CompressionLayer::new())
                .layer(TimeoutLayer::new(std::time::Duration::from_secs(30))),
        )
}
```

```rust
// crates/api/src/error.rs
use axum::{http::StatusCode, response::{IntoResponse, Response}, Json};
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("unauthorized")]
    Unauthorized,
    #[error("not found")]
    NotFound,
    #[error("{0}")]
    Validation(String),
    #[error(transparent)]
    Domain(#[from] pulse_domain::DomainError),
    #[error("database error")]
    Db(#[from] sqlx::Error),
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, code) = match &self {
            ApiError::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized"),
            ApiError::NotFound => (StatusCode::NOT_FOUND, "not_found"),
            ApiError::Validation(_) | ApiError::Domain(_) => {
                (StatusCode::UNPROCESSABLE_ENTITY, "validation")
            }
            ApiError::Db(_) => {
                tracing::error!(error = %self, "database failure");
                (StatusCode::INTERNAL_SERVER_ERROR, "internal")
            }
        };

        let message = match status {
            StatusCode::INTERNAL_SERVER_ERROR => "internal error".to_string(),
            _ => self.to_string(),
        };

        (status, Json(json!({ "error": { "code": code, "message": message } }))).into_response()
    }
}

pub type ApiResult<T> = Result<T, ApiError>;
```

```rust
// crates/api/src/auth.rs
use axum::{extract::FromRequestParts, http::{request::Parts, StatusCode}};
use sha2::{Digest, Sha256};

pub struct TenantId(pub i64);

pub fn hash_key(raw: &str) -> String {
    let mut h = Sha256::new();
    h.update(raw.as_bytes());
    hex::encode(h.finalize())
}

impl FromRequestParts<std::sync::Arc<crate::AppState>> for TenantId {
    type Rejection = StatusCode;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &std::sync::Arc<crate::AppState>,
    ) -> Result<Self, Self::Rejection> {
        let raw = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .ok_or(StatusCode::UNAUTHORIZED)?;

        let hash = hash_key(raw.trim());
        let row: Option<(i64,)> = sqlx::query_as(
            "SELECT tenant_id FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL",
        )
        .bind(hash)
        .fetch_optional(&state.pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        row.map(|(id,)| TenantId(id)).ok_or(StatusCode::UNAUTHORIZED)
    }
}
```

```rust
// crates/api/src/handlers/events.rs
use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use pulse_domain::IngestEvent;

use crate::{auth::TenantId, error::ApiResult, AppState};

#[derive(Debug, Deserialize)]
pub struct IngestBody {
    pub events: Vec<IngestEvent>,
}

#[derive(Debug, Serialize)]
pub struct IngestResponse {
    pub accepted: usize,
}

pub async fn ingest(
    State(state): State<Arc<AppState>>,
    TenantId(tenant): TenantId,
    Json(body): Json<IngestBody>,
) -> ApiResult<(StatusCode, Json<IngestResponse>)> {
    if body.events.is_empty() {
        return Err(crate::error::ApiError::Validation("no events".into()));
    }
    if body.events.len() > 1000 {
        return Err(crate::error::ApiError::Validation("max 1000 events per request".into()));
    }

    // validate everything before writing anything
    let mut rows = Vec::with_capacity(body.events.len());
    for e in &body.events {
        let (kind, qty) = e.validate()?;
        rows.push((kind.as_str(), qty, e.meta.clone()));
    }

    let mut tx = state.pool.begin().await?;
    for (kind, qty, meta) in &rows {
        sqlx::query(
            "INSERT INTO events (tenant_id, kind, quantity, meta) VALUES ($1, $2, $3, $4)",
        )
        .bind(tenant)
        .bind(*kind)
        .bind(*qty)
        .bind(meta)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;

    Ok((StatusCode::ACCEPTED, Json(IngestResponse { accepted: rows.len() })))
}
```

```rust
// crates/api/src/handlers/dashboard.rs
use axum::{extract::State, Json};
use std::sync::Arc;
use pulse_domain::{Dashboard, InvoiceRow, Paise, PlanRow, Quota, UsageDay};

use crate::{auth::TenantId, error::ApiResult, AppState};

pub async fn get(
    State(state): State<Arc<AppState>>,
    TenantId(tenant): TenantId,
) -> ApiResult<Json<Dashboard>> {
    let plans: Vec<(String, i64, i64)> = sqlx::query_as(
        "SELECT plan, COUNT(*)::bigint, (COUNT(*) * 499000)::bigint
         FROM tenants GROUP BY plan ORDER BY 3 DESC",
    )
    .fetch_all(&state.pool)
    .await?;

    let mrr: i64 = plans.iter().map(|(_, _, m)| *m).sum();

    let usage_rows: Vec<(chrono::NaiveDate, String, i64)> = sqlx::query_as(
        "SELECT day, kind, total FROM usage_daily
         WHERE tenant_id = $1 AND day >= CURRENT_DATE - INTERVAL '13 days'
         ORDER BY day",
    )
    .bind(tenant)
    .fetch_all(&state.pool)
    .await?;

    let mut usage: Vec<UsageDay> = Vec::new();
    for (day, kind, total) in usage_rows {
        let key = day.format("%Y-%m-%d").to_string();
        let entry = match usage.iter_mut().find(|u| u.day == key) {
            Some(e) => e,
            None => {
                usage.push(UsageDay {
                    day: key,
                    api_calls: 0,
                    storage_writes: 0,
                    job_runs: 0,
                });
                usage.last_mut().expect("just pushed")
            }
        };
        match kind.as_str() {
            "api_call" => entry.api_calls = total,
            "storage_write" => entry.storage_writes = total,
            "job_run" => entry.job_runs = total,
            _ => {}
        }
    }

    let invoice_rows: Vec<(i64, String, i64, String, String)> = sqlx::query_as(
        "SELECT id, number, amount_paise, status, to_char(period_start, 'YYYY-MM')
         FROM invoices WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 12",
    )
    .bind(tenant)
    .fetch_all(&state.pool)
    .await?;

    let used: i64 = usage.iter().map(|u| u.api_calls).sum();

    Ok(Json(Dashboard {
        mrr: Paise(mrr),
        mrr_change_pct: 12.4,
        active_users: 1842,
        active_users_change_pct: 3.1,
        churn_pct: 1.8,
        plans: plans
            .into_iter()
            .map(|(name, count, m)| PlanRow { name, count, mrr: Paise(m) })
            .collect(),
        usage,
        invoices: invoice_rows
            .into_iter()
            .map(|(id, number, amount, status, period)| InvoiceRow {
                id,
                number,
                amount: Paise(amount),
                status,
                period,
            })
            .collect(),
        quota: Quota { used, limit: 500_000 },
    }))
}
```

> **Note on the demo numbers:** `mrr_change_pct`, `active_users` and `churn_pct`
> are hard-coded in this skeleton so the dashboard has something to render before
> you have historical data. The exercises ask you to compute them properly from
> a `metrics_daily` table.

## `crates/worker` — rollups and jobs

```rust
// crates/worker/src/main.rs
use std::time::Duration;
use sqlx::PgPool;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    pulse_api::telemetry::init();
    let url = std::env::var("DATABASE_URL")?;
    let pool = pulse_api::db::connect(&url).await?;
    let worker = format!("worker-{}", std::process::id());

    let pool2 = pool.clone();
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(60));
        loop {
            tick.tick().await;
            if let Err(e) = rollup_yesterday(&pool2).await {
                tracing::error!(error = %e, "rollup failed");
            }
        }
    });

    loop {
        if let Err(e) = tick(&pool, &worker).await {
            tracing::error!(error = %e, "worker tick failed");
            tokio::time::sleep(Duration::from_secs(5)).await;
        }
    }
}

async fn tick(pool: &PgPool, worker: &str) -> anyhow::Result<()> {
    let jobs: Vec<(i64, String, serde_json::Value, i32)> = sqlx::query_as(
        r#"UPDATE jobs SET status = 'running', attempts = attempts + 1,
                locked_at = now(), locked_by = $1
           WHERE id IN (
             SELECT id FROM jobs WHERE status = 'pending' AND run_at <= now()
             ORDER BY run_at FOR UPDATE SKIP LOCKED LIMIT 10
           )
           RETURNING id, kind, payload, attempts"#,
    )
    .bind(worker)
    .fetch_all(pool)
    .await?;

    for (id, kind, payload, attempts) in jobs {
        let result = match kind.as_str() {
            "rollup_day" => rollup_day(pool, &payload).await,
            other => Err(anyhow::anyhow!("unknown job kind {other}")),
        };
        match result {
            Ok(()) => {
                sqlx::query("UPDATE jobs SET status='done', locked_at=NULL WHERE id=$1")
                    .bind(id).execute(pool).await?;
            }
            Err(e) => {
                let delay = (1i64 << attempts.min(10)).min(3600);
                sqlx::query(
                    "UPDATE jobs SET status='pending', last_error=$2, locked_at=NULL,
                     run_at = now() + make_interval(secs => $3) WHERE id=$1",
                )
                .bind(id).bind(e.to_string()).bind(delay as f64)
                .execute(pool).await?;
                tracing::warn!(id, error = %e, "job failed, will retry");
            }
        }
    }
    Ok(())
}

async fn rollup_day(pool: &PgPool, payload: &serde_json::Value) -> anyhow::Result<()> {
    let day = payload["day"].as_str().ok_or_else(|| anyhow::anyhow!("missing day"))?;
    sqlx::query(
        r#"INSERT INTO usage_daily (tenant_id, day, kind, total)
           SELECT tenant_id, $1::date, kind, SUM(quantity)
           FROM events
           WHERE occurred_at >= $1::date AND occurred_at < $1::date + 1
           GROUP BY tenant_id, kind
           ON CONFLICT (tenant_id, day, kind)
           DO UPDATE SET total = EXCLUDED.total"#,
    )
    .bind(day)
    .execute(pool)
    .await?;
    tracing::info!(day, "rollup complete");
    Ok(())
}

async fn rollup_yesterday(pool: &PgPool) -> anyhow::Result<()> {
    let yesterday = (chrono::Utc::now().date_naive() - chrono::Duration::days(1))
        .format("%Y-%m-%d")
        .to_string();
    let payload = serde_json::json!({ "day": yesterday });
    sqlx::query(
        "INSERT INTO jobs (kind, payload) VALUES ('rollup_day', $1)
         ON CONFLICT DO NOTHING",
    )
    .bind(payload)
    .execute(pool)
    .await?;
    Ok(())
}
```

## Verifying it

```bash
$ docker run -d --name pulse-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
$ export DATABASE_URL="postgres://postgres:postgres@localhost/pulse"
$ sqlx database create && sqlx migrate run

$ cargo run -p api &
$ curl localhost:8080/healthz
$ curl localhost:8080/readyz

# seed a tenant + key
$ psql "$DATABASE_URL" -c "INSERT INTO tenants (name, plan) VALUES ('Acme', 'pro');"
$ KEY=$(openssl rand -hex 16)
$ psql "$DATABASE_URL" -c "INSERT INTO api_keys (tenant_id, key_hash, prefix)
    VALUES (1, encode(sha256('$KEY'::bytea), 'hex'), '${KEY:0:8}');"

$ curl -X POST localhost:8080/v1/events \
  -H "Authorization: Bearer $KEY" -H 'content-type: application/json' \
  -d '{"events":[{"kind":"api_call","quantity":3},{"kind":"job_run"}]}'

$ curl localhost:8080/v1/dashboard -H "Authorization: Bearer $KEY" | jq
```

> **Gotcha:** the `sha256` above must match `hash_key()` — the same bytes, the
> same encoding. `encode(sha256($1::bytea), 'hex')` produces lowercase hex, which
> is what `hex::encode` produces. A mismatch gives you a 401 you will spend an
> hour on.

## Exercises

1. Implement `metrics_daily` and compute `mrr_change_pct`, `active_users` and
   `churn_pct` from real data instead of the hard-coded values.
2. Add `POST /v1/invoices/{id}/pay` and make it idempotent.
3. Add pagination to `/v1/invoices` with keyset pagination.
4. Add a `usage_daily` backfill command that rolls up the last 90 days.
5. Write an integration test with `sqlx::test` covering ingest → dashboard.
6. Add a request-id middleware that puts `x-request-id` into every log line.

---

**Next:** [The dashboard frontend](03-frontend-dashboard.md)
