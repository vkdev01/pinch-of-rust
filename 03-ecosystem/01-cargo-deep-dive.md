# 01 · Cargo in Depth

`cargo` is the build system. Knowing its knobs is the difference between a
two-minute build and a twelve-minute one.

## Profiles

Profiles control optimisation. They are declared per package (or per workspace)
and selected with a flag.

```toml
[profile.dev]
opt-level = 0
debug = true          # full debuginfo
incremental = true

[profile.dev.package."*"]
opt-level = 2         # optimise DEPENDENCIES in dev builds — big speedup

[profile.release]
opt-level = 3
lto = "thin"          # cross-crate inlining, moderate compile cost
codegen-units = 1     # best optimisation, slowest compile
panic = "abort"       # smaller binary, no unwinding
strip = "symbols"     # drop debug symbols

[profile.bench]
inherits = "release"
debug = true          # keep symbols for profiling

[profile.release-with-debug]
inherits = "release"
debug = true
strip = false
```

```bash
$ cargo build --profile release-with-debug
$ cargo build --release
```

> **Rule of thumb:** `[profile.dev.package."*"] opt-level = 2` is the single
> best dev-experience tweak in Rust. Your code stays fast to recompile;
> dependencies (which never change) get optimised, so image decoding, regex and
> crypto stop being 20× slower than release.

### LTO trade-off

| `lto` | Compile cost | Speed |
| --- | --- | --- |
| `false` | baseline | baseline |
| `"thin"` | +10–20% | +5–10% |
| `"fat"` / `true` | +50–100% | +10–15% |

Measure before and after with `cargo bench`. Do not assume.

## Build scripts (`build.rs`)

A `build.rs` at the package root runs **before** compilation. Uses: generating
code, linking C libraries, embedding metadata.

```toml
[build-dependencies]
cc = "1"
```

```rust
// build.rs
use std::env;
use std::path::PathBuf;

fn main() {
    // 1. compile a C file and link it
    cc::Build::new().file("src/native.c").compile("native");

    // 2. pass an env var into the crate
    println!("cargo:rustc-env=BUILD_TIME={}", now_string());

    // 3. re-run only when these change
    println!("cargo:rerun-if-changed=src/native.c");
    println!("cargo:rerun-if-changed=proto/");

    // 4. link a system library
    println!("cargo:rustc-link-lib=dylib=ssl");

    // 5. emit generated code into OUT_DIR
    let out = PathBuf::from(env::var("OUT_DIR").unwrap());
    std::fs::write(out.join("version.rs"), "pub const V: &str = \"1.0\";").unwrap();
}
```

```rust
// src/lib.rs — pull in the generated file
include!(concat!(env!("OUT_DIR"), "/version.rs"));
```

> **Gotcha:** if `build.rs` does not print `cargo:rerun-if-changed`, cargo
> re-runs it on **every** file change in the package. That is the usual cause of
> "why is my build script running constantly".

## `cargo` subcommands worth knowing

```bash
# dependency management
cargo add serde --features derive
cargo remove serde
cargo update                    # bump within semver constraints
cargo update -p serde --precise 1.0.200
cargo tree -d                   # duplicate versions
cargo tree -e features          # feature resolution
cargo tree -i tokio             # reverse deps

# building
cargo build --release
cargo build --target x86_64-unknown-linux-musl
cargo check --all-targets --all-features
cargo rustc -- -C target-cpu=native

# running
cargo run --bin server -- --port 8080     # `--` separates cargo args from program args
cargo watch -x check -x test              # needs cargo-watch

# quality
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test --workspace
cargo test -- --nocapture                 # show println! output
cargo test name_filter                    # only matching tests
cargo test -- --test-threads=1            # serial (for DB tests)

# docs
cargo doc --no-deps --open
cargo doc --document-private-items

# publishing
cargo package --list            # what would be published
cargo publish --dry-run
cargo publish
```

## Cross-compilation

```bash
$ rustup target add aarch64-unknown-linux-gnu
$ cargo build --release --target aarch64-unknown-linux-gnu
```

Output lands in `target/<triple>/release/`. You need a linker for the target —
usually a cross toolchain (`gcc-aarch64-linux-gnu`) configured in
`.cargo/config.toml`:

```toml
[target.aarch64-unknown-linux-gnu]
linker = "aarch64-linux-gnu-gcc"
```

