# 04 · Deployment

A Rust service is one of the easiest things to deploy: a single static binary, no
interpreter, no `node_modules`. This module covers containerising it properly and
running it in production.

## The multi-stage Dockerfile

```dockerfile
# ---- build ----
FROM rust:1.85-bookworm AS builder
WORKDIR /app

# cache dependencies separately from source
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
RUN cargo build --release --locked -p api -p worker

# ---- runtime ----
FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 10001 app
WORKDIR /app

COPY --from=builder /app/target/release/api /usr/local/bin/api
COPY --from=builder /app/target/release/worker /usr/local/bin/worker

USER app
EXPOSE 8080
ENV RUST_LOG=info
ENTRYPOINT ["/usr/local/bin/api"]
```

| Choice | Why |
| --- | --- |
| `--locked` | fails the build if `Cargo.lock` would change |
| non-root user | container escape is much less useful as uid 10001 |
| `ca-certificates` | TLS to Postgres/APIs needs a trust store |
| no `cargo build` of tests | halves build time |
| `debian:bookworm-slim` runtime | glibc present, ~75 MB |

### Distroless / scratch, and static builds

```dockerfile
FROM rust:1.85-bookworm AS builder
RUN rustup target add x86_64-unknown-linux-musl
WORKDIR /app
COPY . .
RUN cargo build --release --target x86_64-unknown-linux-musl -p api

FROM gcr.io/distroless/static-debian12
COPY --from=builder /app/target/x86_64-unknown-linux-musl/release/api /api
USER 10001
ENTRYPOINT ["/api"]
```

Result: a ~10 MB image with no shell, no package manager, and almost no attack
surface. Note that `sqlx::migrate!` embeds your migrations, so there is no file to
copy.

> **Gotcha:** with `scratch` there is no `/etc/passwd`, no `ca-certificates`, and
> no timezone database. Use `distroless/static` (it includes certs) rather than
> bare `scratch` unless you have checked every dependency.

## Build cache that actually works

```dockerfile
# syntax=docker/dockerfile:1.7
FROM rust:1.85-bookworm AS builder
WORKDIR /app

# 1. copy manifests only, build a dummy to warm the dependency cache
COPY Cargo.toml Cargo.lock ./
COPY crates/domain/Cargo.toml crates/domain/
COPY crates/api/Cargo.toml crates/api/
COPY crates/worker/Cargo.toml crates/worker/
RUN mkdir -p crates/domain/src crates/api/src crates/worker/src \
 && echo "fn main(){}" > crates/api/src/main.rs \
 && echo "" > crates/api/src/lib.rs \
 && echo "fn main(){}" > crates/worker/src/main.rs \
 && echo "" > crates/domain/src/lib.rs \
 && cargo build --release || true

# 2. now copy real source — only this layer invalidates on a code change
COPY crates ./crates
RUN touch crates/*/src/main.rs crates/*/src/lib.rs \
 && cargo build --release --locked
```

Without this dance, every source change re-downloads and re-compiles all ~300
dependencies. It turns a 6-minute CI build into 40 seconds.

## Docker Compose for local development

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: pulse
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      retries: 10

  api:
    build: .
    environment:
      DATABASE_URL: postgres://postgres:postgres@postgres/pulse
      RUST_LOG: info,pulse_api=debug
      BIND_ADDR: 0.0.0.0:8080
    ports: ["8080:8080"]
    depends_on:
      postgres: { condition: service_healthy }

  worker:
    build: .
    entrypoint: ["/usr/local/bin/worker"]
    environment:
      DATABASE_URL: postgres://postgres:postgres@postgres/pulse
    depends_on:
      postgres: { condition: service_healthy }

  web:
    build: ./web
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8080
    ports: ["3000:3000"]
    depends_on: [api]

volumes:
  pgdata:
```

## Configuration

Twelve-factor: everything from the environment, nothing baked into the image.

```rust
// crates/api/src/config.rs
use anyhow::{Context, Result};

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub bind_addr: String,
    pub log_format: String,
    pub pool_size: u32,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            database_url: std::env::var("DATABASE_URL")
                .context("DATABASE_URL is required")?,
            bind_addr: std::env::var("BIND_ADDR")
                .unwrap_or_else(|_| "0.0.0.0:8080".into()),
            log_format: std::env::var("LOG_FORMAT").unwrap_or_else(|_| "json".into()),
            pool_size: std::env::var("POOL_SIZE").ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(10),
        })
    }
}
```

Fail fast and loudly on a missing required variable — a container that starts and
then 500s on every request is worse than one that refuses to start.

## Migrations in production

Three approaches, in order of preference:

1. **A separate migration job** that runs before the deployment and must succeed.
   Cleanest: the API never blocks on DDL, and a failed migration stops the deploy.
2. **At API startup** (`sqlx::migrate!().run()`) — simple, but with N replicas
   they all race. `sqlx` takes an advisory lock so it is *safe*, just serialised.
3. **Manually** — only acceptable for a single-instance service.

```bash
$ sqlx migrate run --database-url "$DATABASE_URL"
```

> **Gotcha:** a migration that takes 4 minutes on a large table will hold the
> advisory lock and block every starting replica. Use `CREATE INDEX
> CONCURRENTLY` (outside a transaction) and add columns as nullable first.

## Zero-downtime deploys

The requirements:

1. **Graceful shutdown** on `SIGTERM` — drain in-flight requests. (Already wired
   in module 05.02.)
2. **Readiness probe** returns 503 while shutting down, so the load balancer stops
   sending traffic *before* the process exits.
3. **Long enough `terminationGracePeriodSeconds`** for the drain (30–60 s).

```rust
// flip readiness false on shutdown
static SHUTTING_DOWN: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

