# 06 · Collections and Iterators

Rust's iterator chain is not a convenience — it is the idiomatic way to write
loops, and it compiles to the same machine code as a hand-written `for` with
bounds checks removed.

## The standard collections

| Type | Use for | Lookup | Order |
| --- | --- | --- | --- |
| `Vec<T>` | a growable list | O(1) index | insertion |
| `VecDeque<T>` | push/pop both ends | O(1) ends | insertion |
| `HashMap<K, V>` | key → value, unordered | O(1) avg | none |
| `BTreeMap<K, V>` | key → value, sorted | O(log n) | sorted by key |
| `HashSet<T>` / `BTreeSet<T>` | membership | O(1) / O(log n) | none / sorted |
| `String` | UTF-8 text | — | — |
| `BinaryHeap<T>` | priority queue | O(log n) push/pop | max-heap |

**Default choice:** `Vec` for sequences, `HashMap` for maps. Switch to `BTreeMap`
when you need ordered iteration or a deterministic output (tests, serialisation,
reports).

## `Vec<T>`

```rust
let mut v: Vec<i32> = Vec::new();
v.push(1);
v.push(2);
v.extend([3, 4]);
v.insert(0, 0);                  // O(n) — shifts

let first = v[0];                // panics if empty
let safe = v.get(99);            // Option<&i32>
let last = v.last();

let popped = v.pop();            // Option<i32>
let removed = v.remove(1);       // O(n) — shifts
let swapped = v.swap_remove(1);  // O(1), changes order

v.sort();                        // needs Ord
v.sort_by(|a, b| b.cmp(a));      // descending
v.dedup();                       // removes consecutive duplicates only

v.retain(|&x| x % 2 == 0);
let doubled: Vec<i32> = v.iter().map(|x| x * 2).collect();
```

```rust
// capacity matters for hot loops
let mut out = Vec::with_capacity(10_000);
for i in 0..10_000 { out.push(i); }   // no reallocation
```

### Slices

```rust
fn sum(xs: &[i32]) -> i32 { xs.iter().sum() }   // accepts &Vec<i32> and &[i32]

let v = vec![1, 2, 3, 4];
let s: &[i32] = &v[1..3];       // [2, 3] — a view, no copy
let (a, b) = v.split_at(2);
let chunks = v.chunks(2);       // [[1,2],[3,4]]
let windows = v.windows(2);     // [[1,2],[2,3],[3,4]]
```

> **Rule of thumb:** take `&[T]` in function parameters, never `&Vec<T>`. The
> slice accepts both and does not tie you to a `Vec`.

## `HashMap`

```rust
use std::collections::HashMap;

let mut m: HashMap<String, u32> = HashMap::new();
m.insert("a".into(), 1);

// entry API — one lookup instead of two
*m.entry("a".into()).or_insert(0) += 1;
m.entry("b".into()).or_insert_with(|| compute_default());
m.entry("c".into()).or_default();

if let Some(v) = m.get("a") { println!("{v}"); }
let v = m.get("zz").copied().unwrap_or(0);

for (k, v) in &m { println!("{k} = {v}"); }
let keys: Vec<&String> = m.keys().collect();

m.remove("a");
```

Keys need `Eq + Hash`. `f64` does not work — use an integer, a string, or a
newtype with a manual `Hash` impl over the bit pattern.

### `HashMap` with a non-string key

```rust
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct UserKey { tenant: u32, id: u64 }

let mut m = HashMap::new();
m.insert(UserKey { tenant: 1, id: 7 }, "alice");
```

### Deterministic iteration

`HashMap` iteration order is randomised per process (HashDoS protection). Tests
that print a map are flaky. Use `BTreeMap`, or collect and sort:

```rust
let mut entries: Vec<_> = m.iter().collect();
entries.sort_by_key(|(k, _)| *k);
```

## `BTreeMap` and `BTreeSet`

```rust
use std::collections::BTreeMap;

let mut scores: BTreeMap<&str, u32> = BTreeMap::new();
scores.insert("zoe", 90);
scores.insert("adam", 85);

for (name, score) in &scores { println!("{name}: {score}"); }  // adam, zoe

// range queries — the reason to pick BTreeMap
for (name, score) in scores.range("a".."m") { }
```

