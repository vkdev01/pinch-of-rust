---
summary: A limit order book and matching engine with price-time priority, deterministic replay and nanosecond benchmarks.
level: Advanced
time: 16–20 h
tags: [hft, data-structures, performance]
---

# matchbox — a limit order book and matching engine

The single best data-structure project in Rust: it forces you to combine a fixed
ladder, an intrusive linked list, a hash map and a ring buffer, all with no
allocation on the hot path.

**What it is:** a matching engine that accepts `NewOrder` / `Cancel`, matches with
price-time priority, emits trades and market-data updates, and can replay a tape
deterministically.

## What you learn

| Skill | Where it comes from |
| --- | --- |
| O(1) book updates | fixed price ladder, not a tree |
| Intrusive lists | index-linked order queue, no `Box` per order |
| Determinism | replay the same tape, get the same trades |
| Latency measurement | `perf`, histograms, p99.9 not mean |
| Protocol design | typed messages, versioned feed |

## Milestones

| # | Ship | Done when |
| --- | --- | --- |
| 1 | Add and cancel orders | book state matches a hand-checked example |
| 2 | Match | a crossing order produces the right trades, at the right prices |
| 3 | Price-time priority | two orders at the same price fill FIFO |
| 4 | No allocation | zero allocator calls during 1M order processing |
| 5 | Fast | under 50 ns per add/cancel on a pinned core |
| 6 | Deterministic | replaying a tape twice produces byte-identical output |

## The data structures

```rust
use std::collections::HashMap;

pub type OrderId = u64;
pub type Price = i64;      // integer ticks, never f64

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Side { Buy, Sell }

#[derive(Clone, Copy, Debug)]
pub struct Order {
    pub id: OrderId,
    pub side: Side,
    pub price: Price,
    pub qty: u64,
    pub prev: Option<u32>,     // intrusive links into the level queue
    pub next: Option<u32>,
}

/// One price level: a FIFO queue of order indices.
#[derive(Default)]
pub struct Level {
    pub head: Option<u32>,
    pub tail: Option<u32>,
    pub total_qty: u64,
}

pub struct Book {
    pub base_tick: Price,
    pub bid_ladder: Vec<Level>,        // index = price - base_tick
    pub ask_ladder: Vec<Level>,
    pub orders: Vec<Option<Order>>,    // arena, indexed by u32
    pub by_id: HashMap<OrderId, u32>,  // id -> arena index (FxHashMap in the hot path)
    pub free: Vec<u32>,
}
```

Three decisions that make it fast:

1. **A ladder, not a tree.** Price levels live in a flat `Vec` indexed by tick
   offset. An update is one array index and two stores.
2. **An arena, not `Box<Order>`.** Orders are slots in a `Vec`; the level queue links
   them by index. No allocation, no pointer chasing beyond one indirection.
3. **Integer prices.** `f64` equality is a bug waiting for the first tick that does
   not round-trip.

## Matching

```rust
impl Book {
    /// Returns trades as (maker_id, taker_id, price, qty).
    pub fn submit(&mut self, order: Order, out: &mut Vec<Trade>) {
        match order.side {
            Side::Buy => self.match_buy(order, out),
            Side::Sell => self.match_sell(order, out),
        }
    }

    fn match_buy(&mut self, mut taker: Order, out: &mut Vec<Trade>) {
        // walk the ask ladder from the best ask upward
        while taker.qty > 0 {
            let Some(best) = self.best_ask_index() else { break };
            let ask_price = self.base_tick + best as Price;
            if ask_price > taker.price { break; }          // no cross, rest the order

            let level = &mut self.ask_ladder[best];
            while taker.qty > 0 {
                let Some(head) = level.head else { break };
                let maker = &mut self.orders[head as usize].expect("live order");
                let fill = taker.qty.min(maker.qty);

                maker.qty -= fill;
                taker.qty -= fill;
                level.total_qty -= fill;
                out.push(Trade { maker: maker.id, taker: taker.id, price: ask_price, qty: fill });

                if maker.qty == 0 {
                    self.unlink(best, Side::Sell, head);       // pop the FIFO head
                }
            }
        }

        if taker.qty > 0 {
            self.rest(taker);                                  // remainder joins the book
        }
    }

    fn best_ask_index(&self) -> Option<usize> {
        self.ask_ladder.iter().position(|l| l.total_qty > 0)
    }
}
```

