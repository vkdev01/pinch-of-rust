use tracing_subscriber::{fmt, prelude::*, EnvFilter};

/// Initialise tracing once, before anything else logs.
pub fn init() {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,pulse_api=debug,sqlx=warn"));

    let json = std::env::var("LOG_FORMAT")
        .map(|v| v == "json")
        .unwrap_or(false);

    let registry = tracing_subscriber::registry().with(filter);

    if json {
        registry.with(fmt::layer().json().flatten_event(true)).init();
    } else {
        registry
            .with(fmt::layer().with_target(true).with_thread_ids(false))
            .init();
    }
}
