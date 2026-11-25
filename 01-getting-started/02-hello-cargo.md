# 02 · Hello, Cargo — Your First Project

`cargo` is the reason Rust projects are pleasant to work in. It is a build
system, dependency manager, test runner, doc generator and release tool, and it
is the only one you need.

## Create a project

```bash
$ cargo new hello
     Created binary (application) `hello` package
$ cd hello
$ tree
.
├── Cargo.toml
└── src
    └── main.rs
```

```toml
# Cargo.toml
[package]
name = "hello"
version = "0.1.0"
edition = "2021"

[dependencies]
```

```rust
// src/main.rs
fn main() {
    println!("Hello, world!");
}
```

```bash
$ cargo run
   Compiling hello v0.1.0 (/home/you/hello)
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.42s
     Running `target/debug/hello`
Hello, world!
```

That compile time is the entire crate. Your first real project will take longer
because it compiles dependencies — once. Incremental builds after that are fast.

## The five commands you will type forever

| Command | What it does | When |
| --- | --- | --- |
| `cargo check` | Type-checks without producing a binary | While writing code — 2–5× faster than `build` |
| `cargo build` | Compiles to `target/debug/` | Before running |
| `cargo run` | `build` then execute | Iterating |
| `cargo test` | Builds and runs tests | Constantly |
| `cargo build --release` | Optimised build to `target/release/` | Shipping, benchmarking |

> **Rule of thumb:** bind `cargo check` to a keyboard shortcut in your editor.
> You will run it hundreds of times a day. It skips code generation and linking,
> which is most of the time on incremental builds.

### Debug vs release

| | `dev` (default) | `release` |
| --- | --- | --- |
| Optimisation | `opt-level = 0` | `opt-level = 3` |
| Debug symbols | yes | no |
| Integer overflow | panics | wraps silently |
| `debug_assert!` | runs | compiled out |
| Speed | 10–100× slower | baseline |

```bash
$ cargo run --release
$ ./target/release/hello
```

> **Gotcha:** integer overflow *panics* in debug and *wraps* in release. A test
> that passes in `cargo test` can behave differently in production. Use
> `checked_add`, `saturating_add` or `wrapping_add` when the boundary matters.

## A real first program

Enough ceremony. Here is something with actual logic: a word-frequency counter,
which touches files, `HashMap`, iterators and error handling.

```rust
use std::collections::HashMap;
use std::env;
use std::fs;
use std::process::ExitCode;

fn main() -> ExitCode {
    let path = match env::args().nth(1) {
        Some(p) => p,
        None => {
            eprintln!("usage: wordcount <FILE>");
            return ExitCode::from(2);
        }
    };

    let text = match fs::read_to_string(&path) {
        Ok(t) => t,
        Err(e) => {
            eprintln!("could not read {path}: {e}");
            return ExitCode::FAILURE;
        }
    };

    let mut counts: HashMap<&str, usize> = HashMap::new();
    for word in text.split_whitespace() {
        let word = word.trim_matches(|c: char| !c.is_alphanumeric());
        if word.is_empty() {
            continue;
        }
        *counts.entry(word).or_insert(0) += 1;
    }

    let mut ranked: Vec<(&str, usize)> = counts.into_iter().collect();
    ranked.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(b.0)));

    for (word, n) in ranked.iter().take(10) {
        println!("{n:>5}  {word}");
    }

    ExitCode::SUCCESS
}
```

```bash
$ cargo run -- Cargo.toml
    3  name
    1  dependencies
    ...
```

Things worth noticing, because each becomes a whole module later:

- `env::args().nth(1)` returns `Option<String>` — no null, no exception.
- `fs::read_to_string` returns `Result<String, io::Error>` — failure is a value.
- `counts.entry(word).or_insert(0)` — the entry API, which avoids a double lookup.
- `&str` keys borrowed from `text` — the map borrows instead of copying (module 02.03).
- `ExitCode` instead of `std::process::exit` — destructors still run.
- `println!("{n:>5}  {word}")` — inline format args, right-aligned width 5.

