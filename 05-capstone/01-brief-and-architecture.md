# 01 · Capstone Brief and Architecture

The capstone is **Pulse**: a small but complete SaaS usage-analytics product.
It exercises everything in this course — a Rust API, a Postgres schema, a
background worker, and a Next.js dashboard with HeroUI.

## What it does

A customer signs up, gets an API key, and their application sends usage events
(`api_call`, `storage_write`, `job_run`). Pulse:

1. Ingests events at high volume (`POST /v1/events`).
2. Aggregates them per tenant per day.
3. Serves a dashboard: MRR, active users, plan breakdown, usage this month,
   recent invoices.
4. Emails a monthly usage summary (background job).

Small enough to finish, real enough to be instructive.

## Architecture

```text
        ┌──────────────┐
        │  Customer    │
        │  SDK / curl  │
        └──────┬───────┘
               │  POST /v1/events  (API key)
               ▼
      ┌────────────────────┐
      │   Rust API (axum)  │──────┐
      │  auth · validate   │      │
      │  enqueue           │      │
      └────────┬───────────┘      │
               │                  │
               ▼                  ▼
      ┌────────────────┐   ┌──────────────┐
      │  Postgres      │◄──│   Worker     │
      │  events        │   │  aggregate   │
      │  aggregates    │   │  email       │
      │  jobs          │   │  reaper      │
      └────────┬───────┘   └──────────────┘
               │
               │  GET /v1/dashboard  (session)
               ▼
      ┌────────────────────────┐
      │  Next.js + HeroUI      │
      │  sticky header · nav   │
      │  cards · table · chart │
      └────────────────────────┘
```

## The four pieces

| Piece | Tech | Module |
| --- | --- | --- |
| API | Rust, axum 0.8, sqlx, tokio | 04.02, 04.03 |
| Worker | Rust, tokio, Postgres queue | 04.04 |
| Database | Postgres 16 + migrations | 04.03 |
| Dashboard | Next.js App Router, Tailwind v4, HeroUI v3 | 05.03 |

## Schema

```sql
-- tenants and users
CREATE TABLE tenants (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    plan        TEXT NOT NULL DEFAULT 'free',   -- free|pro|scale
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE api_keys (
    id          BIGSERIAL PRIMARY KEY,
    tenant_id   BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key_hash    TEXT NOT NULL UNIQUE,           -- store a HASH, never the key
    prefix      TEXT NOT NULL,                  -- first 8 chars, for display
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- events: high volume, append-only
CREATE TABLE events (
    id          BIGSERIAL PRIMARY KEY,
    tenant_id   BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    quantity    BIGINT NOT NULL DEFAULT 1,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    meta        JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_events_tenant_time ON events (tenant_id, occurred_at DESC);

-- daily rollups: what the dashboard reads
CREATE TABLE usage_daily (
    tenant_id   BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    day         DATE NOT NULL,
    kind        TEXT NOT NULL,
    total       BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, day, kind)
);

-- jobs: the queue from module 04.04
CREATE TABLE jobs (
    id          BIGSERIAL PRIMARY KEY,
    kind        TEXT NOT NULL,
    payload     JSONB NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    attempts    INT NOT NULL DEFAULT 0,
    run_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_at   TIMESTAMPTZ,
    locked_by   TEXT,
    last_error  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_jobs_pending ON jobs (run_at) WHERE status = 'pending';

-- invoices: what the dashboard table shows
CREATE TABLE invoices (
    id          BIGSERIAL PRIMARY KEY,
    tenant_id   BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    number      TEXT NOT NULL UNIQUE,
    amount_paise BIGINT NOT NULL,               -- integers for money
    status      TEXT NOT NULL DEFAULT 'open',   -- open|paid|void
    period_start DATE NOT NULL,
    period_end   DATE NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Three decisions worth defending:

- **`amount_paise BIGINT`** — money as integer minor units. No floats, ever.
- **`key_hash`, not the key** — a leaked database must not leak credentials. Hash
  the key with SHA-256 on ingest and look it up by hash.
- **`usage_daily` rollups** — the dashboard must never `COUNT(*)` over a billion
  events. Aggregate once per day, read the rollup.

## API surface

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/v1/events` | API key | ingest one or many events |
| `GET` | `/v1/dashboard` | session | everything the dashboard needs |
| `GET` | `/v1/tenants/{id}/usage` | session | usage by day and kind |
| `GET` | `/v1/invoices` | session | invoice list |
| `POST` | `/v1/invoices/{id}/pay` | session | mark paid (demo) |
| `GET` | `/healthz` | none | liveness |
| `GET` | `/readyz` | none | readiness (checks DB) |
| `GET` | `/metrics` | none | Prometheus |

`GET /v1/dashboard` returns one payload so the UI makes one request:

```json
{
  "mrr_paise": 4820000,
  "mrr_change_pct": 12.4,
  "active_users": 1842,
  "active_users_change_pct": 3.1,
  "churn_pct": 1.8,
  "plans": [
    { "name": "Free",  "count": 1200, "mrr_paise": 0 },
    { "name": "Pro",   "count": 540,  "mrr_paise": 2700000 },
    { "name": "Scale", "count": 102,  "mrr_paise": 2120000 }
  ],
  "usage": [
    { "day": "2026-11-19", "api_calls": 41200, "storage_writes": 8300, "job_runs": 1200 }
  ],
  "invoices": [
    { "id": 91, "number": "INV-2026-091", "amount_paise": 499000,
      "status": "paid", "period": "2026-10" }
  ],
  "quota": { "used": 412000, "limit": 500000 }
}
```

The `quota` object drives a `ProgressBar` in the UI.

## Workspace layout

```text
pulse/
├── Cargo.toml                 # workspace
├── crates/
│   ├── domain/                # types, no I/O — fully unit-testable
│   ├── api/                   # axum server
│   └── worker/                # background jobs
├── migrations/
├── .env.example
└── web/                       # Next.js dashboard
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx
    │   └── globals.css
    └── components/
```

The `domain` crate has no database, no HTTP and no async — so its tests run in
microseconds and its API is the contract everything else builds on.

## Milestones

| # | Milestone | Done when |
| --- | --- | --- |
| 1 | Schema + migrations | `sqlx migrate run` succeeds on a fresh DB |
| 2 | Ingest endpoint | `curl` with an API key inserts an event |
| 3 | Dashboard endpoint | returns the JSON above from seeded data |
| 4 | Worker rollups | `usage_daily` fills for yesterday |
| 5 | Next.js dashboard | renders real data with HeroUI |
| 6 | Deploy | container runs, `/readyz` green, migrations on boot |

Build them in this order. Each one is independently demonstrable, which matters
when you are learning: a half-finished milestone is still a working system.

---

**Next:** [Building the Rust API](02-rust-api-build.md)