> **Gotcha:** `best_ask_index` is a linear scan. That is fine for a shallow book and
> wrong for a deep one — milestone 6 is to maintain a cached best-ask index, updated
> on insert and on level exhaustion.

## Invariants to test

```rust
#[test]
fn book_never_crosses() {
    let mut book = Book::new(0, 4096);
    let mut trades = Vec::new();
    // ... feed a tape
    let best_bid = book.best_bid();
    let best_ask = book.best_ask();
    if let (Some(b), Some(a)) = (best_bid, best_ask) {
        assert!(b < a, "book crossed: bid {b} >= ask {a}");
    }
}

#[test]
fn total_qty_matches_sum_of_orders() {
    // for every level: level.total_qty == sum(order.qty) over its queue
}
```

These two catch the majority of matching-engine bugs. Add a third: every trade has a
maker on the opposite side and a price equal to the maker's resting price.

## No allocation on the hot path

```rust
// a counting allocator: the test fails if the hot loop allocates
struct Counting;
static ALLOCS: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

unsafe impl std::alloc::GlobalAlloc for Counting {
    unsafe fn alloc(&self, l: std::alloc::Layout) -> *mut u8 {
        ALLOCS.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        unsafe { std::alloc::System.alloc(l) }
    }
    unsafe fn dealloc(&self, p: *mut u8, l: std::alloc::Layout) {
        unsafe { std::alloc::System.dealloc(p, l) }
    }
}
#[global_allocator]
static A: Counting = Counting;

#[test]
fn hot_path_does_not_allocate() {
    let mut book = Book::new(0, 4096);
    let mut trades = Vec::with_capacity(1024);
    book.submit(Order::limit(1, Side::Sell, 100, 10), &mut trades);

    let before = ALLOCS.load(std::sync::atomic::Ordering::Relaxed);
    for id in 2..10_000 {
        book.submit(Order::limit(id, Side::Buy, 99, 1), &mut trades);
        trades.clear();
    }
    let after = ALLOCS.load(std::sync::atomic::Ordering::Relaxed);
    assert_eq!(after, before, "hot path allocated");
}
```

This test is worth more than any benchmark: it fails the moment someone adds a
`format!` or a `to_string()`.

## Determinism

```bash
$ cargo run --release -- replay tape.bin > out1.txt
$ cargo run --release -- replay tape.bin > out2.txt
$ diff out1.txt out2.txt && echo deterministic
```

Determinism means: no `HashMap` iteration order in the output, no wall-clock
timestamps, no floating point accumulation. Sort or use a `BTreeMap` wherever order
reaches the output.

## Benchmarking honestly

```rust
use criterion::{black_box, criterion_group, criterion_main, Criterion};

fn bench(c: &mut Criterion) {
    let mut book = Book::new(0, 4096);
    let mut trades = Vec::with_capacity(64);
    let mut id = 0u64;

    c.bench_function("add_order", |b| {
        b.iter(|| {
            id += 1;
            book.submit(black_box(Order::limit(id, Side::Buy, 50, 1)), &mut trades);
            trades.clear();
        })
    });
}
```

Then pin the core and check percentiles, not the mean:

```bash
$ taskset -c 3 cargo bench
$ perf stat -e cycles,instructions,cache-misses ./target/release/matchbox replay tape.bin
```

## Stretch goals

- Market orders and IOC/FOK time-in-force.
- Iceberg orders (displayed vs hidden quantity).
- Self-trade prevention.
- A SPSC market-data publisher (module 08.04).
- A simple strategy on top: market-making with inventory limits.
- Compare against a `BTreeMap` implementation and report both.

## Demo checklist

- [ ] a hand-checked example with 10 orders produces the expected trades
- [ ] FIFO priority verified at one price level
- [ ] the no-allocation test passes
- [ ] under 50 ns per add/cancel, with a histogram
- [ ] replay is byte-identical twice

**Next:** [desktop-notes](08-desktop-app.md)
