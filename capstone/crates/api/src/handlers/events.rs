use std::sync::Arc;

use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};

use pulse_domain::IngestEvent;

use crate::auth::TenantId;
use crate::error::{ApiError, ApiResult};
use crate::AppState;

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
        return Err(ApiError::Validation("no events supplied".into()));
    }
    if body.events.len() > 1000 {
        return Err(ApiError::Validation(
            "at most 1000 events per request".into(),
        ));
    }

    // Validate everything before writing anything: a bad event rejects the batch.
    let mut rows: Vec<(&'static str, i64, serde_json::Value)> = Vec::with_capacity(body.events.len());
    for event in &body.events {
        let (kind, quantity) = event.validate()?;
        rows.push((kind.as_str(), quantity, event.meta.clone()));
    }

    let mut tx = state.pool.begin().await?;
    for (kind, quantity, meta) in &rows {
        sqlx::query(
            "INSERT INTO events (tenant_id, kind, quantity, meta) VALUES ($1, $2, $3, $4)",
        )
        .bind(tenant)
        .bind(*kind)
        .bind(*quantity)
        .bind(meta)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;

    tracing::info!(tenant, accepted = rows.len(), "events ingested");

    Ok((
        StatusCode::ACCEPTED,
        Json(IngestResponse {
            accepted: rows.len(),
        }),
    ))
}
