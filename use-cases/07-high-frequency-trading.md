---
summary: Nanoseconds, determinism and cache lines — what a trading system demands, where Rust fits, and where C++ still wins.
level: Advanced
time: 30 min
tags: [hft, latency, systems]
---

# High-frequency trading

HFT is the most demanding latency environment in commercial software. A tick-to-trade
path is measured in **hundreds of nanoseconds**, and every abstraction you cannot see
costs you the trade.

## The latency budget, honestly

| Stage | Typical cost |
| --- | --- |
| kernel network stack (socket → userspace) | 5–20 µs |
| kernel bypass (Solarflare/Onload, DPDK) | 0.5–2 µs |
| parse a market-data message | 50–200 ns |
| order book update | 50–100 ns |
| strategy decision | 100 ns – 2 µs |
| risk check | 100–500 ns |
| order serialisation + send | 100–300 ns |

Add it up: **~1–5 µs end to end** for a well-engineered system, and most of that is
network, not code. Which is exactly why the code must not add any of its own.

## What the domain demands

| Requirement | Consequence |
| --- | --- |
| Deterministic latency | No GC, no allocator on the hot path, no locks |
| No hidden syscalls | A `println!` is a 1–10 µs disaster |
| Predictable memory | Pre-allocated, first-touched, pinned |
| Cache locality | Every pointer chase is ~100 cycles |
| Zero-copy | Parse in place, never build a `String` |
| Reproducibility | Replay the same tape, get the same decisions |

## Where Rust fits, honestly

**C++ still dominates the lowest-latency tier** — the exchange gateways, the
kernel-bypass drivers, the FPGA-adjacent code. That is a fact about two decades of
tooling, not about language quality.

**Rust is a strong and growing choice for:**

- market-data handlers and normalisers
- order-book and matching engines (crypto venues especially)
- pre-trade risk checks
- strategy research infrastructure and backtesters
- post-trade, reconciliation and surveillance
- gateways and protocol adapters (FIX, SBE, ITCH/OUCH)

Several crypto-native trading firms and exchanges run Rust in production matching
engines; traditional venues increasingly run it in the surrounding services. The
pattern mirrors cloud infrastructure: rewrite the component where correctness and
latency both matter, leave the rest.

**Why Rust is credible here:**

| Property | Why it matters |
| --- | --- |
| No GC | a 50 µs pause is a missed trade |
| No exceptions | error paths are explicit, no unwinding surprise |
| `Drop` is deterministic | cleanup happens when you say, not when a runtime decides |
| Memory safety | a use-after-free in an order book is a cancelled trade or a fine |
| Predictable codegen | no hidden allocations unless you call an allocating API |
| Excellent FFI | call into the C kernel-bypass libraries directly |

## The order book, as a data structure problem

The naive `BTreeMap<Price, Level>` is ~100 ns per update — too slow for the hot path.
Production books use a **price ladder**: a flat array indexed by tick offset.

```rust
/// Fixed-depth ladder around a moving mid price. No allocation, O(1) updates.
pub struct Ladder {
    base_tick: i64,          // tick index at slot 0
    bids: Vec<Level>,        // descending from best bid
    asks: Vec<Level>,        // ascending from best ask
    tick_size: f64,
}

#[derive(Clone, Copy, Default)]
pub struct Level { pub qty: u64, pub orders: u32 }

impl Ladder {
    pub fn new(depth: usize, tick_size: f64) -> Self {
        Self {
            base_tick: 0,
            bids: vec![Level::default(); depth],
            asks: vec![Level::default(); depth],
            tick_size,
        }
    }

    #[inline]
    fn slot(&self, price: i64) -> usize {
        (price - self.base_tick) as usize
    }

    /// Called on every market-data update: two stores, no branch on allocation.
    #[inline]
    pub fn set_bid(&mut self, price: i64, qty: u64) {
        let i = self.slot(price);
        if i < self.bids.len() {
            self.bids[i].qty = qty;
        }
    }

    #[inline]
    pub fn best_bid(&self) -> Option<(i64, u64)> {
        self.bids.iter().position(|l| l.qty > 0)
            .map(|i| (self.base_tick + i as i64, self.bids[i].qty))
    }

    #[inline]
    pub fn spread_ticks(&self) -> Option<i64> {
        let bid = self.best_bid()?.0;
        let ask = self.asks.iter().position(|l| l.qty > 0)? as i64 + self.base_tick;
        Some(ask - bid)
    }
}
```

The cost of a `Vec` bounds check here is one branch the predictor nails every time.
The cost of a `BTreeMap` insert is a cache miss you cannot afford.

## The things that actually ruin latency

| Mistake | Cost |
| --- | --- |
| `println!` on the hot path | 1–10 µs (locks stdout) |
| `format!` per message | 100–500 ns + allocator |
| default `HashMap` (SipHash) | 50–100 ns per lookup |
| first-touch page fault | 1–10 µs, once, at the worst time |
| `Mutex` under contention | 100 ns–10 µs (futex syscall) |
| `Arc` clone in a loop | 10–20 ns of atomic traffic |
| unwinding a panic | microseconds |
| any syscall | 100 ns–5 µs |

Fixes:

```toml
[profile.release]
panic = "abort"        # no unwind tables, no landing pads
lto = "fat"
codegen-units = 1
```

```rust
// a hasher that is not DoS-resistant, for internal id-keyed maps
use rustc_hash::FxHashMap;

// a SPSC ring for the market-data handoff (module 08.04)
// a fixed-size arena instead of Vec growth
// pre-touch every page at startup, not on the first tick
```

## Warm-up and determinism

```rust
/// Touch every page before the open so the first real update does not fault.
pub fn warm_up(ladder: &mut Ladder) {
    for p in 0..10_000i64 {
        ladder.set_bid(p, 0);
        ladder.set_bid(p, 0);
    }
}
```

And measure with the right tool:

```bash
$ taskset -c 3 ./target/release/engine          # pin to a core
$ perf stat -e cycles,instructions,cache-misses ./target/release/engine
$ cargo flamegraph --bin engine
```

Histograms beat averages: report p50, p99 and p99.9. A 2 µs mean with a 40 µs p99.9
is a losing system.

## The honest trade-offs

| | Rust | C++ |
| --- | --- | --- |
| lowest achieved latency | comparable, slightly behind in the most tuned paths | still the reference |
| memory safety | yes, by construction | no |
| tooling maturity for HFT | good and improving | decades of libraries |
| talent pool | smaller | larger |
| FFI to kernel-bypass libs | clean | native |
| compile-time guarantees | ownership removes whole bug classes | relies on discipline |

## What to steal for a non-HFT system

1. **Fixed-capacity data structures** beat dynamic ones when the bound is known.
2. **`panic = "abort"` and LTO** for every latency-sensitive service.
3. **Measure percentiles, not means** — this applies to any API.
4. **Warm up at startup**: connection pools, caches, page faults.
5. **No allocation on the hot path** — the same rule that keeps a game at 60 fps.

## Where Rust is the wrong answer

- The absolute lowest-latency tier where an existing C++ stack and a decade of
  tuning already exist, and the team has no Rust experience.
- FPGA and kernel-module work (C, or HDL).
- Anything where the exchange vendor ships a C++ SDK and nothing else.

## Try it

Build the price ladder and the SPSC feed from module 08.04, then benchmark
`set_bid` + `best_bid` at 10M updates. If it is not under 20 ns per update on a
pinned core, something in your loop is allocating.

**Next:** [Desktop applications](08-desktop-apps.md)
