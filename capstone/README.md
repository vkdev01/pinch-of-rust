# Pulse — capstone project

A small SaaS usage-analytics service: Rust API (axum + sqlx), Postgres, a
background worker, and a Next.js dashboard.

This is the code for **Module 05** of the Rust Learning Path. The full
walkthrough, including every design decision, is in
`05-capstone/01-brief-and-architecture.md` and `05-capstone/02-rust-api-build.md`.

## Run it

```bash
docker run -d --name pulse-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
cp .env.example .env
export DATABASE_URL="postgres://postgres:postgres@localhost:5432/pulse"

cargo install sqlx-cli --no-default-features --features postgres
sqlx database create
sqlx migrate run

cargo run -p api      # :8080
cargo run -p worker   # in another shell
```

## Seed a tenant and an API key

```bash
psql "$DATABASE_URL" <<'SQL'
INSERT INTO tenants (name, plan) VALUES ('Acme', 'pro');
SQL

KEY=$(openssl rand -hex 16)
psql "$DATABASE_URL" -c "INSERT INTO api_keys (tenant_id, key_hash, prefix)
  VALUES (1, encode(sha256('$KEY'::bytea), 'hex'), '${KEY:0:8}');"
echo "API key: $KEY"
```

## Smoke test

```bash
curl -s localhost:8080/healthz
curl -s localhost:8080/readyz

curl -s -X POST localhost:8080/v1/events \
  -H "Authorization: Bearer $KEY" -H 'content-type: application/json' \
  -d '{"events":[{"kind":"api_call","quantity":3},{"kind":"job_run"}]}'

curl -s localhost:8080/v1/dashboard -H "Authorization: Bearer $KEY" | jq
```

## Note on query checking

The queries here use sqlx's **runtime** API (`sqlx::query_as`), so the workspace
builds without a database. Once you have `DATABASE_URL` set at build time, switch
them to the compile-time-checked `sqlx::query_as!` macro (see module 04.03) and
run `cargo sqlx prepare` to commit the `.sqlx/` offline cache.

## Layout

```text
web/                     Next.js + Tailwind v4 + HeroUI v3 dashboard
Cargo.toml               workspace
crates/domain/           types and rules, no I/O — fast unit tests
crates/api/              axum server
crates/worker/           background jobs (Postgres queue)
migrations/              sqlx migrations, embedded at compile time
```

## Endpoints

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/v1/events` | API key |
| GET | `/v1/dashboard` | API key |
| GET | `/v1/invoices` | API key |
| POST | `/v1/invoices/{id}/pay` | API key |
| GET | `/healthz` | none |
| GET | `/readyz` | none |
