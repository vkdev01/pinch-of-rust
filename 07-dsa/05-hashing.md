# 05 · Hashing and maps

`HashMap` is the workhorse. Knowing what is inside it turns guesswork into
decisions.

## What Rust's `HashMap` actually is

A SwissTable: open addressing with SIMD group probing. Keys live in one array with
a 1-byte control block per slot (empty / deleted / 7-bit hash tag). A probe scans
16 control bytes at once with SSE2, which is why it beats chaining under load.

Consequences you can use:

- Load factor stays under 87.5% before a resize — you rarely see long probe runs.
- Deletion is a tombstone, not a chain fix-up.
- Iteration order is randomised per process (HashDoS protection). Do not depend on it.

## The default hasher is slow on purpose

`SipHash-1-3` resists hash-flooding attacks. For trusted, internal keys it is
pure overhead.

```toml
ahash = "0.8"
```

```rust
use ahash::AHashMap;

let mut m: AHashMap<u64, String> = AHashMap::new();
m.insert(7, "seven".into());
```

| Hasher | Speed | Safe against adversarial keys |
| --- | --- | --- |
| `RandomState` (default) | baseline | yes |
| `ahash` | ~2–3× faster | no |
| `rustc-hash` (FxHash) | ~3× faster | no |
| `fnv` | fast for small keys | no |

> **Rule of thumb:** default hasher for anything keyed by user input; `ahash` for
> internal ids, counters and compile-time maps.

## The entry API is not sugar

```rust
use std::collections::HashMap;

let mut counts: HashMap<&str, u32> = HashMap::new();

// two lookups
if let Some(v) = counts.get_mut("a") { *v += 1; } else { counts.insert("a", 1); }

// one lookup
*counts.entry("a").or_insert(0) += 1;

// lazily build expensive defaults
counts.entry("b").or_insert_with(|| compute_default());

// take ownership of an existing value
let v = counts.remove("a");
```

In a hot loop, halving the probes is a measurable win.

## Bloom filter: the 40-line version

```rust
/// False positives possible, false negatives impossible.
pub struct Bloom {
    bits: Vec<u64>,
    hashes: u32,
}

impl Bloom {
    pub fn with_capacity(n: usize, hashes: u32) -> Self {
        // ~10 bits per element for a 1% false-positive rate
        Self { bits: vec![0; (n * 10).div_ceil(64)], hashes }
    }

    fn probes(&self, key: &[u8]) -> impl Iterator<Item = usize> + '_ {
        let mut h = 0xcbf29ce484222325u64;              // FNV-1a
        for b in key { h ^= *b as u64; h = h.wrapping_mul(0x100000001b3); }
        (0..self.hashes).map(move |i| {
            let mixed = h.wrapping_mul(0x9E3779B97F4A7C15).wrapping_add(i as u64);
            (mixed as usize) % (self.bits.len() * 64)
        })
    }

    pub fn insert(&mut self, key: &[u8]) {
        for p in self.probes(key).collect::<Vec<_>>() {
            self.bits[p / 64] |= 1 << (p % 64);
        }
    }

    pub fn maybe_contains(&self, key: &[u8]) -> bool {
        self.probes(key).all(|p| self.bits[p / 64] & (1 << (p % 64)) != 0)
    }
}
```

A bloom filter in front of an SSTable or a database lookup removes ~99% of
pointless disk reads. This is the same structure inside RocksDB, Cassandra and
Chrome's safe-browsing.

## Consistent hashing: sharding without a reshuffle

Adding a node to `hash % n` remaps almost every key. Consistent hashing remaps
only the keys of the added node.

```rust
/// A tiny consistent-hash ring: each node appears at many virtual positions.
pub struct Ring {
    points: Vec<(u64, usize)>,   // (hash, node index), sorted
}

impl Ring {
    pub fn new(nodes: usize, vnodes: usize) -> Self {
        let mut points = Vec::with_capacity(nodes * vnodes);
        for n in 0..nodes {
            for v in 0..vnodes {
                let mut h = std::collections::hash_map::DefaultHasher::new();
                use std::hash::{Hash, Hasher};
                (n, v).hash(&mut h);
                points.push((h.finish(), n));
            }
        }
        points.sort_unstable();
        Self { points }
    }

    pub fn node_for(&self, key: &str) -> usize {
        use std::hash::{Hash, Hasher};
        let mut h = std::collections::hash_map::DefaultHasher::new();
        key.hash(&mut h);
        let target = h.finish();
        match self.points.binary_search_by_key(&target, |(p, _)| *p) {
            Ok(i) => self.points[i].1,
            Err(i) => self.points[i % self.points.len()].1,
        }
    }
}
```

`binary_search` on a sorted `Vec` is the whole data structure. This is how caches,
sharded queues and distributed locks pick a node.

## Deterministic iteration for tests

```rust
use std::collections::BTreeMap;

let mut m: BTreeMap<&str, u32> = BTreeMap::new();   // sorted by key
// or: collect into a Vec and sort before asserting
```

A test that prints a `HashMap` is flaky by construction. Use `BTreeMap` when order
matters to output.

## Exercises

1. Implement the bloom filter and measure its false-positive rate at 1M inserts.
2. Benchmark `HashMap` vs `AHashMap` on 1M `u64` keys.
3. Build the consistent-hash ring and verify that adding one node moves ~1/n of keys.

**Next:** [Trees and ordered maps](06-trees.md)