## `VecDeque` and `BinaryHeap`

```rust
use std::collections::{VecDeque, BinaryHeap};

let mut q: VecDeque<i32> = VecDeque::new();
q.push_back(1);
q.push_front(0);          // O(1), unlike Vec

let mut heap = BinaryHeap::new();
heap.push(3); heap.push(9); heap.push(1);
assert_eq!(heap.pop(), Some(9));   // max-heap

// min-heap: Reverse
use std::cmp::Reverse;
let mut min_heap = BinaryHeap::new();
min_heap.push(Reverse(9));
min_heap.push(Reverse(1));
assert_eq!(min_heap.pop(), Some(Reverse(1)));
```

## Iterators

An iterator is anything with `next()`. The `Iterator` trait has ~70 provided
methods, all built on `next`.

```rust
let v = vec![1, 2, 3, 4, 5, 6];

let evens_squared: Vec<i32> = v.iter()
    .filter(|&&x| x % 2 == 0)
    .map(|&x| x * x)
    .collect();

let total: i32 = v.iter().sum();
let count = v.iter().filter(|&&x| x > 3).count();
let any_big = v.iter().any(|&x| x > 5);
let all_pos = v.iter().all(|&x| x > 0);
let max = v.iter().max();
let product: i32 = v.iter().product();
```

### The three iteration forms

```rust
for x in &v { }        // &T — borrows
for x in &mut v { }    // &mut T — mutates in place
for x in v { }         // T — consumes the Vec
```

```rust
let mut v = vec![1, 2, 3];
for x in &mut v { *x *= 2; }        // v is now [2, 4, 6]
```

### Lazy by default

Iterator adapters do nothing until something consumes them:

```rust
let it = v.iter().map(|x| { println!("computing"); x });
// nothing printed yet

let n = it.count();   // NOW it runs
```

This is why chaining is free: `map().filter().take(10)` on a million elements
only touches as many as `take` needs.

### The adapters you will actually use

| Adapter | Effect |
| --- | --- |
| `map` | transform each item |
| `filter` | keep items matching a predicate |
| `filter_map` | transform + drop `None` in one step |
| `flat_map` | transform to an iterator, flatten |
| `take(n)` / `skip(n)` | limit |
| `take_while` / `skip_while` | limit by predicate |
| `enumerate` | `(index, item)` |
| `zip` | pair two iterators |
| `chain` | concatenate |
| `rev` | reverse (needs `DoubleEndedIterator`) |
| `peekable` | look ahead without consuming |
| `step_by(n)` | every nth |
| `scan` | stateful map |
| `inspect` | side effect without changing items |
| `collect` | build a collection |
| `fold` / `reduce` | accumulate |
| `sum` / `product` / `count` | aggregate |
| `any` / `all` / `find` / `position` | search |
| `min_by_key` / `max_by_key` | extremes |
| `sort_by_key` (on Vec) | order |
| `group_by` (itertools) | group runs |

### `collect` into anything

```rust
let v: Vec<i32> = (1..4).collect();
let set: HashSet<i32> = (1..4).collect();
let s: String = ['a', 'b'].iter().collect();
let m: HashMap<_, _> = vec![(1, "a"), (2, "b")].into_iter().collect();

// collect Results: all-or-nothing
let parsed: Result<Vec<i32>, _> = ["1", "2", "3"].iter().map(|s| s.parse::<i32>()).collect();

// collect Options: same idea
let all: Option<Vec<i32>> = vec![Some(1), Some(2)].into_iter().collect();

// partition
let (even, odd): (Vec<i32>, Vec<i32>) = (0..10).partition(|n| n % 2 == 0);
```

The `Result<Vec<_>, _>` collect is a workhorse: it stops at the first error and
returns it, which is exactly the semantics you want when parsing a list of rows.

### `fold` and `reduce`

```rust
let sum = (1..=5).fold(0, |acc, x| acc + x);          // 15
let max = (1..=5).reduce(|a, b| a.max(b));            // Some(5)
let counts = ["a", "b", "a"].iter()
    .fold(HashMap::new(), |mut m, w| { *m.entry(*w).or_insert(0) += 1; m });
```

### Custom iterators

Implement `Iterator` and you get all 70 methods free.

