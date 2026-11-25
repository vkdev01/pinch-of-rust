---
summary: Build a parallel log-search CLI that beats grep on a 2 GB file — then learn why it is fast.
level: Intermediate
time: 8–12 h
tags: [cli, performance, files]
---

# log-lens — a grep you would actually ship

Most Rust tutorials end at "hello, world". This project ends at a binary you can
`cargo install` and use on a real 2 GB log file, with a benchmark that proves it.

**What it is:** `lens <pattern> <path>` — recursive, parallel, gitignore-aware log
search with coloured output, JSON mode and a `--top` summary of the noisiest paths.

## What you learn

| Skill | Where it comes from |
| --- | --- |
| Ownership across threads | `Arc`, `Send`, scoped threads |
| Zero-copy parsing | `&str` slices, `memchr`, avoiding `String` |
| CLI ergonomics | `clap` derive, exit codes, stdin |
| Real performance work | `perf`, criterion, allocation counting |
| Distribution | static musl build, `cargo-dist` |

## Milestones

| # | Ship | Done when |
| --- | --- | --- |
| 1 | Walk a directory | prints every `.log` file under a path |
| 2 | Match lines | prints `path:line:text` for a regex |
| 3 | Parallelise | 4 threads, results interleaved correctly |
| 4 | Be fast | `--release` beats `grep -r` on 2 GB |
| 5 | Be usable | `--json`, `--top N`, Ctrl-C, exit codes 0/1/2 |
| 6 | Be shippable | one static binary, no glibc dependency |

## Crates

```toml
[dependencies]
clap = { version = "4", features = ["derive"] }
ignore = "0.4"        # gitignore-aware walking, the crate ripgrep uses
memchr = "2"          # SIMD substring search
rayon = "1"           # data parallelism
anyhow = "1"
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[dev-dependencies]
assert_cmd = "2"
predicates = "3"
tempfile = "3"
criterion = "0.5"
```

## The core loop

```rust
use ignore::WalkBuilder;
use memchr::memmem;
use rayon::prelude::*;
use std::sync::atomic::{AtomicUsize, Ordering};

pub struct Hit {
    pub path: String,
    pub line: usize,
    pub text: String,
}

pub fn search(root: &str, needle: &str, threads: usize) -> Vec<Hit> {
    let files: Vec<_> = WalkBuilder::new(root)
        .standard_filters(true)          // respects .gitignore
        .build()
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_some_and(|t| t.is_file()))
        .map(|e| e.into_path())
        .collect();

    let finder = memmem::Finder::new(needle.as_bytes());

    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(threads)
        .build()
        .unwrap();

    pool.install(|| {
        files
            .par_iter()
            .flat_map_iter(|path| scan_file(path, &finder))
            .collect()
    })
}

fn scan_file(path: &std::path::Path, finder: &memmem::Finder<'_>) -> Vec<Hit> {
    // mmap-free: read the whole file, but borrow from it — no per-line allocation
    let Ok(bytes) = std::fs::read(path) else { return Vec::new() };
    let text = match std::str::from_utf8(&bytes) {
        Ok(t) => t,
        Err(_) => return Vec::new(),   // binary file, skip
    };

    let mut hits = Vec::new();
    for (i, line) in text.lines().enumerate() {
        if finder.find(line.as_bytes()).is_some() {
            hits.push(Hit {
                path: path.display().to_string(),
                line: i + 1,
                text: line.trim_end().to_string(),   // one allocation per hit only
            });
        }
    }
    hits
}
```

> **Gotcha:** `flat_map_iter` keeps the parallel unit at file granularity while the
> inner iterator stays sequential. `flat_map` would try to parallelise inside the
> closure, which is slower and starves the pool.

## Ordering results without a mutex

```rust
// collecting into a Vec from par_iter preserves input order — free determinism
let hits: Vec<Hit> = files.par_iter().flat_map_iter(|p| scan_file(p, &finder)).collect();
hits.sort_by(|a, b| a.path.cmp(&b.path).then(a.line.cmp(&b.line)));
```

## Making it beat grep

Three changes, measured in this order:

1. **Skip files you cannot read as text** — check for a NUL byte in the first 8 KB
   instead of parsing.
2. **Search bytes, not chars** — `memmem::Finder` on `&[u8]` is SIMD; `regex` is not.
3. **Print from one thread** — write results to a `BufWriter<StdoutLock>` at the
   end, or buffer per file. `println!` per hit takes a lock every line.

```rust
use std::io::{self, BufWriter, Write};

let mut out = BufWriter::new(io::stdout().lock());
for h in &hits {
    writeln!(out, "{}:{}: {}", h.path, h.line, h.text)?;
}
out.flush()?;
```

## Benchmark it honestly

```rust
// benches/search.rs
use criterion::{black_box, criterion_group, criterion_main, Criterion};

fn bench(c: &mut Criterion) {
    let haystack = "INFO handled request in 12ms\n".repeat(200_000);
    c.bench_function("scan 200k lines", |b| {
        b.iter(|| {
            let n = black_box(&haystack)
                .lines()
                .filter(|l| l.contains("INFO"))
                .count();
            black_box(n)
        })
    });
}

criterion_group!(benches, bench);
criterion_main!(benches);
```

```bash
$ hyperfine --warmup 3 './target/release/lens ERROR /var/log' 'grep -r ERROR /var/log'
```

Report the ratio, not the milliseconds. A 3× win on the same hardware is a result;
"0.4s" is not.

## Stretch goals

- `--context N` (lines before/after) using a ring buffer.
- `--top 10` — group hits by path, sort by count, print a table.
- Coloured output with `anstream`, disabled automatically when piped.
- Watch mode: `notify` crate, re-run on file change.
- Ship it: `cargo dist init` and a Homebrew tap.

## Demo checklist

- [ ] `lens ERROR ./logs` on a real 2 GB directory, timed against grep
- [ ] `lens --json` piped into `jq`
- [ ] exit 1 when nothing matched, exit 2 on a bad regex
- [ ] one static binary that runs on a bare Alpine container
