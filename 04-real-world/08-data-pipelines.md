# 08 · Data Pipelines and Stream Processing

Rust's role in data is the *runtime*, not the notebook: ingestion services,
stream processors, and batch jobs where memory and latency are predictable.

## The two halves

| Batch | Streaming |
| --- | --- |
| Process a file or table | Process an endless event stream |
| `polars`, `arrow`, `parquet` | `rdkafka`, `tokio`, `serde` |
| Memory-bound, throughput-bound | Latency-bound, backpressure-bound |
| Runs to completion | Runs forever |

## Batch: Polars

Polars is a Rust dataframe library with a lazy query engine. It is the reason
"do it in Python with pandas" is no longer automatically right.

```toml
polars = { version = "0.4x", features = ["lazy", "csv", "parquet", "json", "temporal"] }
```

```rust
use polars::prelude::*;

fn main() -> PolarsResult<()> {
    let lf = LazyCsvReader::new("orders.csv")
        .with_has_header(true)
        .finish()?
        .filter(col("status").eq(lit("paid")))
        .with_columns([
            (col("qty") * col("price")).alias("amount"),
            col("created_at").str().to_datetime(
                Some(TimeUnit::Microseconds),
                None,
                StrptimeOptions::default(),
                lit("raise"),
            )?,
        ])
        .group_by([col("customer_id")])
        .agg([
            col("amount").sum().alias("total"),
            col("amount").mean().alias("avg"),
            col("order_id").count().alias("orders"),
        ])
        .sort(["total"], SortMultipleOptions::default().with_order_descending(true))
        .limit(100);

    let mut df = lf.collect()?;
    println!("{}", df.head(Some(10)));

    // write parquet — columnar, compressed, fast to re-read
    let mut file = std::fs::File::create("top_customers.parquet")?;
    ParquetWriter::new(&mut file).finish(&mut df)?;
    Ok(())
}
```

Key difference from pandas: `LazyFrame` builds a plan and the engine optimises it
— predicate pushdown, projection pushdown, common subexpression elimination —
before reading a single row. On a 10 GB parquet file that is the difference
between reading 200 MB and 10 GB.

### Streaming a file larger than memory

```rust
let q = LazyFrame::scan_parquet("huge.parquet", ScanArgsParquet::default())?
    .filter(col("country").eq(lit("IN")))
    .group_by([col("city")])
    .agg([col("amount").sum()]);

let df = q.collect()?;    // polars streams internally for scan_* sources
```

`scan_parquet` / `scan_csv` are lazy sources; `read_parquet` loads eagerly. Use
`scan_*` for anything big.

### Polars vs pandas

| | Polars | pandas |
| --- | --- | --- |
| Multi-threaded | yes, by default | mostly single-threaded |
| Memory model | Arrow, zero-copy | numpy + object columns |
| Nulls | first-class | `NaN` workarounds |
| Strings | fast, Arrow-backed | slow object columns |
| Ecosystem | smaller | enormous |

## Streaming: Kafka with `rdkafka`

```toml
rdkafka = { version = "0.36", features = ["cmake-build", "ssl", "sasl"] }
```

```rust
use rdkafka::consumer::{Consumer, StreamConsumer};
use rdkafka::message::Message;
use rdkafka::ClientConfig;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let consumer: StreamConsumer = ClientConfig::new()
        .set("group.id", "enricher")
        .set("bootstrap.servers", "localhost:9092")
        .set("enable.auto.commit", "false")        // commit AFTER processing
        .set("auto.offset.reset", "earliest")
        .create()?;

    consumer.subscribe(&["orders"])?;

    loop {
        let msg = consumer.recv().await?;
        let payload = msg.payload().unwrap_or_default();

        match serde_json::from_slice::<Order>(payload) {
            Ok(order) => {
                if let Err(e) = handle(&order).await {
                    tracing::error!(error = %e, "failed to handle order");
                    continue;                       // do not commit — retry
                }
                consumer.commit_message(&msg, rdkafka::consumer::CommitMode::Async)?;
            }
            Err(e) => {
                tracing::warn!(error = %e, "poison message, skipping");
                consumer.commit_message(&msg, rdkafka::consumer::CommitMode::Async)?;
            }
        }
    }
}
```

Two rules that matter more than the code:

1. **`enable.auto.commit = false`.** With auto-commit you acknowledge messages
   before processing them, so a crash silently loses data.
2. **Distinguish poison messages from transient failures.** A malformed message
   should go to a dead-letter topic, not block the partition forever. A database
   timeout should retry.

