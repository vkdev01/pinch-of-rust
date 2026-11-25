# 02 · Arrays, slices and the cache

Rust's default container is a contiguous `Vec`. That is not an accident: contiguous
memory is what makes modern CPUs fast.

## A cache line is 64 bytes

```text
fetch 1 byte -> 64 bytes arrive from RAM (~100 cycles if it misses)
```

So a sequential scan of `Vec<u32>` costs ~1 miss per 16 elements. A pointer chase
through a linked list costs a miss per element. That is a 16× difference before any
algorithm is involved.

[[fig:memory-latency]]

## Slice: the universal view

```rust
fn sum(xs: &[u64]) -> u64 { xs.iter().sum() }

let v = vec![1u64, 2, 3];
let arr = [4u64, 5, 6];
assert_eq!(sum(&v), 6);
assert_eq!(sum(&arr), 15);          // array coerces to a slice
```

Take `&[T]`, never `&Vec<T>`. It accepts vectors, arrays and sub-slices, and it
documents that you do not care how the data is stored.

## Array of structs vs struct of arrays

```rust
// AoS — good when you touch every field of one entity
struct Particle { x: f32, y: f32, vx: f32, vy: f32 }
let particles: Vec<Particle> = vec![];

// SoA — good when you touch one field of every entity
struct Particles { x: Vec<f32>, y: Vec<f32>, vx: Vec<f32>, vy: Vec<f32> }
```

```rust
// AoS: 16 bytes per particle, 4 used per step -> 75% wasted bandwidth
for p in &mut particles { p.x += p.vx; }

// SoA: 4 bytes per particle, fully used, and the loop vectorises
for (x, vx) in ps.x.iter_mut().zip(&ps.vx) { *x += *vx; }
```

The SoA version is typically 2–4× faster on large N because the compiler can emit
SIMD and every byte fetched is used.

## Flattening a nested Vec

```rust
// cache-hostile: one allocation and one indirection per row
let grid: Vec<Vec<u32>> = (0..1000).map(|_| vec![0; 1000]).collect();
let cell = grid[y][x];              // two loads

// cache-friendly: one allocation, index arithmetic
struct Grid { w: usize, data: Vec<u32> }
impl Grid {
    fn get(&self, x: usize, y: usize) -> u32 { self.data[y * self.w + x] }
    fn set(&mut self, x: usize, y: usize, v: u32) { self.data[y * self.w + x] = v; }
}
```

`Grid` is smaller, faster, and trivially serialisable. Reach for it whenever a
2-D structure is really a rectangle of numbers.

## Bounds checks are cheap, but not free

```rust
// bounds check per iteration
let mut total = 0u64;
for i in 0..v.len() { total += v[i]; }

// no bounds check — the iterator proves the range
let total: u64 = v.iter().sum();
```

The compiler elides the check in the iterator form. If you must index and have
proven the range, `get_unchecked` in an `unsafe` block removes it — measure first;
modern branch predictors often make it a wash.

## Fixed-size arrays on the stack

```rust
let mut buf = [0u8; 4096];          // no allocation, no bounds-check elision issues
let n = read_into(&mut buf)?;
process(&buf[..n]);
```

For a hot path, a stack buffer beats a `Vec` because there is no allocator call and
the size is known at compile time. `SmallVec<[T; 8]>` gives you the same win while
still allowing growth.

## Slices of slices without copying

```rust
let data = vec![1, 2, 3, 4, 5, 6];
let (a, b) = data.split_at(3);
let chunks: Vec<&[i32]> = data.chunks(2).collect();   // [[1,2],[3,4],[5,6]]
let pairs = data.windows(2);                          // [[1,2],[2,3],...]
```

`chunks` is how you parallelise: hand each thread a disjoint `&mut [T]` from
`chunks_mut`, and the borrow checker guarantees no overlap.

## The bit-level trick worth knowing

```rust
// a bitset is 32x smaller than Vec<bool> and ~10x faster to scan
struct BitSet(Vec<u64>);

impl BitSet {
    fn new(n: usize) -> Self { BitSet(vec![0; n.div_ceil(64)]) }
    fn set(&mut self, i: usize) { self.0[i / 64] |= 1 << (i % 64); }
    fn get(&self, i: usize) -> bool { self.0[i / 64] & (1 << (i % 64)) != 0 }
    fn count(&self) -> u32 { self.0.iter().map(|w| w.count_ones()).sum() }
}
```

`count_ones` compiles to a single `popcnt` instruction. Any "which of these 10,000
things have I seen" problem is a bitset.

## Exercises

1. Convert an AoS `Vec<Particle>` to SoA and benchmark a physics step at 1M particles.
2. Replace `Vec<Vec<u32>>` with a flat `Grid` and measure with `perf stat`.
3. Implement a `BitSet` and use it for a sieve of Eratosthenes up to 10^8. Time it
   against `Vec<bool>`.

**Next:** [Linked structures, and why you rarely want them](03-linked-structures.md)
