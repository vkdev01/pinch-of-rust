---
summary: A client that does not leak connections, retries what is safe to retry, and streams what does not fit in memory.
level: Intermediate
time: 15 min
tags: [http, json, async]
---

# HTTP and JSON

## One client for the process

```rust
use std::time::Duration;
use reqwest::Client;

pub fn client() -> Client {
    Client::builder()
        .timeout(Duration::from_secs(10))
        .connect_timeout(Duration::from_secs(3))
        .pool_max_idle_per_host(16)
        .user_agent(concat!("myapp/", env!("CARGO_PKG_VERSION")))
        .build()
        .expect("client config is static")
}

// build once, clone everywhere — a Client is an Arc internally
static CLIENT: std::sync::LazyLock<Client> = std::sync::LazyLock::new(client);
```

> **Trap:** `reqwest::get(...)` creates a new client per call: new connection pool,
> new TLS session, no keep-alive. Under load this is the difference between 200 and
> 20,000 requests/second.

## GET JSON into a typed struct

```rust
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct Repo {
    name: String,
    stargazers_count: u32,
    #[serde(default)]
    description: Option<String>,
}

let repo: Repo = CLIENT
    .get("https://api.github.com/repos/rust-lang/rust")
    .send()
    .await?
    .error_for_status()?          // 4xx/5xx become Err, not a parse failure
    .json()
    .await?;
```

`error_for_status()` matters: without it, a 404 page fails later with a confusing
JSON parse error.

## POST JSON and read the response

```rust
#[derive(serde::Serialize)]
struct CreateUser<'a> { email: &'a str, plan: &'a str }

let res = CLIENT
    .post("https://api.example.com/v1/users")
    .bearer_auth(&token)
    .json(&CreateUser { email, plan: "pro" })
    .send()
    .await?;

match res.status() {
    s if s.is_success() => Ok(res.json::<User>().await?),
    s if s == reqwest::StatusCode::TOO_MANY_REQUESTS => {
        let retry = res.headers().get("retry-after") /* parse seconds */;
        Err(Error::RateLimited { retry })
    }
    s => Err(Error::Http { status: s, body: res.text().await? }),
}
```

## Retry only what is safe

```rust
use std::time::Duration;

pub async fn get_with_retry(url: &str) -> anyhow::Result<bytes::Bytes> {
    let mut delay = Duration::from_millis(200);
    let mut last = None;

    for attempt in 1..=4 {
        match CLIENT.get(url).send().await {
            Ok(r) if r.status().is_server_error() || r.status() == 429 => {
                last = Some(anyhow::anyhow!("{} after {} attempts", r.status(), attempt));
            }
            Ok(r) => return Ok(r.error_for_status()?.bytes().await?),
            Err(e) if e.is_timeout() || e.is_connect() => {
                last = Some(e.into());
            }
            Err(e) => return Err(e.into()),      // 4xx and decode errors: do not retry
        }
        tokio::time::sleep(delay).await;
        delay = (delay * 2).min(Duration::from_secs(8));
    }
    Err(last.unwrap())
}
```

Retrying a 400 or a 422 just multiplies your error rate. Retry **timeouts, connection
resets, 429 and 5xx** — nothing else.

## Stream a response instead of buffering it

```rust
use futures::StreamExt;

let mut stream = CLIENT.get(url).send().await?.bytes_stream();
let mut total = 0usize;
while let Some(chunk) = stream.next().await {
    total += chunk?.len();       // never holds the whole body in memory
}
```

## Parse JSON leniently and strictly in the same codebase

```rust
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Strict { user_id: u64 }

#[derive(Deserialize)]
struct Lenient {
    #[serde(alias = "user_id", alias = "userId")]
    id: u64,
    #[serde(default)]
    extra: serde_json::Value,
}
```

`deny_unknown_fields` is the right default for an API you control: a typo in a
field name becomes an error instead of a silently missing value.

## Produce JSON without a struct

```rust
let body = serde_json::json!({
    "event": "signup",
    "user": { "id": id, "plan": plan },
    "ts": chrono::Utc::now(),
});
```

`json!` is fine at the edges. Inside a hot path, serialise a struct — the macro
builds a `Map` per call.

## Read a huge JSON file without loading it

```rust
use serde::de::DeserializeOwned;

fn read_stream<T: DeserializeOwned>(path: &str) -> anyhow::Result<impl Iterator<Item = T>> {
    let f = std::fs::File::open(path)?;
    let stream = serde_json::Deserializer::from_reader(std::io::BufReader::new(f))
        .into_iter::<T>();
    Ok(stream.map(|r| r.expect("valid JSON")))
}
```

Works for JSON Lines and for a top-level array only if you use `StreamDeserializer`
with `Deserialize` on each element — for a real 2 GB array, prefer JSONL.

## Timeouts that actually fire

```rust
let res = tokio::time::timeout(Duration::from_secs(5), CLIENT.get(url).send()).await??;
```

A `Client` timeout covers the whole request; `tokio::time::timeout` covers a step
you are waiting on. Use both — the client timeout for the network, the outer one
for your own logic.

**Next:** [Concurrency recipes](04-concurrency.md)
