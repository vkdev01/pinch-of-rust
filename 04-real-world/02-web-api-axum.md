# 02 · Web APIs with Axum

Axum is the default choice for new Rust services: built on `hyper` and `tower`,
maintained by the Tokio team, and free of macro DSLs.

## Why Axum

- **Extractors** instead of macros — a handler is a plain `async fn` whose
  arguments are typed requests.
- **`tower` middleware** — the same layer works on any `tower` service, so
  timeouts, retries and load balancing compose.
- **No hidden magic** — no `#[get("/x")]` attributes, no global router.
- **Types all the way down** — a malformed path parameter is a 400 before your
  code runs.

## Minimal server

```toml
[dependencies]
axum = "0.8"
tokio = { version = "1", features = ["rt-multi-thread", "macros", "net", "signal"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tower-http = { version = "0.6", features = ["trace", "cors", "compression-gzip"] }
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
anyhow = "1"
```

```rust
use axum::{routing::get, Router};

async fn root() -> &'static str { "hello" }

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt().with_env_filter("info").init();

    let app = Router::new().route("/", get(root));

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await?;
    tracing::info!("listening on {}", listener.local_addr()?);
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async { tokio::signal::ctrl_c().await.unwrap() };
    let term = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .unwrap()
            .recv()
            .await;
    };
    tokio::select! { _ = ctrl_c => {}, _ = term => {} }
    tracing::info!("shutting down");
}
```

Graceful shutdown drains in-flight requests before exiting — required for
zero-downtime deploys.

## Routing

```rust
use axum::routing::{get, post, put, delete};

let app = Router::new()
    .route("/users", get(list_users).post(create_user))
    .route("/users/{id}", get(get_user).put(update_user).delete(delete_user))
    .route("/users/{id}/orders/{order_id}", get(get_order))   // 0.8 syntax
    .nest("/api/v1", api_routes())
    .fallback(not_found);
```

> **Gotcha:** Axum 0.8 changed path parameters from `:id` to `{id}`. A `:id`
> route now fails at startup with a clear error — if you are following a tutorial
> that uses `:id`, it is for 0.7.

[[fig:axum-request]]

## Extractors

An extractor is anything implementing `FromRequestParts` (or `FromRequest` if it
consumes the body). The handler signature declares what it needs.

```rust
use axum::{
    extract::{Path, Query, State, Json},
    http::StatusCode,
};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct ListQuery { page: Option<u32>, per_page: Option<u32> }

#[derive(Deserialize)]
struct CreateUser { email: String, name: String }

#[derive(Serialize)]
struct UserDto { id: u64, email: String, name: String }

async fn list_users(
    State(state): State<AppState>,
    Query(q): Query<ListQuery>,
) -> Result<Json<Vec<UserDto>>, ApiError> {
    let page = q.page.unwrap_or(1).max(1);
    let per_page = q.per_page.unwrap_or(20).clamp(1, 100);
    Ok(Json(state.users.list(page, per_page).await?))
}

async fn get_user(
    State(state): State<AppState>,
    Path(id): Path<u64>,
) -> Result<Json<UserDto>, ApiError> {
    state.users.find(id).await?.map(Json).ok_or(ApiError::NotFound)
}

async fn create_user(
    State(state): State<AppState>,
    Json(body): Json<CreateUser>,
) -> Result<(StatusCode, Json<UserDto>), ApiError> {
    let user = state.users.create(body.email, body.name).await?;
    Ok((StatusCode::CREATED, Json(user)))
}
```

Order matters: the body extractor (`Json`) must be **last**, because it consumes
the request body.

### Extractor summary

| Extractor | Source | Fails with |
| --- | --- | --- |
| `Path<T>` | URL path params | 400 |
| `Query<T>` | query string | 400 |
| `Json<T>` | JSON body | 400/415 |
| `State<S>` | router state | — |
| `HeaderMap` | headers | — |
| `TypedHeader<T>` | one header, typed | 400 |
| `Extension<T>` | request-scoped value (auth) | 500 if missing |
| `Request` | raw request | — |
| `Bytes` / `String` | raw body | — |

### Custom extractors: authentication

```rust
use axum::{extract::FromRequestParts, http::{request::Parts, StatusCode}};

pub struct AuthUser { pub id: u64 }

impl<S> FromRequestParts<S> for AuthUser
where
    S: Send + Sync,
{
    type Rejection = StatusCode;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let header = parts.headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .ok_or(StatusCode::UNAUTHORIZED)?;

        let token = header.strip_prefix("Bearer ").ok_or(StatusCode::UNAUTHORIZED)?;
        let id = verify_token(token).map_err(|_| StatusCode::UNAUTHORIZED)?;
        Ok(AuthUser { id })
    }
}

// now any handler can require auth just by taking AuthUser
async fn me(user: AuthUser) -> String { format!("user {}", user.id) }
```

This is the Axum pattern that pays off most: authorisation becomes part of the
type signature, and a handler that needs a user cannot be written without one.

## Application state

```rust
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub users: Arc<dyn UserRepo>,
    pub pool: sqlx::PgPool,
}

let state = AppState { users: Arc::new(PgUserRepo::new(pool.clone())), pool };
let app = Router::new()
    .route("/users", get(list_users))
    .with_state(state);
```

`State<T>` requires `T: Clone`. `AppState` is cheap to clone because everything
inside is `Arc` or a pool handle.

> **Gotcha:** never put a `Mutex<HashMap>` in `AppState` for real data. Use the
> database. In-memory state is lost on restart and does not survive multiple
> replicas.

## Errors as responses

