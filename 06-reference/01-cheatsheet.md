# 01 · Cheat Sheet

Everything you need while writing code, on one page.

## Cargo

```bash
cargo new myapp            # binary
cargo new --lib mylib      # library
cargo check                # fast type check
cargo run -- --flag        # args after --
cargo test -- --nocapture
cargo build --release
cargo add serde --features derive
cargo tree -d              # duplicate deps
cargo fmt && cargo clippy -- -D warnings
cargo doc --no-deps --open
cargo expand               # macro output (needs cargo-expand)
cargo bench
```

## Types

```rust
i8 i16 i32 i64 i128 isize     // signed
u8 u16 u32 u64 u128 usize     // unsigned
f32 f64 bool char
String  &str   // owned / borrowed
[T; N]  Vec<T> // array / vector
(T, U)         // tuple
Option<T>      // Some / None
Result<T, E>   // Ok / Err
Box<T> Rc<T> Arc<T> RefCell<T> Cell<T> Mutex<T> RwLock<T>
HashMap<K,V> BTreeMap<K,V> HashSet<T> BTreeSet<T> VecDeque<T>
```

## Conversions

```rust
let s = String::from("x");
let s: String = "x".to_string();
let s: String = "x".into();
let b: &str = &s;                 // deref coercion
let n: i64 = i32_val as i64;      // widening cast
let n: u8 = u8::try_from(300)?;   // fallible narrowing
let v: Vec<char> = s.chars().collect();
let s: String = v.iter().collect();
let n: i32 = "42".parse()?;
"42".parse::<i32>()?;             // turbofish
```

## Strings

```rust
s.len()                  // BYTES, not chars
s.chars().count()        // characters
s.trim()
s.to_lowercase() / to_uppercase()
s.split(',') / split_whitespace() / split_once('=')
s.starts_with("a") / ends_with("z") / contains("x")
s.replace("a", "b")
s.push_str("x") / push('c')
format!("{a} {b}")
s.get(0..3)              // Option<&str>, safe slicing
```

## Collections

```rust
v.push(x); v.pop(); v.len(); v.is_empty();
v.get(i)                 // Option<&T>
v.iter() / iter_mut() / into_iter()
v.sort(); v.sort_by_key(|x| x.0); v.dedup(); v.retain(|x| *x > 0)
m.insert(k, v); m.get(&k); m.entry(k).or_insert(0); m.remove(&k)
m.contains_key(&k)
set.insert(x); set.contains(&x)
```

## Iterators

```rust
map filter filter_map flat_map
take skip take_while skip_while
enumerate zip chain rev peekable step_by
collect fold reduce sum product count
any all find position min max min_by_key max_by_key
```

## Ownership cheat lines

```rust
let a = b;               // move (or copy if Copy)
let a = b.clone();       // deep copy
let r = &x;              // shared borrow (many allowed)
let r = &mut x;          // exclusive borrow (one at a time)
fn f(s: &str)            // borrow in
fn f() -> String         // own out
```

## Error handling

```rust
fn f() -> Result<T, E> { ... }
let x = may_fail()?;
let x = opt?;                       // Option propagation
let Some(x) = opt else { return };
unwrap_or(default)
unwrap_or_else(|| default)
ok_or(err)?  /  ok_or_else(|| err)?
map_err(|e| MyError::from(e))?
```

## Common traits to derive

```rust
#[derive(Debug, Clone, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
```

## Pattern matching

```rust
match x {
    0 => {},
    1 | 2 => {},
    3..=9 => {},
    Some(v) if v > 0 => {},
    Point { x: 0, y } => {},
    [first, .., last] => {},
    _ => {},
}

if let Some(v) = o {}
while let Some(v) = it.next() {}
let Some(v) = o else { return };
matches!(x, Some(1..=9))
```

## Generics and traits

```rust
fn f<T: Display + Clone>(x: T) {}
fn f(x: impl Display) {}
fn f() -> impl Iterator<Item = u32> {}
fn f(x: &dyn Display) {}

impl Display for MyType {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result { write!(f, "…") }
}

trait T { type Item; fn get(&self) -> Self::Item; }
```

## Lifetimes

```rust
fn f<'a>(x: &'a str) -> &'a str { x }
struct S<'a> { s: &'a str }
impl<'a> S<'a> {}
fn f(x: &str) -> &str       // elided: one input lifetime
fn f(&self) -> &str         // elided: tied to self
'static                     // valid for the whole program
```

## Async

```rust
#[tokio::main]
async fn main() { }

let v = fut.await;
let (a, b) = tokio::join!(fa(), fb());
let (a, b) = tokio::try_join!(fa(), fb())?;
tokio::spawn(async move { });
tokio::time::timeout(dur, fut).await??;
tokio::select! { x = fa() => x, y = fb() => y }
tokio::task::spawn_blocking(|| cpu_work()).await
```

## Concurrency

```rust
thread::spawn(move || {});
thread::scope(|s| { s.spawn(|| {}); });
Arc::new(Mutex::new(v));
Arc::clone(&a);
m.lock().unwrap();
AtomicUsize::new(0).fetch_add(1, Ordering::Relaxed);
rayon: v.par_iter().map(f).collect()
```

## Modules

```rust
mod foo;                 // src/foo.rs
pub mod bar;
pub(crate) fn internal();
use crate::foo::Bar;
pub use foo::Bar;        // re-export
```

## Macros

```rust
macro_rules! m {
    ($x:expr) => { $x * 2 };
    ($($e:expr),+ $(,)?) => { vec![$($e),+] };
}
```

## Formatting

```rust
println!("{x}");            // Display
println!("{x:?}");          // Debug
println!("{x:#?}");         // pretty Debug
println!("{x:>8}");         // right align, width 8
println!("{x:<8}");         // left align
println!("{x:08.2}");       // zero-pad, 2 decimals
println!("{x:x}");          // hex
println!("{x:b}");          // binary
println!("{x:e}");          // scientific
println!("{n} {m}");        // inline captured identifiers
```

## Testing

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn works() { assert_eq!(1 + 1, 2); }

    #[test]
    #[should_panic(expected = "boom")]
    fn panics() { panic!("boom"); }

    #[tokio::test]
    async fn async_works() { }
}
```

```bash
cargo test --lib
cargo test --test integration_name
cargo test --doc
cargo test name_filter -- --nocapture
```

## CLI

```rust
#[derive(clap::Parser)]
struct Cli {
    #[arg(short, long)] verbose: bool,
    #[arg(long, env = "TOKEN")] token: Option<String>,
    #[command(subcommand)] cmd: Cmd,
}
let cli = Cli::parse();
```

## Exit codes

```rust
std::process::ExitCode::SUCCESS
std::process::ExitCode::FAILURE
std::process::ExitCode::from(2)
```

## Gotchas, in one list

| Trap | Fix |
| --- | --- |
| Trailing `;` on the last expression | remove it — that's the return value |
| `s[0]` on a `String` | `s.chars().nth(0)` or `&s[0..1]` if ASCII |
| Integer overflow only in debug | `checked_*` / `saturating_*` |
| `&Vec<T>` in a signature | use `&[T]` |
| `clone()` everywhere | ask who should own it |
| `HashMap` order changes between runs | use `BTreeMap` or sort |
| `unwrap()` in a handler | map to a proper error |
| `std::thread::sleep` in async | `tokio::time::sleep` |
| Holding a `MutexGuard` across `.await` | scope the guard |
| `:id` in an Axum 0.8 route | `{id}` |
| `@heroui/styles` before Tailwind | import it after |
| `#[derive(Clone)]` on a big struct | `Arc` it instead |
