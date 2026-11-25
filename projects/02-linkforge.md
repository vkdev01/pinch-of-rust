---
summary: A production-shaped URL shortener: axum, Postgres, Redis-style caching, rate limits and honest load numbers.
level: Intermediate
time: 10–14 h
tags: [web, api, postgres, async]
---

# linkforge — a URL shortener that survives load

A shortener looks trivial and is not: it is a hot-path read, a write with
contention, a cache with invalidation, and a rate limiter that must not fall over
under a burst.

**What it is:** `POST /links` returns a 7-character code; `GET /{code}` redirects
in under a millisecond from cache; `/stats` shows hit rates and p99 latency.

## What you learn

| Skill | Where it comes from |
| --- | --- |
| Async web plumbing | axum extractors, `tower` layers |
| SQL that is safe and fast | sqlx compile-checked queries, indexes, `EXPLAIN` |
| Caching with invalidation | `moka` or a Redis client, TTL, stampede control |
| Backpressure | concurrency limits, connection pool sizing |
| Load testing | `oha`/`k6`, p99 not average |

## Milestones

| # | Ship | Done when |
| --- | --- | --- |
| 1 | Redirect from a hashmap | `GET /abc` → 302, in memory |
| 2 | Persist to Postgres | links survive a restart |
| 3 | Add caching | repeat reads hit cache, not the DB |
| 4 | Rate limit writes | 429 after N per minute per IP |
| 5 | Measure | 10k req/s locally, p99 < 5 ms |
| 6 | Harden | graceful shutdown, timeouts, `/readyz` |

## Schema

```sql
CREATE TABLE links (
    code        TEXT PRIMARY KEY,
    target      TEXT NOT NULL,
    owner_id    BIGINT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    hits        BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX idx_links_owner ON links (owner_id, created_at DESC);
```

`code` as the primary key means the hot read is a primary-key lookup — no second
index, no join. The counter lives in the same row; updating it on every redirect
would serialise writes, so increment it in batches from a background task.

## Handlers

```rust
use axum::{
    extract::{Path, State},
    http::{StatusCode, HeaderMap},
    response::Redirect,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Deserialize)]
pub struct CreateLink { pub target: String }

#[derive(Serialize)]
pub struct Created { pub code: String, pub short_url: String }

pub async fn create(
    State(st): State<Arc<AppState>>,
    Json(body): Json<CreateLink>,
) -> Result<(StatusCode, Json<Created>), ApiError> {
    let url = url::Url::parse(&body.target)
        .map_err(|_| ApiError::Validation("target must be an absolute URL".into()))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(ApiError::Validation("only http(s) targets".into()));
    }

    // retry on the (rare) code collision instead of pre-checking
    for _ in 0..5 {
        let code = nanoid::nanoid!(7);
        let inserted = sqlx::query("INSERT INTO links (code, target) VALUES ($1, $2) ON CONFLICT DO NOTHING")
            .bind(&code)
            .bind(url.as_str())
            .execute(&st.pool)
            .await?;
        if inserted.rows_affected() == 1 {
            st.cache.insert(code.clone(), url.to_string()).await;
            return Ok((StatusCode::CREATED, Json(Created {
                short_url: format!("{}/{}", st.cfg.public_base, code),
                code,
            })));
        }
    }
    Err(ApiError::Internal(anyhow::anyhow!("could not allocate a code")))
}

pub async fn redirect(
    State(st): State<Arc<AppState>>,
    Path(code): Path<String>,
) -> Result<Redirect, ApiError> {
    if let Some(target) = st.cache.get(&code).await {
        st.metrics.cache_hit();
        return Ok(Redirect::temporary(&target));
    }

    let row: Option<(String,)> = sqlx::query_as("SELECT target FROM links WHERE code = $1")
        .bind(&code)
        .fetch_optional(&st.pool)
        .await?;

    let (target,) = row.ok_or(ApiError::NotFound)?;
    st.cache.insert(code, target.clone()).await;
    Ok(Redirect::temporary(&target))
}
```

## The cache stampede you will hit

Under load, a popular code that is not cached sends 500 concurrent queries for the
same row. Two lines prevent it:

```rust
// 1. per-key lock: only one task misses at a time
let lock = st.locks.entry(code.clone()).or_default();
let _guard = lock.lock().await;
// 2. re-check after acquiring — someone else probably filled it
if let Some(hit) = st.cache.get(&code).await { return Ok(Redirect::temporary(&hit)); }
```

`moka::future::Cache` does this for you with `try_get_with`. Use it, then read
its source to see how it works.

## Rate limiting without a Redis dependency

```rust
use tower_governor::{GovernorLayer, governor::GovernorConfigBuilder};

let limiter = GovernorConfigBuilder::default()
    .per_second(5)
    .burst_size(20)
    .finish()
    .unwrap();

let app = Router::new()
    .route("/{code}", get(redirect))
    .route("/links", post(create).layer(GovernorLayer { config: Arc::new(limiter) }))
    .with_state(state);
```

Apply it to **writes only**. Rate-limiting redirects turns your CDN into a 429
machine the moment a link goes viral.

## Measure before you optimise

```bash
$ cargo build --release
$ oha -z 30s -c 200 http://localhost:8080/abc123
```

Read p99 and the error rate, not the mean. Then profile:

```bash
$ cargo flamegraph --bin linkforge
```

The usual findings, in order: `println!` logging in the hot path, a fresh
`reqwest::Client` per request, pool exhaustion (`acquire_timeout` errors), and
`format!` in the redirect path.

## Stretch goals

- Custom slugs with reserved-word blocking.
- Click analytics: aggregate in a `link_hits` table, roll up hourly.
- Expiring links (`expires_at`, filtered in the query, cleaned by a worker).
- A/B redirects: same code, two targets, sticky by cookie.
- Deploy it: multi-stage Docker image, 3 replicas behind a load balancer.

## Demo checklist

- [ ] `oha` output showing p99 under 5 ms at 10k req/s
- [ ] cache hit ratio in `/metrics`
- [ ] 429 from the rate limiter, with `Retry-After`
- [ ] a graceful restart with zero dropped requests
