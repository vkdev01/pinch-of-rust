# 03 · Project Layout and Workspaces

A Rust project's shape tells you a lot about its maturity. This module covers
the layout that scales, and the workspace tooling that makes a multi-crate repo
buildable in one command.

## The canonical layout

```text
myapp/
├── Cargo.toml
├── Cargo.lock
├── rust-toolchain.toml
├── README.md
├── .gitignore
├── .github/workflows/ci.yml
├── src/
│   ├── main.rs            # thin: parse args, call into lib, map errors
│   ├── lib.rs             # the actual logic — testable
│   ├── config.rs
│   ├── error.rs
│   └── handlers/
│       ├── mod.rs         # or handlers.rs
│       └── users.rs
├── tests/                 # integration tests: separate crates, public API only
│   └── api.rs
├── benches/
│   └── throughput.rs
├── examples/
│   └── quickstart.rs
├── migrations/            # sqlx migrations
└── assets/
```

### Why `lib.rs` + `main.rs`

Put logic in `lib.rs`, keep `main.rs` to ~20 lines. Three benefits:

1. **Integration tests in `tests/` can only import the library.** If everything
   lives in `main.rs`, you cannot test it from `tests/`.
2. **`examples/` can reuse it.** Examples are tiny binaries that depend on your
   library.
3. **You can split the binary later** — a second `[[bin]]` or a separate
   `server` crate — without moving code.

```rust
// src/lib.rs
pub mod config;
pub mod error;
pub mod handlers;

pub use error::{AppError, AppResult};

pub fn run(cfg: config::Config) -> AppResult<()> {
    // real work
    Ok(())
}
```

```rust
// src/main.rs
use std::process::ExitCode;

fn main() -> ExitCode {
    let cfg = match myapp::config::Config::from_env() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("config error: {e}");
            return ExitCode::FAILURE;
        }
    };
    match myapp::run(cfg) {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("fatal: {e:#}");
            ExitCode::FAILURE
        }
    }
}
```

### Module files: `foo.rs` or `foo/mod.rs`?

Both work. Modern convention is `foo.rs` + `foo/` side by side:

```text
src/
├── handlers.rs          # declares submodules
└── handlers/
    ├── users.rs
    └── billing.rs
```

```rust
// src/handlers.rs
pub mod billing;
pub mod users;
```

`mod.rs` style still works and some codebases prefer it. Pick one per repo and
be consistent — mixing both in one tree confuses `rust-analyzer`'s file
navigation.

## `.gitignore`

```gitignore
/target
**/*.rs.bk
*.pdb
.env
.env.*
!.env.example
```

`Cargo.lock` is **not** ignored for binaries — commit it. For libraries it is
optional; committing it is now common practice because it makes CI reproducible.

## Workspaces: many crates, one build

Once you have a server, a CLI, a shared domain crate and a migration crate, you
want one `cargo build` at the root and one shared `target/` directory.

```text
myapp/
├── Cargo.toml           # the workspace root — virtual manifest
├── crates/
│   ├── core/            # domain types, no I/O
│   │   ├── Cargo.toml
│   │   └── src/lib.rs
│   ├── api/             # HTTP layer
│   │   ├── Cargo.toml
│   │   └── src/main.rs
│   └── worker/          # background jobs
│       ├── Cargo.toml
│       └── src/main.rs
└── target/              # shared by every member
```

```toml
# ./Cargo.toml  — virtual manifest: no [package], only [workspace]
[workspace]
resolver = "2"
members = ["crates/core", "crates/api", "crates/worker"]

# Dependencies declared once, inherited by members — one place to bump versions
[workspace.dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
sqlx = { version = "0.8", features = ["runtime-tokio", "postgres", "macros"] }
tracing = "0.1"
thiserror = "2"

[workspace.package]
version = "0.1.0"
edition = "2021"
license = "MIT OR Apache-2.0"
```

```toml
# crates/api/Cargo.toml
[package]
name = "api"
version.workspace = true
edition.workspace = true
license.workspace = true

[dependencies]
core = { path = "../core" }
serde.workspace = true
tokio.workspace = true
tracing.workspace = true
```

```toml
# crates/core/Cargo.toml
[package]
name = "core"
version.workspace = true
edition.workspace = true

[dependencies]
serde.workspace = true
thiserror.workspace = true
```

> **Gotcha:** `version.workspace = true` requires `[workspace.package]` to define
> `version`. Forgetting it gives `error: failed to load manifest ... missing field`.
> Also note that a workspace member's crate name is what you `use` — here the
> crate is literally called `core`, which shadows the std `core` crate name and
> causes confusing import errors. Name it `domain` or `app-core` instead.

### Workspace commands

```bash
$ cargo build                    # all members
$ cargo build -p api             # one member
$ cargo test --workspace
$ cargo clippy --workspace --all-targets -- -D warnings
$ cargo run -p worker
$ cargo metadata --no-deps --format-version 1 | jq '.packages[].name'
```

### Shared dev settings

```toml
[workspace.lints.rust]
unsafe_code = "warn"
missing_debug_implementations = "warn"

[workspace.lints.clippy]
all = { level = "warn", priority = -1 }
unwrap_used = "warn"
```

```toml
# each member
[lints]
workspace = true
```

Lint configuration at the workspace level means a new crate cannot accidentally
be less strict than the rest. `priority = -1` is needed so the group `all` does
not override the individual lint that follows.

## Splitting into crates: when?

| Symptom | Do this |
| --- | --- |
| `cargo build` takes 3+ minutes | Split rarely-changed code into a crate; it stops recompiling |
| Two binaries share code | Shared library crate |
| You want to unit-test without a DB | `core` crate with no I/O dependencies |
| Compile-time feature flags differ per binary | Separate crates |
| Just "for tidiness" | **Don't.** Modules are free; crates cost compile time |

> **Rule of thumb:** start with modules. Split into crates when compile time or
> feature-flag isolation forces you to, not before. Each crate boundary is a
> real API you now have to maintain.

## Feature flags: conditional compilation

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

#[cfg(feature = "postgres")]
pub fn pg_pool() -> sqlx::PgPool { /* ... */ }
```

```bash
$ cargo build --no-default-features --features postgres
$ cargo tree -e features -i serde   # why is serde enabled?
```

> **Gotcha:** features are **additive and unified** across the whole graph. If
> any crate in the graph enables `tokio/full`, *you* get `full`. You cannot use
> a feature to *remove* something. Design features as "add capability", never
> "turn off the other thing".

## Practical exercise: build the skeleton

```bash
$ cargo new --lib crates/domain
$ cargo new crates/api
$ cargo new crates/worker
```

Then write the root `Cargo.toml` as a virtual manifest, add
`version.workspace = true` to each member, and confirm:

```bash
$ cargo build --workspace
$ cargo run -p api
```

---

## Exercises

1. Convert a single-crate project into a workspace with `domain`, `api` and
   `worker` members. Share `serde` and `tokio` via `[workspace.dependencies]`.
2. Add a `metrics` feature to `domain` that compiles a module only when enabled.
   Verify with `cargo build -p domain --features metrics` and
   `cargo doc -p domain --no-default-features`.
3. Add `[workspace.lints]` forbidding `unwrap_used`. Fix the resulting warnings
   in a real function — this is a good preview of module 02.07.
4. Add `tests/` integration tests that use only the public API of `domain`.
   Confirm they cannot see private items.

**Next:** [Variables, types, mutability](../02-language/01-variables-types-mutability.md)
