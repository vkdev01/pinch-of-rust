CREATE TABLE tenants (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    plan        TEXT NOT NULL DEFAULT 'free',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE api_keys (
    id          BIGSERIAL PRIMARY KEY,
    tenant_id   BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key_hash    TEXT NOT NULL UNIQUE,
    prefix      TEXT NOT NULL,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE events (
    id          BIGSERIAL PRIMARY KEY,
    tenant_id   BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    quantity    BIGINT NOT NULL DEFAULT 1,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    meta        JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_events_tenant_time ON events (tenant_id, occurred_at DESC);

CREATE TABLE usage_daily (
    tenant_id   BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    day         DATE NOT NULL,
    kind        TEXT NOT NULL,
    total       BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, day, kind)
);

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

CREATE TABLE invoices (
    id           BIGSERIAL PRIMARY KEY,
    tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    number       TEXT NOT NULL UNIQUE,
    amount_paise BIGINT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'open',
    period_start DATE NOT NULL,
    period_end   DATE NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