pub async fn ready(State(state): State<Arc<AppState>>) -> (StatusCode, Json<Value>) {
    if SHUTTING_DOWN.load(std::sync::atomic::Ordering::Relaxed) {
        return (StatusCode::SERVICE_UNAVAILABLE, Json(json!({ "status": "draining" })));
    }
    match sqlx::query("SELECT 1").execute(&state.pool).await {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "ok" }))),
        Err(_) => (StatusCode::SERVICE_UNAVAILABLE, Json(json!({ "status": "db down" }))),
    }
}
```

## Kubernetes essentials

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pulse-api
spec:
  replicas: 3
  strategy:
    rollingUpdate: { maxUnavailable: 0, maxSurge: 1 }
  template:
    spec:
      terminationGracePeriodSeconds: 45
      containers:
        - name: api
          image: registry.example.com/pulse-api:1.4.2   # never :latest
          ports: [{ containerPort: 8080 }]
          envFrom:
            - secretRef: { name: pulse-secrets }
          resources:
            requests: { cpu: 100m, memory: 128Mi }
            limits:   { memory: 512Mi }
          livenessProbe:
            httpGet: { path: /healthz, port: 8080 }
            initialDelaySeconds: 5
            periodSeconds: 10
          readinessProbe:
            httpGet: { path: /readyz, port: 8080 }
            periodSeconds: 5
          securityContext:
            runAsNonRoot: true
            runAsUser: 10001
            readOnlyRootFilesystem: true
            allowPrivilegeEscalation: false
```

`maxUnavailable: 0` with `maxSurge: 1` means capacity never drops during a
rollout. `readOnlyRootFilesystem: true` is possible because the binary writes
nothing to disk — a Rust service has no temp files by default.

Memory limits deserve a note: Rust has no GC, so RSS is stable and predictable.
Set the limit ~2× steady-state RSS and you will not see OOM kills. That
predictability is one of the better operational arguments for Rust.

## Observability in production

```env
RUST_LOG=info,pulse_api=debug,sqlx=warn
LOG_FORMAT=json
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
```

Ship `/metrics` to Prometheus. Alert on:

| Alert | Condition |
| --- | --- |
| Error rate | 5xx > 1% for 5 min |
| Latency | p99 > 1 s for 5 min |
| Saturation | DB pool in-use > 90% for 5 min |
| Queue stuck | `jobs_pending` rising for 10 min |
| Crash loop | restart count > 3 in 10 min |

## The frontend

```dockerfile
# web/Dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
```

Enable `output: "standalone"` in `next.config.ts` for a ~120 MB image instead of
~1 GB. Deploy it to Vercel if you can — it is less work and the Next.js build
pipeline is tuned for it.

## Release checklist

- [ ] `cargo clippy -- -D warnings` clean
- [ ] `cargo test --workspace` and `cargo test --doc` green
- [ ] `cargo audit` and `cargo deny check` clean
- [ ] `npm run typecheck` and `npm run build` green
- [ ] Migrations reviewed, and reversible or additive-only
- [ ] Image tagged with a version, never `latest`
- [ ] `/healthz` and `/readyz` respond correctly
- [ ] Graceful shutdown verified (`docker stop` takes ~2 s, not 10)
- [ ] Rollback plan: previous image tag is one command away
- [ ] Dashboards and alerts exist before the deploy, not after

---

## Exercises

1. Build the multi-stage image and compare its size against a naive single-stage
   build.
2. Add the dependency-caching layer and measure the rebuild time after touching
   one `.rs` file.
3. Switch to `distroless/static` and confirm TLS to Postgres still works.
4. Verify graceful shutdown: start a 5-second request, `docker stop`, and confirm
   it completes.
5. Make `/readyz` return 503 during shutdown and observe the load balancer
   behaviour.
6. Write the Compose file and get the full stack (Postgres + API + worker + web)
   running with one command.

**Back to:** [Contents](../README.md)
