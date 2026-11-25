# 06 · Observability: Logs, Metrics, Traces

A service you cannot see inside is a service you cannot operate. Rust's answer is
`tracing` for structured events, `metrics`/`prometheus` for numbers, and
OpenTelemetry for distributed traces.

## Why `tracing`, not `log`

`log` gives you a string. `tracing` gives you an event with **fields** and a
**span context**:

```rust
log::info!("user 42 loaded in 12ms");        // a string you must parse later
tracing::info!(user_id = 42, ms = 12, "user loaded");   // structured
```

Structured fields are what let you query "p99 latency by user_id" without
regex-parsing logs.

## Setup

```toml
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "json", "time"] }
```

```rust
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

pub fn init() {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,my_app=debug,axum=info,sqlx=warn"));

    tracing_subscriber::registry()
        .with(filter)
        .with(fmt::layer().with_target(true).with_thread_ids(true))
        .init();
}
```

```bash
$ RUST_LOG=debug cargo run
$ RUST_LOG=my_app::db=trace,info cargo run
```

`RUST_LOG` filters by target (module path) and level. `my_app::db=trace,info`
means "trace for that module, info for everything else".

### JSON output in production

```rust
.with(fmt::layer().json().flatten_event(true))
```

One JSON object per line — what Loki, Elasticsearch and CloudWatch expect.

## Levels

| Level | Use for |
| --- | --- |
| `error` | something failed and a human must look |
| `warn` | degraded but handled (retry, fallback, slow query) |
| `info` | lifecycle events: started, connected, job finished |
| `debug` | diagnostic detail, off in production |
| `trace` | per-item detail, almost never on |

> **Rule of thumb:** if it fires per request, it is `debug`, not `info`. A
> service logging `info!` per request produces gigabytes a day and buries the
> events that matter.

## Spans

A span is a unit of work with a start, an end, and fields. Events inside a span
inherit its context.

```rust
use tracing::{info, instrument, warn};

#[instrument(skip(db), fields(order_id = %order.id))]
async fn process_order(order: Order, db: &PgPool) -> Result<()> {
    info!("validating");
    db.save(&order).await?;         // errors are recorded automatically
    info!(total = order.total, "processed");
    Ok(())
}
```

`#[instrument]` creates a span named after the function, records each argument
as a field (use `skip` for anything not `Debug` or too large), and records the
returned `Err` at `ERROR` level with the error's `Display`.

Manual spans:

```rust
let span = tracing::info_span!("batch", size = items.len());
let _guard = span.enter();          // or span.in_scope(|| { ... })

// async-safe: hold the guard across awaits with .instrument()
use tracing::Instrument;
async fn work() { }.instrument(tracing::info_span!("work")).await;
```

> **Gotcha:** `span.enter()` returns a guard tied to the *thread*, not the task.
> In async code, holding it across an `.await` attributes the wrong events when
> the task migrates threads. Use `.instrument(span)` instead — it is correct by
> construction.

## Metrics with `metrics` + Prometheus

```toml
metrics = "0.24"
metrics-exporter-prometheus = "0.16"
```

```rust
use metrics::{counter, gauge, histogram};

counter!("http_requests_total", "route" => "/users", "status" => "200").increment(1);
gauge!("queue_depth").set(42.0);
histogram!("http_request_duration_seconds").record(elapsed.as_secs_f64());
```

```rust
use metrics_exporter_prometheus::PrometheusBuilder;

let handle = PrometheusBuilder::new()
    .install_recorder()
    .expect("install prometheus recorder");

// axum: expose /metrics
let app = Router::new()
    .route("/metrics", get(move || async move { handle.render() }));
```

### The four golden signals

| Signal | Metric |
| --- | --- |
| Latency | histogram of request duration |
| Traffic | counter of requests |
| Errors | counter of responses by status |
| Saturation | gauge of queue depth, pool usage, memory |

If you instrument only four things, instrument these.

### Naming conventions

```text
http_requests_total{method,route,status}          counter — ends in _total
http_request_duration_seconds{route}              histogram — ends in _seconds
db_pool_connections_in_use                        gauge — no suffix
```

Never put an unbounded value (user id, request id, raw URL) in a label. That
creates one time series per user and kills the metrics backend.

## Distributed tracing with OpenTelemetry

