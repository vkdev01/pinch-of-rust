---
summary: Arrow, DataFusion and Polars — why the analytical stack moved to Rust, and how to use it from a pipeline.
level: Intermediate
time: 25 min
tags: [data, arrow, pipelines]
---

# Data and streaming

The analytical stack has been quietly rewritten. The engine is Rust, the memory
format is Arrow, and the query language is still SQL.

## What the domain demands

| Requirement | Consequence |
| --- | --- |
| Columnar memory | Analytical scans touch 3 columns of 300; row layout wastes 99% of the I/O |
| Vectorised execution | Process 1024 values per branch, not one |
| Multi-threaded by default | A single-core dataframe library is a toy |
| Predictable memory | OOM is the default failure mode of data work |
| Interop | Python, Java, R all need to read the same buffers without copying |

Arrow is the answer to the last one: a language-agnostic columnar memory layout
with zero-copy reads across FFI. Rust implementations of Arrow became the fastest
ones, and the engines followed.

## Who runs it

| Project | What it is |
| --- | --- |
| **Polars** | a dataframe library with a lazy query optimiser, written in Rust, exposed to Python |
| **InfluxDB IOx** | InfluxDB 3's storage engine: Rust + Arrow + DataFusion |
| **DataFusion** | a query planner and execution engine you embed in your own product |
| **Materialize** | streaming SQL over changing data, in Rust |
| **Databend, RisingWave** | warehouse and stream-processing engines built on the same stack |
| **Delta-rs, iceberg-rust** | table formats implemented in Rust for other engines to use |

The strategic shift: these are not Python tools with a Rust core. They are Rust
engines with a Python binding, because the engine was the bottleneck.

## The shape of the code

A pipeline that reads 40 GB of Parquet without loading it:

```rust
use polars::prelude::*;

fn daily_revenue(path: &str) -> PolarsResult<DataFrame> {
    LazyFrame::scan_parquet(path, ScanArgsParquet::default())?   // lazy: nothing read yet
        .filter(col("status").eq(lit("paid")))
        .with_columns([
            (col("amount_paise").cast(DataType::Float64) / lit(100.0)).alias("amount"),
            col("created_at").dt().truncate("1d").alias("day"),
        ])
        .group_by([col("day"), col("currency")])
        .agg([
            col("amount").sum().alias("gross"),
            col("order_id").count().alias("orders"),
        ])
        .sort(["day"], SortMultipleOptions::default())
        .collect()
}
```

Three things the lazy engine does that a naive loop does not:

1. **Predicate pushdown** — the `status = 'paid'` filter is applied while reading
   row groups, so rejected rows are never decompressed.
2. **Projection pushdown** — only the five columns referenced are read.
3. **Vectorised aggregation** — hash-grouped in parallel across cores.

On a wide table this is routinely a 10–50× difference in wall time.

## Reading Arrow directly

When you are writing the engine rather than using one:

```rust
use arrow::array::{Int64Array, StringArray};
use arrow::compute::filter;
use arrow::record_batch::RecordBatch;

fn filter_paid(batch: &RecordBatch) -> arrow::error::Result<RecordBatch> {
    let status = batch.column(2).as_any().downcast_ref::<StringArray>().unwrap();
    let mask = arrow::compute::kernels::comparison::eq_scalar(status, "paid")?;

    let columns = batch
        .columns()
        .iter()
        .map(|c| filter(c.as_ref(), &mask))
        .collect::<Result<Vec<_>, _>>()?;

    RecordBatch::try_new(batch.schema(), columns)
}
```

`filter` is a single SIMD-accelerated call over a boolean bitmap. No per-row
branch, no allocation per value.

## A streaming job that does not fall over

```rust
use futures::stream::{self, StreamExt};

// 10k events/s in, 32 concurrent enrichments, bounded memory out
let enriched: Vec<_> = stream::iter(events)
    .map(|ev| async move {
        let customer = lookup(ev.customer_id).await?;
        Ok::<_, anyhow::Error>(enrich(ev, customer))
    })
    .buffer_unordered(32)
    .filter_map(|r| async move { r.ok() })
    .collect()
    .await;
```

`buffer_unordered` is the single most important line in a data pipeline: it keeps
throughput high without opening 10,000 connections.

## What to steal for your own project

1. **Choose the format for the access pattern.** Parquet for scans, Arrow IPC for
   between-process handoff, JSON only at the edges.
2. **Never `read_*` what you can `scan_*`.** Eager loading is the default bug.
3. **Batch by size or time, whichever comes first** — a 1 ms flush per event is a
   thousand syscalls a second.

## Where Rust is the wrong answer

- Exploratory analysis. Polars-from-Python is the right interface; writing the
  exploration in Rust is slower to iterate.
- Anything that needs the Python ML ecosystem in the same process — use PyO3, or
  keep the boundary at a file.

## Try it

Take a 1 GB CSV, load it with `pandas.read_csv` and with
`polars.scan_csv(...).collect()`, and compare both wall time and peak RSS. The
memory number is usually the more surprising of the two.

**Next:** [Fintech and payments](04-fintech-and-payments.md)
