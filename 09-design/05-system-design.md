# 05 · System design, in Rust

Four designs that come up in interviews and in production. Each is described by the
decisions that matter, not the boxes on a diagram.

## Case 1: a rate limiter

**Requirements:** 100 req/s per API key, shared across N replicas, sub-millisecond.

**Decision 1 — algorithm.** Token bucket allows bursts; fixed window has boundary
spikes (200 in 2 ms across a window edge). Use a token bucket.

**Decision 2 — where the state lives.** In-process is fast but wrong with N replicas.
Redis is correct but adds ~200 µs. Hybrid: local bucket sized at `limit/N`, Redis only
for the global correction.

```rust
use std::time::{Duration, Instant};

/// Per-key token bucket, in-process. Clone-free, allocation-free on the hot path.
pub struct Bucket { tokens: f64, last: Instant, rate: f64, burst: f64 }

impl Bucket {
    pub fn new(rate: f64, burst: f64) -> Self {
        Self { tokens: burst, last: Instant::now(), rate, burst }
    }

    pub fn try_acquire(&mut self, now: Instant, cost: f64) -> bool {
        let elapsed = now.saturating_duration_since(self.last).as_secs_f64();
        self.tokens = (self.tokens + elapsed * self.rate).min(self.burst);
        self.last = now;
        if self.tokens >= cost { self.tokens -= cost; true } else { false }
    }
}
```

**Decision 3 — the failure mode.** If Redis is down, fail open (allow) or closed
(deny)? For an internal service, open. For an auth endpoint, closed.

**Decision 4 — the key.** Per API key, not per IP: NAT puts thousands of users behind
one address, and attackers rotate IPs for free.

## Case 2: a job queue

**Requirements:** durable, at-least-once, retries with backoff, no lost work on crash.

Already built in [module 04.04](../04-real-world/04-background-jobs.md). The design
decisions worth stating in an interview:

| Decision | Choice | Why |
| --- | --- | --- |
| storage | Postgres table | transactional enqueue with the business write |
| claim | `FOR UPDATE SKIP LOCKED` | N workers, no coordination |
| delivery | at-least-once | exactly-once is a fiction; make handlers idempotent |
| retries | exponential + jitter | avoid a thundering herd on recovery |
| stuck jobs | reaper on `locked_at` | a dead worker must not strand a row |
| ordering | per-key, not global | global ordering kills throughput |

## Case 3: a news feed

**Requirements:** 10M users, follow graph, read latency < 100 ms.

**Decision — fan-out on write vs read.**

| | Fan-out on write | Fan-out on read |
| --- | --- | --- |
| write cost | O(followers) | O(1) |
| read cost | O(1) | O(following) |
| celebrity problem | 50M writes per post | fine |

The real answer is hybrid: fan-out on write for normal accounts, pull at read time for
accounts with > 10k followers.

```rust
/// Merge K sorted timelines — a heap, not a sort.
use std::cmp::Reverse;
use std::collections::BinaryHeap;

pub fn merge_feeds(feeds: &[Vec<(u64, u64)>], limit: usize) -> Vec<(u64, u64)> {
    // (timestamp, source index, position)
    let mut heap = BinaryHeap::new();
    for (src, feed) in feeds.iter().enumerate() {
        if let Some((ts, _)) = feed.first() {
            heap.push(Reverse((*ts, src, 0usize)));
        }
    }
    let mut out = Vec::with_capacity(limit);
    while let Some(Reverse((_, src, pos))) = heap.pop() {
        out.push(feeds[src][pos]);
        if out.len() == limit { break; }
        if pos + 1 < feeds[src].len() {
            let (ts, _) = feeds[src][pos + 1];
            heap.push(Reverse((ts, src, pos + 1)));
        }
    }
    out
}
```

**Caching decision:** the timeline is cacheable per user; the post body is not (edits,
deletes). Cache ids, hydrate content.

## Case 4: a chat server

**Requirements:** 100k concurrent connections per node, fan-out to room members,
presence, message ordering per room.

**Decision 1 — transport.** WebSocket over HTTP/1.1 upgrade, one task per connection.

```rust
use tokio::sync::broadcast;

#[derive(Clone)]
struct Room { tx: broadcast::Sender<String> }

async fn room_task(mut rx: broadcast::Receiver<String>, mut sink: impl tokio::io::AsyncWrite + Unpin) {
    loop {
        match rx.recv().await {
            Ok(msg) => { /* write frame */ let _ = &msg; let _ = &mut sink; }
            Err(broadcast::error::RecvError::Lagged(n)) => {
                // slow consumer: it missed n messages. Drop or resync — never block the room.
                tracing::warn!(missed = n, "client lagged");
            }
            Err(_) => break,
        }
    }
}
```

`broadcast::Receiver` returns `Lagged` instead of blocking — that is the backpressure
decision, made for you.

**Decision 2 — ordering.** Per room, single writer. A global sequence number per room,
assigned at the point of append, is what makes replay and dedupe possible.

**Decision 3 — presence.** Do not store presence in the database on every connect;
that is a write storm. Keep it in memory per node and publish a heartbeat.

## The questions that decide a design

1. **What is the read:write ratio?** It decides caching and fan-out direction.
2. **What breaks first under load?** Name it before you build it.
3. **What is the failure mode when a dependency is down?** Fail open or closed, per
   endpoint.
4. **What is the unit of consistency?** One row, one room, one account.
5. **Where does the id come from?** Sequence (ordered, single writer) vs UUID (no
   coordination, no order).

## How this shows up in Rust specifically

| Design need | Rust answer |
| --- | --- |
| typed invariants | newtypes, enums, smart constructors |
| backpressure | bounded channels |
| cancellation | drop the future |
| parallelism | rayon for CPU, tokio for I/O |
| correctness under concurrency | `Send`/`Sync`, no data races by construction |
| predictable latency | no GC, flat memory |
| auditability | `Result` with typed errors |

## Exercises

1. Implement the token bucket and a per-key `DashMap` of buckets; add the Redis
   correction path.
2. Extend `merge_feeds` to de-duplicate by post id.
3. Design (on paper) the failure behaviour of the chat server when one node dies.

**Next:** [High-frequency trading](../use-cases/07-high-frequency-trading.md)