## A typed event envelope

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Event<T> {
    pub id: uuid::Uuid,
    pub kind: String,
    pub version: u16,
    pub occurred_at: chrono::DateTime<chrono::Utc>,
    pub payload: T,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OrderPlaced {
    pub order_id: u64,
    pub customer_id: u64,
    pub amount: i64,          // paise, not rupees — never floats for money
    pub currency: String,
}
```

`version` in the envelope lets consumers handle schema evolution. Money as integer
minor units is non-negotiable — floating point money bugs are real and expensive.

## Backpressure

A pipeline with no backpressure is a memory leak that runs at the speed of the
slowest stage. Three mechanisms:

```rust
// 1. bounded channel between stages
let (tx, mut rx) = tokio::sync::mpsc::channel::<Batch>(64);

// 2. bounded concurrency for outbound calls
let sem = std::sync::Arc::new(tokio::sync::Semaphore::new(32));

// 3. batch by size or time, whichever comes first
struct Batcher { buf: Vec<Event>, max: usize, flush_at: tokio::time::Instant }
```

```rust
use futures::stream::{self, StreamExt};

let results: Vec<_> = stream::iter(items)
    .map(|item| async move { process(item).await })
    .buffer_unordered(16)          // at most 16 in flight
    .collect()
    .await;
```

`buffer_unordered(16)` is the single most useful line in a data pipeline: it
keeps throughput high without opening 100,000 connections.

## Exactly-once vs at-least-once

True exactly-once is expensive and rare. The practical approach:

1. **At-least-once delivery** — retry on failure, accept duplicates.
2. **Idempotent processing** — a unique key plus `ON CONFLICT DO NOTHING`.
3. **Deterministic output keys** — write to a path or row keyed by event id.

```rust
let inserted = sqlx::query(
    "INSERT INTO processed_events (event_id) VALUES ($1) ON CONFLICT DO NOTHING",
)
.bind(event.id)
.execute(&pool)
.await?
.rows_affected();

if inserted == 0 {
    tracing::debug!(id = %event.id, "duplicate, skipping");
    return Ok(());
}
```

This gives you the *effect* of exactly-once on top of at-least-once delivery. It
is what every mature pipeline actually does.

## A worked example: CSV → validate → aggregate → Parquet

```rust
use polars::prelude::*;
use std::fs::File;

fn etl(input: &str, output: &str) -> PolarsResult<()> {
    let lf = LazyCsvReader::new(input)
        .with_has_header(true)
        .with_try_parse_dates(true)
        .finish()?
        // drop rows that fail validation, keep the count separately
        .filter(col("amount").gt(lit(0)).and(col("currency").is_in(lit(
            Series::new("c".into(), ["INR", "USD", "EUR"]),
        ))))
        .with_columns([
            (col("amount").cast(DataType::Float64) / lit(100.0)).alias("amount_major"),
            col("ts").dt().truncate("1d").alias("day"),
        ])
        .group_by([col("day"), col("currency")])
        .agg([
            col("amount_major").sum().alias("gross"),
            col("amount_major").count().alias("txns"),
        ])
        .sort(["day"], SortMultipleOptions::default());

    let mut df = lf.collect()?;
    let mut file = File::create(output)?;
    ParquetWriter::new(&mut file)
        .with_compression(ParquetCompression::Zstd(None))
        .finish(&mut df)?;

    println!("wrote {} rows to {output}", df.height());
    Ok(())
}
```

Note the filter happens *before* the aggregation, so the optimizer never
materialises the rejected rows.

## When Rust beats Python here, and when it does not

**Rust wins:** long-running ingestion services, per-event latency under a
millisecond, memory predictability, deploying a single binary with no interpreter,
and pipelines processing terabytes where pandas would OOM.

**Python wins:** exploratory analysis, notebook iteration, the ML ecosystem, and
anything where the library you need only exists in Python.

The common professional split: prototype in Python, then rewrite the hot path —
or just the production job — in Rust once the shape of the problem is known.

---

## Exercises

1. Write a Polars pipeline that reads a CSV, filters, aggregates by day and
   writes Zstd-compressed Parquet.
2. Compare `read_csv` + `collect` against `scan_csv` + `collect` on a 1 GB file.
   Measure peak RSS.
3. Consume from a Kafka topic with manual commits and prove a restart does not
   lose messages.
4. Add a dead-letter topic for messages that fail to deserialise.
5. Add `buffer_unordered(16)` to a sequential enrichment loop and measure the
   throughput change.
6. Implement idempotent processing with a `processed_events` table and prove a
   duplicate event is a no-op.

**Next:** [Capstone: brief and architecture](../05-capstone/01-brief-and-architecture.md)