```rust
use axum::{http::StatusCode, response::{IntoResponse, Response}, Json};
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("not found")]
    NotFound,
    #[error("validation failed: {0}")]
    Validation(String),
    #[error("unauthorized")]
    Unauthorized,
    #[error("database error")]
    Db(#[from] sqlx::Error),
    #[error("internal error")]
    Internal(#[from] anyhow::Error),
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, code) = match &self {
            ApiError::NotFound => (StatusCode::NOT_FOUND, "not_found"),
            ApiError::Validation(_) => (StatusCode::UNPROCESSABLE_ENTITY, "validation"),
            ApiError::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized"),
            ApiError::Db(_) | ApiError::Internal(_) => {
                tracing::error!(error = %self, "request failed");
                (StatusCode::INTERNAL_SERVER_ERROR, "internal")
            }
        };

        // never leak internal error text to the client
        let message = match status {
            StatusCode::INTERNAL_SERVER_ERROR => "internal error".to_string(),
            _ => self.to_string(),
        };

        (status, Json(json!({ "error": { "code": code, "message": message } })))
            .into_response()
    }
}
```

Two rules that matter in production: log the real error server-side, and return a
generic message for 5xx. Leaking a SQL error string to a client is an information
disclosure.

## Middleware with `tower`

```rust
use std::time::Duration;
use tower::ServiceBuilder;
use tower_http::{
    trace::TraceLayer,
    cors::{CorsLayer, Any},
    compression::CompressionLayer,
    timeout::TimeoutLayer,
    limit::RequestBodyLimitLayer,
};

let app = Router::new()
    .route("/users", get(list_users))
    .with_state(state)
    .layer(
        ServiceBuilder::new()
            .layer(TraceLayer::new_for_http())
            .layer(CompressionLayer::new())
            .layer(CorsLayer::new().allow_origin(Any).allow_methods(Any))
            .layer(TimeoutLayer::new(Duration::from_secs(30)))
            .layer(RequestBodyLimitLayer::new(2 * 1024 * 1024)),
    );
```

Layers apply **bottom-up**: the last `.layer()` is the outermost, so it sees the
request first.

### Rate limiting

```toml
tower_governor = "0.5"
```

```rust
use tower_governor::{GovernorLayer, governor::GovernorConfigBuilder};

let config = GovernorConfigBuilder::default()
    .per_second(10)
    .burst_size(20)
    .finish()
    .unwrap();

let app = Router::new().route("/", get(root))
    .layer(GovernorLayer { config: std::sync::Arc::new(config) });
```

## Pagination, filtering, sorting

```rust
#[derive(Deserialize)]
struct Page {
    #[serde(default = "default_page")]
    page: u32,
    #[serde(default = "default_per_page")]
    per_page: u32,
    sort: Option<String>,
    #[serde(default)]
    q: Option<String>,
}

fn default_page() -> u32 { 1 }
fn default_per_page() -> u32 { 20 }

// always clamp — an unbounded per_page is a DoS vector
let per_page = page.per_page.clamp(1, 100);
let offset = (page.page.saturating_sub(1)) * per_page;
```

## Testing handlers without a network

```rust
use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use tower::ServiceExt;

#[tokio::test]
async fn lists_users() {
    let app = router_with_test_state();

    let res = app
        .oneshot(Request::builder().uri("/users?page=1").body(Body::empty()).unwrap())
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::OK);
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let v: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert!(v.as_array().is_some());
}
```

`oneshot` exercises the whole router — routing, extractors, middleware, error
mapping — with no socket and no port. This is the fastest reliable test you can
write.

## OpenAPI

```toml
utoipa = { version = "5", features = ["axum_extras", "uuid"] }
utoipa-swagger-ui = { version = "8", features = ["axum"] }
```

```rust
#[derive(utoipa::ToSchema, serde::Serialize)]
struct UserDto { id: u64, email: String }

#[utoipa::path(get, path = "/users/{id}", responses((status = 200, body = UserDto)))]
async fn get_user(Path(id): Path<u64>) -> Json<UserDto> { todo!() }

#[derive(utoipa::OpenApi)]
#[openapi(paths(get_user), components(schemas(UserDto)))]
struct ApiDoc;

let app = Router::new()
    .merge(SwaggerUi::new("/docs").url("/api-docs/openapi.json", ApiDoc::openapi()));
```

## Production checklist

- [ ] Graceful shutdown wired to SIGTERM
- [ ] Request body size limit (2 MB is a sane default)
- [ ] Timeout layer (30 s)
- [ ] CORS configured explicitly, not `Any`, for browser-facing APIs
- [ ] `TraceLayer` so every request has a span with method, path, status, latency
- [ ] `/healthz` and `/readyz` (module 03.06)
- [ ] Errors mapped to a stable JSON shape; 5xx bodies contain no internals
- [ ] `per_page` clamped; no unbounded list endpoints
- [ ] Pool `max_connections` set from the DB's limit, not left at default
- [ ] Rate limit on auth endpoints specifically

---

## Exercises

1. Add a `PATCH /users/{id}` handler that accepts a partial body (`Option<T>`
   fields) and only updates provided fields.
2. Write a custom extractor `Pagination` that parses and clamps `page` and
   `per_page` in one place.
3. Add a middleware that logs the request id from a header, or generates one.
4. Implement `IntoResponse for ApiError` such that `sqlx::Error::RowNotFound`
   becomes 404 and every other DB error becomes 500.
5. Add a `/metrics` endpoint (module 03.06) and confirm it is excluded from the
   timeout layer.
6. Write `oneshot` tests for a 200, a 404 and a 422.

**Next:** [Databases with SQLx](03-database-sqlx.md)
