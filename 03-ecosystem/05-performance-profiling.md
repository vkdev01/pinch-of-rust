# 05 · Performance and Profiling

Rust is fast by default, but "fast by default" is not the same as "fast in your
program". This module is about measuring first and changing second.

## The rule

**Never optimise without a measurement.** Every section below assumes you have a
profile or a benchmark in hand. Intuition about performance is wrong often
enough that guessing is a waste of time.

## Step 1: build for measurement

```bash
$ cargo build --release
$ cargo bench                      # criterion (module 03.03)
```

```toml
[profile.release]
debug = true        # keep symbols so profilers show function names
```

Then strip for the shipped binary (`strip = "symbols"` in a separate profile).

## Step 2: profile

### Linux: `perf`

```bash
$ perf record -g --call-graph dwarf ./target/release/myapp
$ perf report
$ perf stat ./target/release/myapp      # cache misses, branch misses, IPC
```

`--call-graph dwarf` needs `debug = true` and gives readable stacks.

### Flame graphs

```bash
$ cargo install flamegraph
$ cargo flamegraph --bin myapp -- --args
# opens flamegraph.svg
```

Wide bars are where the time goes. Look for the widest **leaf** frame — that is
actual work, not the call chain above it.

### macOS: `Instruments`, `samply`

```bash
$ cargo install samply
$ samply record ./target/release/myapp
```

`samply` opens a Firefox Profiler UI with a timeline — better than flame graphs
for async code, because it shows idle time separately.

### Async profiling

Flame graphs of async code show the executor, not your tasks. For tokio, enable
`tokio-console`:

```toml
tokio = { version = "1", features = ["full", "tracing"] }
console-subscriber = "0.4"
```

```rust
console_subscriber::init();
```

```bash
$ cargo install tokio-console
$ tokio-console
```

You get per-task poll counts, busy time, wakeups, and — most importantly — tasks
that are blocked for a long time.

## Step 3: the usual wins, in order

### 1. Algorithm and data structure

Nothing else competes. A `HashMap` lookup instead of a linear scan inside a loop
is a 1000× win; no compiler flag comes close.

```rust
// O(n²) — 10,000 items = 100M comparisons
for a in &items { if other.contains(a) { } }

// O(n) with a HashSet
let set: HashSet<_> = other.iter().collect();
for a in &items { if set.contains(a) { } }
```

### 2. Allocations

Every `String`/`Vec`/`format!` allocates. In a hot loop this dominates.

```rust
// allocations: 1 per iteration
for row in rows { out.push(format!("{},{}", row.a, row.b)); }

// one allocation, reused buffer
use std::fmt::Write;
let mut buf = String::with_capacity(1024);
for row in rows {
    buf.clear();
    write!(buf, "{},{}", row.a, row.b).unwrap();
    out.push_str(&buf);
}
```

```rust
// pre-size collections you know the length of
let mut v = Vec::with_capacity(rows.len());
let mut m = HashMap::with_capacity(rows.len());
```

Consider `SmallVec<[T; 8]>` when most vectors stay small — it avoids the heap
entirely for ≤ 8 items.

### 3. Cloning

```rust
// clones the whole struct per call
fn handle(user: User) -> String { user.name.clone() }

// borrows instead
fn handle(user: &User) -> &str { &user.name }
```

`cargo clippy` flags some of these with `redundant_clone`; the rest you find in
a profile.

### 4. I/O buffering

```rust
// one syscall per line — 100× slower
let f = File::create("out.txt")?;
for line in lines { writeln!(f, "{line}")?; }

// buffered
use std::io::BufWriter;
let mut w = BufWriter::new(File::create("out.txt")?);
for line in lines { writeln!(w, "{line}")?; }
w.flush()?;
```

Same for reading: `BufReader`. For very large files, `memmap2` avoids copying
altogether.

### 5. Bounds checks

Iterators usually eliminate them:

```rust
// bounds check per iteration
let mut sum = 0;
for i in 0..v.len() { sum += v[i]; }

// no bounds check — the compiler proves the iterator stays in range
let sum: i64 = v.iter().sum();
```

When you genuinely need indexed access and have proven safety, `get_unchecked`
in an `unsafe` block removes the check — but measure first; modern CPUs predict
bounds checks almost perfectly and the win is often zero.

### 6. String building

```rust
// quadratic: reallocates and copies each time
let mut s = String::new();
for part in parts { s = s + part; }

// linear
let mut s = String::with_capacity(total_len);
for part in parts { s.push_str(part); }
```

### 7. Hashing

The default `SipHash` in `HashMap` is DoS-resistant and slow. For trusted,
internal keys, `ahash` or `rustc-hash` is 2–3× faster:

```toml
ahash = "0.8"
```

```rust
use ahash::AHashMap;
let mut m: AHashMap<u64, String> = AHashMap::new();
```