```rust
struct Fibonacci { a: u64, b: u64 }

impl Iterator for Fibonacci {
    type Item = u64;
    fn next(&mut self) -> Option<u64> {
        let out = self.a;
        let next = self.a + self.b;
        self.a = self.b;
        self.b = next;
        Some(out)
    }
}

fn fibs() -> Fibonacci { Fibonacci { a: 0, b: 1 } }

let first_ten: Vec<u64> = fibs().take(10).collect();
// [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]
```

### Streaming files without loading them

```rust
use std::fs::File;
use std::io::{self, BufRead, BufReader};

fn count_lines(path: &str) -> io::Result<usize> {
    let f = File::open(path)?;
    let reader = BufReader::new(f);            // buffered — essential
    let mut n = 0;
    for line in reader.lines() {
        let _line = line?;
        n += 1;
    }
    Ok(n)
}
```

`BufReader` batches syscalls. Reading a file with unbuffered `read_line` is
10–100× slower. For maximum throughput on large files, `memchr`-based crates or
`bstr` are worth reaching for.

## Performance notes that matter

```rust
// BAD: index in a loop — bounds check every iteration
for i in 0..v.len() { total += v[i]; }

// GOOD: iterator — the bounds check is proven unnecessary and elided
for x in &v { total += x; }
```

```rust
// BAD: collecting between stages
let a: Vec<_> = v.iter().map(f).collect();
let b: Vec<_> = a.iter().filter(g).collect();

// GOOD: one chain, zero intermediates
let b: Vec<_> = v.iter().map(f).filter(g).collect();
```

```rust
// BAD: format! in a hot loop allocates every time
for i in 0..1_000 { let s = format!("{i}"); }

// GOOD: reuse the buffer
use std::fmt::Write;
let mut buf = String::with_capacity(64);
for i in 0..1_000 {
    buf.clear();
    write!(buf, "{i}").unwrap();
}
```

## A worked example: log analysis

```rust
use std::collections::HashMap;

#[derive(Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
enum Level { Debug, Info, Warn, Error }

impl Level {
    fn parse(s: &str) -> Option<Level> {
        Some(match s {
            "DEBUG" => Level::Debug,
            "INFO" => Level::Info,
            "WARN" => Level::Warn,
            "ERROR" => Level::Error,
            _ => return None,
        })
    }
}

#[derive(Debug, Default)]
struct Report {
    by_level: HashMap<Level, usize>,
    top_paths: Vec<(String, usize)>,
}

fn analyse(log: &str) -> Report {
    let mut by_level: HashMap<Level, usize> = HashMap::new();
    let mut by_path: HashMap<String, usize> = HashMap::new();

    for line in log.lines() {
        let mut parts = line.split_whitespace();
        let (Some(level), Some(path)) = (
            parts.next().and_then(Level::parse),
            parts.next(),
        ) else { continue };

        *by_level.entry(level).or_insert(0) += 1;
        *by_path.entry(path.to_string()).or_insert(0) += 1;
    }

    let mut top_paths: Vec<(String, usize)> = by_path.into_iter().collect();
    top_paths.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    top_paths.truncate(5);

    Report { by_level, top_paths }
}

fn main() {
    let log = "INFO /health\nERROR /api/users\nWARN /api/orders\nERROR /api/users";
    let r = analyse(log);
    assert_eq!(r.by_level[&Level::Error], 2);
    assert_eq!(r.top_paths[0], ("/api/users".to_string(), 2));
    println!("{r:#?}");
}
```

---

## Exercises

1. Given `Vec<(String, u32)>` of `(name, score)`, produce the top 3 by score
   using one iterator chain and `collect`.
2. Write `fn group_by_first_letter(words: &[&str]) -> BTreeMap<char, Vec<&str>>`.
3. Implement `Iterator` for a struct that yields every other element of a slice.
4. Convert a `Vec<String>` of numbers to `Result<Vec<i64>, ParseIntError>` with
   one `collect` call.
5. Count word frequencies in a 10 MB file with `BufReader` and compare timing
   against `fs::read_to_string`. Explain the difference.
6. Replace this with a single chain: build a `HashMap<&str, usize>` of counts,
   then filter to counts > 1, then collect keys into a sorted `Vec`.

**Next:** [Error handling](07-error-handling.md)
