use std::time::Duration;

use sqlx::PgPool;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    pulse_api::telemetry::init();

    let cfg = pulse_api::config::Config::from_env()?;
    let pool = pulse_api::db::connect(&cfg).await?;
    let worker_id = format!("worker-{}", std::process::id());

    // Scheduler: enqueue yesterday's rollup once a minute (idempotent).
    let scheduler_pool = pool.clone();
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(60));
        loop {
            tick.tick().await;
            if let Err(e) = enqueue_yesterday(&scheduler_pool).await {
                tracing::error!(error = %e, "could not enqueue rollup");
            }
        }
    });

    tracing::info!(worker = %worker_id, "worker started");

    loop {
        match claim_and_run(&pool, &worker_id).await {
            Ok(0) => tokio::time::sleep(Duration::from_secs(1)).await,
            Ok(_) => {}
            Err(e) => {
                tracing::error!(error = %e, "worker tick failed");
                tokio::time::sleep(Duration::from_secs(5)).await;
            }
        }
    }
}

async fn claim_and_run(pool: &PgPool, worker: &str) -> anyhow::Result<usize> {
    let jobs: Vec<(i64, String, serde_json::Value, i32)> = sqlx::query_as(
        r#"UPDATE jobs SET status = 'running', attempts = attempts + 1,
                  locked_at = now(), locked_by = $1
           WHERE id IN (
             SELECT id FROM jobs
             WHERE status = 'pending' AND run_at <= now()
             ORDER BY run_at
             FOR UPDATE SKIP LOCKED
             LIMIT 10
           )
           RETURNING id, kind, payload, attempts"#,
    )
    .bind(worker)
    .fetch_all(pool)
    .await?;

    let count = jobs.len();

    for (id, kind, payload, attempts) in jobs {
        let result = match kind.as_str() {
            "rollup_day" => rollup_day(pool, &payload).await,
            other => Err(anyhow::anyhow!("unknown job kind `{other}`")),
        };

        match result {
            Ok(()) => {
                sqlx::query("UPDATE jobs SET status = 'done', locked_at = NULL WHERE id = $1")
                    .bind(id)
                    .execute(pool)
                    .await?;
                tracing::info!(id, kind = %kind, "job done");
            }
            Err(e) => {
                let delay_secs = (1i64 << attempts.min(10)).min(3600);
                sqlx::query(
                    r#"UPDATE jobs
                       SET status = 'pending', last_error = $2, locked_at = NULL,
                           locked_by = NULL,
                           run_at = now() + make_interval(secs => $3)
                       WHERE id = $1"#,
                )
                .bind(id)
                .bind(e.to_string())
                .bind(delay_secs as f64)
                .execute(pool)
                .await?;
                tracing::warn!(id, error = %e, retry_in = delay_secs, "job failed");
            }
        }
    }

    Ok(count)
}

async fn rollup_day(pool: &PgPool, payload: &serde_json::Value) -> anyhow::Result<()> {
    let day = payload["day"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("job payload missing `day`"))?;

    let affected = sqlx::query(
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
    .await?
    .rows_affected();

    tracing::info!(day, rows = affected, "rollup complete");
    Ok(())
}

async fn enqueue_yesterday(pool: &PgPool) -> anyhow::Result<()> {
    let yesterday = (chrono::Utc::now().date_naive() - chrono::Duration::days(1))
        .format("%Y-%m-%d")
        .to_string();

    // One job per day: the unique-ish guard is the ON CONFLICT below, so a
    // duplicate enqueue is harmless.
    let exists: Option<(i64,)> = sqlx::query_as(
        "SELECT id FROM jobs WHERE kind = 'rollup_day' AND payload->>'day' = $1 LIMIT 1",
    )
    .bind(&yesterday)
    .fetch_optional(pool)
    .await?;

    if exists.is_none() {
        sqlx::query("INSERT INTO jobs (kind, payload) VALUES ('rollup_day', $1)")
            .bind(serde_json::json!({ "day": yesterday }))
            .execute(pool)
            .await?;
        tracing::info!(day = %yesterday, "rollup enqueued");
    }

    Ok(())
}
