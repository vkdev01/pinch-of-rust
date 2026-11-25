use std::sync::Arc;

use axum::extract::{Path, State};
use axum::Json;
use serde::Serialize;

use pulse_domain::Paise;

use crate::auth::TenantId;
use crate::error::{ApiError, ApiResult};
use crate::AppState;

#[derive(Debug, Serialize)]
pub struct Invoice {
    pub id: i64,
    pub number: String,
    pub amount: Paise,
    pub status: String,
    pub period: String,
}

pub async fn list(
    State(state): State<Arc<AppState>>,
    TenantId(tenant): TenantId,
) -> ApiResult<Json<Vec<Invoice>>> {
    let rows: Vec<(i64, String, i64, String, String)> = sqlx::query_as(
        "SELECT id, number, amount_paise, status, to_char(period_start, 'YYYY-MM')
         FROM invoices WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 100",
    )
    .bind(tenant)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(
        rows.into_iter()
            .map(|(id, number, amount, status, period)| Invoice {
                id,
                number,
                amount: Paise(amount),
                status,
                period,
            })
            .collect(),
    ))
}

/// Mark an invoice paid. Idempotent: paying twice is a no-op, not an error.
pub async fn pay(
    State(state): State<Arc<AppState>>,
    TenantId(tenant): TenantId,
    Path(id): Path<i64>,
) -> ApiResult<Json<Invoice>> {
    let row: Option<(i64, String, i64, String, String)> = sqlx::query_as(
        "UPDATE invoices
         SET status = 'paid'
         WHERE id = $1 AND tenant_id = $2
         RETURNING id, number, amount_paise, status, to_char(period_start, 'YYYY-MM')",
    )
    .bind(id)
    .bind(tenant)
    .fetch_optional(&state.pool)
    .await?;

    let (id, number, amount, status, period) = row.ok_or(ApiError::NotFound)?;

    Ok(Json(Invoice {
        id,
        number,
        amount: Paise(amount),
        status,
        period,
    }))
}
