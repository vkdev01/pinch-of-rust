use std::time::Duration;

use anyhow::Result;
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;

use crate::config::Config;

pub async fn connect(cfg: &Config) -> Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(cfg.pool_size)
        .min_connections(1)
        .acquire_timeout(Duration::from_secs(5))
        .idle_timeout(Duration::from_secs(600))
        .max_lifetime(Duration::from_secs(1800))
        .connect(&cfg.database_url)
        .await?;

    tracing::info!(max = cfg.pool_size, "database pool ready");
    Ok(pool)
}