```toml
opentelemetry = "0.27"
opentelemetry-otlp = "0.27"
tracing-opentelemetry = "0.28"
```

```rust
use opentelemetry_otlp::WithExportConfig;

pub fn init_tracing() -> anyhow::Result<()> {
    let exporter = opentelemetry_otlp::SpanExporter::builder()
        .with_tonic()
        .with_endpoint("http://localhost:4317")
        .build()?;

    let provider = opentelemetry_sdk::trace::SdkTracerProvider::builder()
        .with_batch_exporter(exporter)
        .build();

    use opentelemetry::trace::TracerProvider;
    let tracer = provider.tracer("my_app");

    tracing_subscriber::registry()
        .with(tracing_opentelemetry::layer().with_tracer(tracer))
        .with(tracing_subscriber::fmt::layer())
        .init();
    Ok(())
}
```

Now every `#[instrument]` span becomes a span in Jaeger/Tempo/Honeycomb, and
`tracing` propagates the trace context over HTTP if you add the header
propagation layer.

## Health and readiness endpoints

```rust
use axum::{routing::get, Router, Json, http::StatusCode};

async fn live() -> StatusCode { StatusCode::OK }

async fn ready(State(pool): State<PgPool>) -> (StatusCode, Json<serde_json::Value>) {
    match sqlx::query("SELECT 1").execute(&pool).await {
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({"db": "ok"}))),
        Err(e) => {
            tracing::error!(error = %e, "readiness check failed");
            (StatusCode::SERVICE_UNAVAILABLE, Json(serde_json::json!({"db": "down"})))
        }
    }
}

let app = Router::new()
    .route("/healthz", get(live))       // liveness: is the process alive?
    .route("/readyz", get(ready))       // readiness: can it serve traffic?
    .with_state(pool);
```

The distinction matters: a failing *liveness* probe restarts the pod; a failing
*readiness* probe only removes it from the load balancer. Getting these backwards
causes restart storms.

## Panic and error reporting

```toml
sentry = "0.35"
```

```rust
let _guard = sentry::init(("https://key@sentry.io/1", sentry::ClientOptions {
    release: sentry::release_name!(),
    traces_sample_rate: 0.1,
    ..Default::default()
}));
```

For a Rust service, also install a panic hook that logs before unwinding:

```rust
std::panic::set_hook(Box::new(|info| {
    tracing::error!(panic = %info, "thread panicked");
}));
```

## Structured logging in practice

```rust
#[instrument(skip(pool), fields(user.id = id))]
async fn load_user(id: u64, pool: &PgPool) -> anyhow::Result<User> {
    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| anyhow::anyhow!("user {id} not found"))?;

    tracing::info!(email = %user.email, "loaded user");
    Ok(user)
}
```

The JSON line this produces:

```json
{"timestamp":"2026-11-25T10:12:33Z","level":"INFO","fields":{"message":"loaded user","email":"a@x.com","user.id":1},"target":"my_app::users","span":{"name":"load_user"}}
```

Everything you need to correlate, filter and alert on.

## Checklist for a new service

- [ ] `tracing_subscriber` initialised once, at startup, before anything else
- [ ] `RUST_LOG` respected; default `info`
- [ ] JSON output when `LOG_FORMAT=json`
- [ ] `#[instrument]` on every handler and every DB/HTTP call boundary
- [ ] `/healthz` (liveness) and `/readyz` (readiness)
- [ ] `/metrics` with the four golden signals
- [ ] Request-id propagation into logs and outbound calls
- [ ] Panic hook that logs at `error`
- [ ] No `println!` anywhere in library code (clippy `print_stdout`)

---

## Exercises

1. Replace every `println!` in a small service with `tracing::info!` and add an
   `EnvFilter` that turns on `debug` only for your crate.
2. Add `#[instrument]` to a handler with one field skipped, and confirm the field
   appears in the JSON output.
3. Expose `/metrics` with a request counter and a latency histogram; scrape it
   with `curl`.
4. Add `/healthz` and `/readyz`, with readiness checking the database.
5. Explain why `span.enter()` across an `.await` is a bug and show the
   `.instrument()` fix.
6. Name three label values you must never use in a Prometheus metric, and why.

**Next:** [Command-line tools](../04-real-world/01-cli-tool.md)