**Static binaries with musl** — the reliable way to ship a Linux binary that
runs anywhere:

```bash
$ rustup target add x86_64-unknown-linux-musl
$ cargo build --release --target x86_64-unknown-linux-musl
$ file target/x86_64-unknown-linux-musl/release/myapp
# statically linked
```

`cargo-zigbuild` is a nicer alternative: it uses Zig as the cross linker and
handles glibc version pinning for you.

```bash
$ cargo install cargo-zigbuild
$ cargo zigbuild --target x86_64-unknown-linux-gnu.2.17 --release
```

## Reducing build time

The usual culprits, in order of impact:

1. **`[profile.dev.package."*"] opt-level = 2`** — dependencies stop being slow.
2. **Fewer features.** `tokio = { features = ["full"] }` compiles everything.
   List only what you need.
3. **`sccache`** — shared compilation cache across branches and CI:
   ```bash
   $ cargo install sccache
   $ export RUSTC_WRAPPER=sccache
   ```
4. **Split into crates** — unchanged crates are not recompiled.
5. **`lld` or `mold` as the linker.** Linking is often 30–50% of build time:
   ```toml
   # .cargo/config.toml
   [target.x86_64-unknown-linux-gnu]
   linker = "clang"
   rustflags = ["-C", "link-arg=-fuse-ld=mold"]
   ```
6. **`cargo-nextest`** for tests — parallel, per-test process isolation, much
   faster than `cargo test` on large suites.
7. **Check the tree.** `cargo tree -d` and a look at `cargo build --timings`
   usually reveal one heavy dependency you can drop.

```bash
$ cargo build --timings
# opens target/cargo-timings/cargo-timing.html
```

## Lockfile hygiene

```bash
$ cargo update -p tokio            # bump one crate
$ cargo update --dry-run           # preview
$ cargo tree -d                    # find duplicates
```

Duplicate major versions are normal and mostly harmless. They matter when:

- the type appears in your public API (callers cannot interoperate),
- a trait impl is missing because two `serde` versions exist,
- binary size is critical.

## `.cargo/config.toml`

Per-project cargo configuration. Commit it for repo-specific behaviour; keep
machine-specific settings in `~/.cargo/config.toml`.

```toml
[build]
target-dir = "target"
rustflags = ["-C", "target-cpu=native"]

[alias]
b = "build"
t = "test --workspace"
c = "clippy --all-targets -- -D warnings"
rr = "run --release"

[env]
RUST_LOG = "info"
DATABASE_URL = "postgres://localhost/dev"

[registries.internal]
index = "https://git.example.com/crates/index"
```

```bash
$ cargo b          # now this is `cargo build`
$ cargo t
```

## Vendoring for air-gapped builds

```bash
$ cargo vendor vendor/
```

Add the printed snippet to `.cargo/config.toml`:

```toml
[source.crates-io]
replace-with = "vendored-sources"

[source.vendored-sources]
directory = "vendor"
```

Now `cargo build --offline` works with no network at all. `cargo vendor` output
is large — commit it only if you must.

## A realistic CI build

```yaml
- name: Cache cargo
  uses: Swatinem/rust-cache@v2
  with:
    shared-key: "linux-stable"

- name: Check
  run: cargo check --workspace --all-targets --all-features

- name: Clippy
  run: cargo clippy --workspace --all-targets -- -D warnings

- name: Test
  run: cargo nextest run --workspace

- name: Build release
  run: cargo build --release --locked
```

`--locked` fails the build if `Cargo.lock` would change — that is what you want
in CI, always.

---

## Exercises

1. Add `[profile.dev.package."*"] opt-level = 2` to a project with `image` and
   `regex`. Time `cargo run` before and after.
2. Write a `build.rs` that embeds the git commit hash as `env!("GIT_HASH")`.
3. Cross-compile a hello-world for `x86_64-unknown-linux-musl` and confirm with
   `file` that it is static.
4. Run `cargo build --timings` and find the slowest crate. Is it one you need?
5. Add `[alias]` entries so `cargo t` runs the full workspace test suite.
6. Produce a release binary with `lto = "fat"`, `codegen-units = 1`,
   `panic = "abort"`, `strip = true`. Compare size and runtime against a default
   release build.

**Next:** [The library tour](02-library-tour.md)
