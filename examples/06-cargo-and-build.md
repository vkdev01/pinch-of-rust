---
summary: The build-system recipes: features, workspaces, build scripts, cross-compilation and a CI that finishes fast.
level: Intermediate
time: 15 min
tags: [cargo, build, ci]
---

# Cargo and build recipes

## Make dev builds usable

```toml
[profile.dev]
opt-level = 1          # your code: still fast to recompile

[profile.dev.package."*"]
opt-level = 3          # dependencies: optimised once, never recompiled
```

The single best change to a Rust developer's day. Image decoding, regex and crypto
stop being 20× slower than release while your own code stays quick to rebuild.

## Share a dependency version across a workspace

```toml
# root Cargo.toml
[workspace]
members = ["crates/*"]
resolver = "2"

[workspace.dependencies]
serde = { version = "1", features = ["derive"] }
tokio = { version = "1", features = ["rt-multi-thread", "macros"] }

[workspace.package]
version = "0.1.0"
edition = "2021"
```

```toml
# crates/api/Cargo.toml
[package]
name = "api"
version.workspace = true
edition.workspace = true

[dependencies]
serde.workspace = true
tokio.workspace = true
```

One place to bump a version, one place to see the dependency set.

## Features that do not explode

```toml
[features]
default = ["json"]
json = ["dep:serde_json"]
postgres = ["sqlx/postgres"]
metrics = ["dep:prometheus"]
```

```rust
#[cfg(feature = "metrics")]
pub mod metrics;
```

> **Trap:** features are additive and unified across the whole graph. You cannot
> use one to *disable* something another crate enabled. Design them as "add
> capability", never as either/or switches.

## Generate code at build time

```rust
// build.rs
fn main() {
    println!("cargo:rerun-if-changed=proto/");
    println!("cargo:rustc-env=GIT_HASH={}", git_hash());

    let out = std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap());
    std::fs::write(out.join("version.rs"), "pub const VERSION: &str = \"1.0\";").unwrap();
}

fn git_hash() -> String {
    std::process::Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .unwrap_or_default()
        .trim()
        .to_string()
}
```

```rust
include!(concat!(env!("OUT_DIR"), "/version.rs"));
```

Without `rerun-if-changed`, cargo re-runs the script on every file change in the
package — the usual cause of "why is my build script running constantly".

## Cross-compile a static Linux binary

```bash
$ rustup target add x86_64-unknown-linux-musl
$ cargo build --release --target x86_64-unknown-linux-musl
$ file target/x86_64-unknown-linux-musl/release/myapp
# statically linked — runs on any Linux, including scratch containers
```

For glibc targets, `cargo-zigbuild` pins the glibc version:

```bash
$ cargo zigbuild --target x86_64-unknown-linux-gnu.2.17 --release
```

## Cache compilation across branches

```bash
$ cargo install sccache
$ export RUSTC_WRAPPER=sccache
```

sccache keys on the compiler flags and source hash, so switching branches and back
reuses artifacts. On CI it turns a 6-minute build into 40 seconds after the first
run.

## Link faster

```toml
# .cargo/config.toml
[target.x86_64-unknown-linux-gnu]
linker = "clang"
rustflags = ["-C", "link-arg=-fuse-ld=mold"]
```

Linking is 30–50% of a full build. `mold` is the fastest linker available on Linux.

## Find out where the time goes

```bash
$ cargo build --timings
# opens target/cargo-timings/cargo-timing.html
```

The Gantt chart names the crate responsible. It is almost always `syn`, `regex`,
`image`, or something you could enable fewer features on.

## CI that fails on the things that matter

```yaml
- run: cargo fmt --all -- --check
- run: cargo clippy --workspace --all-targets --all-features -- -D warnings
- run: cargo nextest run --workspace
- run: cargo test --doc --workspace
- run: cargo audit
- run: cargo deny check
```

`--locked` on any build in CI: it fails if `Cargo.lock` would change, which is the
alert you want when a dependency silently moves.

## Reproducible toolchains

```toml
# rust-toolchain.toml
[toolchain]
channel = "1.85.0"
components = ["rustfmt", "clippy"]
targets = ["x86_64-unknown-linux-gnu"]
```

Six lines that make every machine — laptop, CI, container — compile with the same
compiler. The highest-value file in a Rust repo.

## Trim the release binary

```toml
[profile.release]
lto = "thin"
codegen-units = 1
panic = "abort"
strip = "symbols"
```

```bash
$ cargo build --release
$ ls -lh target/release/myapp      # often 40-60% smaller
```

`panic = "abort"` removes unwinding tables. Do not use it if you rely on
`catch_unwind` (some web frameworks do, to isolate handler panics).

## Vendored builds for air-gapped CI

```bash
$ cargo vendor vendor/
```

```toml
# .cargo/config.toml
[source.crates-io]
replace-with = "vendored-sources"

[source.vendored-sources]
directory = "vendor"
```

Now `cargo build --offline` works with no network at all.

**Back to:** [Examples index](../README.md)
