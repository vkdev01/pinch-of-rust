use std::process::ExitCode;

use pulse_api::{config::Config, router, AppState};

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
    let pool = pulse_api::db::connect(&cfg).await?;

    sqlx::migrate!("../../migrations").run(&pool).await?;
    tracing::info!("migrations applied");

    let app = router(AppState::new(pool, cfg.clone()));

    let listener = tokio::net::TcpListener::bind(&cfg.bind_addr).await?;
    tracing::info!(addr = %listener.local_addr()?, "listening");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    tracing::info!("shutdown complete");
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };

    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut s) => {
                s.recv().await;
            }
            Err(_) => std::future::pending::<()>().await,
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {}
        _ = terminate => {}
    }

    pulse_api::begin_shutdown();
    tracing::info!("shutdown signal received, draining");
}
