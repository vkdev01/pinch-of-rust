use serde::{Deserialize, Serialize};

use crate::Paise;

/// Everything the dashboard needs, in one payload — so the UI makes one request.
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
