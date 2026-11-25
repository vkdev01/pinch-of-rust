pub mod auth;
pub mod config;
pub mod db;
pub mod error;
pub mod handlers;
pub mod telemetry;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use axum::{
    routing::{get, post},
    Router,
};
use sqlx::PgPool;

static SHUTTING_DOWN: AtomicBool = AtomicBool::new(false);

/// Called by the shutdown handler so `/readyz` starts failing before the
/// process exits, letting the load balancer drain us.
pub fn begin_shutdown() {
    SHUTTING_DOWN.store(true, Ordering::Relaxed);
}

pub fn is_shutting_down() -> bool {
    SHUTTING_DOWN.load(Ordering::Relaxed)
}

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
    use tower_http::compression::CompressionLayer;
    use tower_http::timeout::TimeoutLayer;
    use tower_http::trace::TraceLayer;

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