Do **not** do this for a map keyed by untrusted input — you lose hash-flooding
protection.

### 8. `Vec` growth patterns

```rust
// repeated removal from the front is O(n) each time
while !v.is_empty() { v.remove(0); }

// O(1)
let mut dq = std::collections::VecDeque::from(v);
while let Some(_) = dq.pop_front() { }
```

### 9. Compile flags

```toml
[profile.release]
lto = "fat"
codegen-units = 1
panic = "abort"
```

```bash
$ RUSTFLAGS="-C target-cpu=native" cargo build --release
```

`target-cpu=native` enables AVX2/AVX-512 and is worth 5–20% on numeric code — but
the binary then may not run on older CPUs. In containers, build with an explicit
`target-cpu=x86-64-v3` instead.

### 10. Parallelism

After everything else, use rayon:

```rust
use rayon::prelude::*;
let total: u64 = data.par_iter().map(|x| heavy(x)).sum();
```

Only after the single-threaded version is tight. Parallelising a slow algorithm
just makes it slow in parallel.

## Reading `perf stat`

```text
  1,234,567,890      cycles
    987,654,321      instructions     #  0.80  insn per cycle
     45,678,901      branches
      1,234,567      branch-misses    #  2.70% of all branches
     12,345,678      cache-misses     # 15.2% of all cache refs
```

- **IPC < 1.0** — usually memory-bound or branch-heavy, not compute-bound.
  Look at data layout.
- **High branch-misses** — unpredictable branches. Sorting input first, or
  branchless code, helps.
- **High cache-misses** — the working set does not fit in cache. Restructure to
  arrays of structs → struct of arrays.

## Struct of arrays vs array of structs

```rust
// AoS — good for "process one entity at a time"
struct Particle { x: f32, y: f32, vx: f32, vy: f32 }
let particles: Vec<Particle>;

// SoA — good for "process one field across all entities"
struct Particles { x: Vec<f32>, y: Vec<f32>, vx: Vec<f32>, vy: Vec<f32> }
```

SoA vectorises: `for x in &p.x { *x += 1.0 }` is a clean SIMD loop. AoS forces
gather/scatter. This is a 2–10× difference in numeric kernels.

## Zero-cost abstractions: what is actually free

Free (compiled away):

- iterators and closures (after inlining)
- generics and monomorphisation
- newtypes
- `Option<&T>` (niche optimisation)
- `#[inline]` on small functions

Not free:

- `dyn Trait` dispatch (one indirect call, blocks inlining)
- `Box`/`Rc`/`Arc` (allocation and counting)
- `format!` (allocation)
- `RefCell` (runtime borrow flag)
- `clone()` (obvious, but easy to miss inside a chain)

## A worked example: profiling a real bottleneck

Start with a slow function:

```rust
fn count_words(text: &str) -> HashMap<String, usize> {
    let mut m = HashMap::new();
    for w in text.split_whitespace() {
        *m.entry(w.to_string()).or_insert(0) += 1;   // allocates per word
    }
    m
}
```

Profile says: `to_string` and `HashMap::entry` dominate. Three changes:

```rust
fn count_words_fast(text: &str) -> HashMap<String, usize> {
    // 1. borrow instead of allocating — keys point into `text`
    let mut m: HashMap<&str, usize> = HashMap::with_capacity(256);
    for w in text.split_whitespace() {
        *m.entry(w).or_insert(0) += 1;              // no allocation
    }
    // 2. convert once at the end, if you need owned keys
    m.into_iter().map(|(k, v)| (k.to_string(), v)).collect()
}
```

Measured on a 10 MB corpus: ~4× faster, and the first version's allocation count
(~1.2M) drops to ~30k (the final conversion only).

## Benchmarks that lie

| Trap | Fix |
| --- | --- |
| Debug build | Always `--release` / criterion |
| Optimiser removes the work | `black_box(input)` and `black_box(result)` |
| One run, cold cache | criterion runs many iterations and reports statistics |
| Unrealistic input | Benchmark with production-sized, production-shaped data |
| Benchmarking the setup | Hoist setup out of the timed closure |
| Comparing micro-opts with no profile | Measure end-to-end first |

---

## Exercises

1. Generate a flame graph for a program with an obvious hot loop. Identify the
   widest leaf frame.
2. Take `count_words` and measure both versions with criterion. Report the ratio
   and the allocation count (use a counting allocator).
3. Convert an AoS `Vec<Particle>` to SoA and benchmark a physics step.
4. Run `perf stat` on a hot loop and report IPC. Is it compute- or memory-bound?
5. Replace `HashMap` with `AHashMap` in a benchmark and measure the difference.
6. Add `BufWriter` to a file-writing loop and measure the speedup on 1M lines.

**Next:** [Observability](06-observability.md)
