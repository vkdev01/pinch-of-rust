use std::sync::Arc;

use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde_json::{json, Value};

use crate::AppState;

/// Liveness: is the process alive? Never checks dependencies — a failing
/// liveness probe restarts the pod, which is the wrong response to a DB outage.
pub async fn live() -> StatusCode {
    StatusCode::OK
}

/// Readiness: can we serve traffic? Checks the database and the drain flag.
pub async fn ready(State(state): State<Arc<AppState>>) -> (StatusCode, Json<Value>) {
    if crate::is_shutting_down() {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "status": "draining" })),
        );
    }

    match sqlx::query("SELECT 1").execute(&state.pool).await {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "ok" }))),
        Err(e) => {
            tracing::error!(error = %e, "readiness check failed");
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({ "status": "db down" })),
            )
        }
    }
}
