use std::sync::Arc;

use axum::extract::State;
use axum::Json;

use pulse_domain::{Dashboard, InvoiceRow, Paise, PlanRow, Quota, UsageDay};

use crate::auth::TenantId;
use crate::error::ApiResult;
use crate::AppState;

pub async fn get(
    State(state): State<Arc<AppState>>,
    TenantId(tenant): TenantId,
) -> ApiResult<Json<Dashboard>> {
    // Plan breakdown across all tenants (MRR is a company-level number).
    let plans: Vec<(String, i64, i64)> = sqlx::query_as(
        "SELECT plan, COUNT(*)::bigint, (COUNT(*) * 499000)::bigint
         FROM tenants
         GROUP BY plan
         ORDER BY 3 DESC",
    )
    .fetch_all(&state.pool)
    .await?;

    let mrr: i64 = plans.iter().map(|(_, _, m)| *m).sum();

    // Usage from the daily rollups — never COUNT(*) over the events table.
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
        let idx = match usage.iter().position(|u| u.day == key) {
            Some(i) => i,
            None => {
                usage.push(UsageDay {
                    day: key,
                    api_calls: 0,
                    storage_writes: 0,
                    job_runs: 0,
                });
                usage.len() - 1
            }
        };
        match kind.as_str() {
            "api_call" => usage[idx].api_calls = total,
            "storage_write" => usage[idx].storage_writes = total,
            "job_run" => usage[idx].job_runs = total,
            _ => {}
        }
    }

    let invoice_rows: Vec<(i64, String, i64, String, String)> = sqlx::query_as(
        "SELECT id, number, amount_paise, status, to_char(period_start, 'YYYY-MM')
         FROM invoices
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT 12",
    )
    .bind(tenant)
    .fetch_all(&state.pool)
    .await?;

    let used: i64 = usage.iter().map(|u| u.api_calls).sum();

    Ok(Json(Dashboard {
        mrr: Paise(mrr),
        // Demo values until metrics_daily exists — see the capstone exercises.
        mrr_change_pct: 12.4,
        active_users: 1842,
        active_users_change_pct: 3.1,
        churn_pct: 1.8,
        plans: plans
            .into_iter()
            .map(|(name, count, m)| PlanRow {
                name,
                count,
                mrr: Paise(m),
            })
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
        quota: Quota {
            used,
            limit: 500_000,
        },
    }))
}