## Cargo.toml explained

```toml
[package]
name = "hello"                  # crate name; also the binary name
version = "0.1.0"               # semver, published to crates.io
edition = "2021"                # syntax generation
rust-version = "1.75"           # MSRV — minimum supported Rust version
description = "Counts words"    # shown on crates.io
license = "MIT OR Apache-2.0"   # dual license is the Rust norm
authors = ["You <you@example.com>"]
repository = "https://github.com/you/hello"

[dependencies]
serde = { version = "1", features = ["derive"] }
anyhow = "1.0.86"

[dev-dependencies]              # tests, benches, examples only
criterion = "0.5"

[build-dependencies]            # build.rs only
cc = "1"

[[bin]]                         # multiple binaries
name = "hello"
path = "src/main.rs"

[profile.release]
lto = "thin"
codegen-units = 1
strip = true
```

### Version requirements are not exact versions

```toml
serde = "1"          # ^1  → >=1.0.0, <2.0.0
serde = "1.0.200"    # ^1.0.200 → >=1.0.200, <2.0.0
serde = "=1.0.200"   # exactly 1.0.200
serde = "~1.0.200"   # >=1.0.200, <1.1.0
```

Cargo picks the newest version satisfying *all* constraints in the graph and
records the result in `Cargo.lock`. Commit `Cargo.lock` for binaries (reproducible
builds) — it is optional for libraries but increasingly committed anyway.

## Adding dependencies

```bash
$ cargo add serde --features derive
$ cargo add anyhow
$ cargo add tokio --features full
$ cargo add --dev criterion
$ cargo remove anyhow
```

`cargo add` resolves the latest compatible version, checks features exist, and
writes the correct line. It is strictly better than hand-editing `Cargo.toml`.

Inspect what you actually got:

```bash
$ cargo tree                 # dependency tree
$ cargo tree -i serde        # who depends on serde (reverse)
$ cargo tree -d              # only duplicated crates
$ cargo tree --depth 1       # direct deps only
```

> **Gotcha:** `cargo tree -d` showing a crate twice at different major versions
> is normal (`rand 0.8` + `rand 0.9`) and mostly harmless. It becomes a problem
> when the type appears in *your* public API, because then your users cannot
> pass their version to you.

## Your first library crate

```bash
$ cargo new --lib greet
```

```rust
// src/lib.rs
/// Returns a greeting for `name`.
///
/// # Examples
///
/// ```
/// assert_eq!(greet::greeting("Ada"), "Hello, Ada!");
/// ```
pub fn greeting(name: &str) -> String {
    format!("Hello, {name}!")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn greets_by_name() {
        assert_eq!(greeting("Ada"), "Hello, Ada!");
    }
}
```

```bash
$ cargo test
running 1 test
test tests::greets_by_name ... ok

   Doc-tests greet
running 1 test
test src/lib.rs - greeting (line 6) ... ok
```

Two tests ran from one file: the unit test, and the **doc test** compiled from
the example in the doc comment. That is why Rust docs do not rot — the examples
in them are executed by CI.

`cargo doc --open` now renders `greeting` with that example inlined and
runnable.

---

## Exercises

1. Extend the word counter: accept multiple files, aggregate counts across all
   of them, and skip words shorter than 3 characters.
2. Add `--top N` support using `env::args()`. What happens with a non-numeric
   argument? Decide: panic or error message? Justify your choice.
3. Make `greet` a library with a binary that uses it. You will need both
   `src/lib.rs` and `src/main.rs` in one package. Does `use greet::greeting;`
   work from `main.rs`? (It should.)
4. Run `cargo tree` on any project. Find one crate that appears at two
   different versions and explain why.

**Next:** [Project layout and workspaces](03-project-layout-workspaces.md)
