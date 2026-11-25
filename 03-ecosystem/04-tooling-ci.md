# 04 · Tooling and CI

The Rust toolchain ships with the two tools that matter most (fmt, clippy), and
the community has built excellent ones for everything else. This module is the
"make it production-grade" checklist.

## `rustfmt` — formatting

```bash
$ cargo fmt                  # format everything
$ cargo fmt --all -- --check # CI: fail if not formatted
```

`rustfmt.toml` — note that most options are **nightly-only**:

```toml
# rustfmt.toml  (stable options)
edition = "2021"
max_width = 100

# nightly-only — run with `cargo +nightly fmt`
imports_granularity = "Module"
group_imports = "StdExternalCrate"
```

> **Rule of thumb:** do not fight rustfmt. Its default output is what every Rust
> developer reads fluently, and diff noise from manual formatting is a real cost
> in review.

## `clippy` — the linter

```bash
$ cargo clippy --all-targets --all-features -- -D warnings
$ cargo clippy --fix --allow-dirty     # auto-apply machine-applicable lints
```

Clippy has ~750 lints in groups:

| Group | Meaning |
| --- | --- |
| `correctness` | almost certainly a bug (on by default) |
| `suspicious` | probably a bug |
| `style` | idiomatic alternative |
| `complexity` | needlessly convoluted |
| `perf` | a faster way exists |
| `pedantic` | stricter, sometimes noisy |
| `nursery` | unstable, experimental |
| `cargo` | manifest problems |

```toml
# Cargo.toml
[lints.clippy]
all = { level = "warn", priority = -1 }
pedantic = { level = "warn", priority = -1 }
module_name_repetitions = "allow"
must_use_candidate = "allow"
missing_errors_doc = "allow"
```

Start with `all`, add `pedantic` selectively. Enabling all of `pedantic` on a
real codebase produces hundreds of `module_name_repetitions` warnings and people
start ignoring clippy, which is the worst outcome.

### Lints worth knowing by name

- `unwrap_used`, `expect_used` — ban panics in library code
- `todo`, `unimplemented` — never ship these
- `dbg_macro`, `print_stdout` — ban debug output in a server
- `arithmetic_side_effects` — catch overflow risks
- `cast_possible_truncation` — catch lossy `as`
- `large_enum_variant` — a variant 10× bigger than the others
- `redundant_clone` — an unnecessary allocation

## `cargo-deny` — supply chain policy

```bash
$ cargo install cargo-deny
```

```toml
# deny.toml
[advisories]
vulnerability = "deny"
unmaintained = "warn"

[licenses]
allow = ["MIT", "Apache-2.0", "BSD-3-Clause", "ISC", "Unicode-3.0"]

[bans]
multiple-versions = "warn"
deny = [
    { name = "openssl-sys" },   # force rustls instead
]

[sources]
unknown-registry = "deny"
unknown-git = "deny"
```

```bash
$ cargo deny check
```

This is the one CI step that stops a compromised or GPL-licensed dependency from
reaching production.

## `cargo-audit` — known vulnerabilities

```bash
$ cargo install cargo-audit
$ cargo audit
$ cargo audit --json
```

Reads the RustSec advisory database. Run it on a schedule in CI, not just on
push — new CVEs appear for dependencies you did not change.

## `cargo-mutants` — does your test suite actually test?

```bash
$ cargo install cargo-mutants
$ cargo mutants
```

It mutates your source (flips `<` to `<=`, replaces a return value) and checks
whether a test fails. A surviving mutant is an untested behaviour. This finds
the "tests that assert nothing" problem better than coverage does.

## `miri` — undefined behaviour detection

```bash
$ rustup +nightly component add miri
$ cargo +nightly miri test
```

An interpreter for Rust's MIR that catches UB your tests would miss: out-of-bounds
reads, use of uninitialised memory, data races, invalid `unsafe`. Slow — run it
on the `unsafe`-heavy crates only.

## `cargo-geiger` — unsafe usage audit

```bash
$ cargo install cargo-geiger
$ cargo geiger
```

Counts `unsafe` in your code and your dependency tree. Useful when evaluating a
new crate.

## `cargo-semver-checks`

```bash
$ cargo install cargo-semver-checks
$ cargo semver-checks check-release
```

Detects breaking changes in your public API that a version bump does not declare.
Essential for a library.

## `cargo-release` and `cargo-dist`

```bash
$ cargo install cargo-release
$ cargo release patch --execute
```

Bumps versions, tags, publishes, and pushes — across a workspace, in dependency
order. `cargo-dist` generates cross-platform release binaries and installers
(shell script, Homebrew formula, MSI) from a GitHub Actions workflow.

## Editor and IDE

| Tool | Purpose |
| --- | --- |
| `rust-analyzer` | LSP: completion, inline errors, refactors |
| CodeLLDB (VS Code) | debugger |
| `rust-gdb` / `rust-lldb` | pretty-printers for `Vec`, `String` |
| RustRover / IntelliJ Rust | full IDE with refactoring |

Worth enabling in `settings.json`:

```json
{
  "rust-analyzer.check.command": "clippy",
  "rust-analyzer.cargo.allFeatures": true,
  "rust-analyzer.inlayHints.lifetimeElisionHints.enable": "skip_trivial",
  "rust-analyzer.inlayHints.closureReturnTypeHints.enable": "with_block"
}
```

Lifetime inlay hints are genuinely helpful while learning module 02.03.

## A complete CI workflow

```yaml
# .github/workflows/ci.yml
name: CI
on:
  push: { branches: [main] }
  pull_request:

env:
  CARGO_TERM_COLOR: always
  RUSTFLAGS: "-D warnings"

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready --health-interval 5s
          --health-timeout 5s --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy
      - uses: Swatinem/rust-cache@v2

      - name: Format
        run: cargo fmt --all -- --check

      - name: Clippy
        run: cargo clippy --workspace --all-targets --all-features -- -D warnings

      - name: Test
        run: cargo nextest run --workspace
        env:
          DATABASE_URL: postgres://postgres:postgres@localhost/test

      - name: Doc tests
        run: cargo test --doc --workspace

      - name: Security
        run: |
          cargo install cargo-audit cargo-deny --locked
          cargo audit
          cargo deny check

  msrv:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@1.75.0
      - run: cargo check --workspace

  cross:
    strategy:
      matrix:
        target: [x86_64-unknown-linux-musl, aarch64-unknown-linux-gnu]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with: { targets: "${{ matrix.target }}" }
      - run: cargo build --release --target ${{ matrix.target }}
```

Three jobs worth having that people skip: **MSRV** (proves your `rust-version`
is honest), **cross** (proves the `cfg` blocks compile), and **deny** (supply
chain).

## Pre-commit hooks

```bash
$ cargo install cargo-husky
```

```rust
// in dev-dependencies
cargo-husky = { version = "1", default-features = false, features = ["precommit-hook", "run-cargo-fmt", "run-cargo-clippy"] }
```

Or with `lefthook` / `pre-commit`:

```yaml
# lefthook.yml
pre-commit:
  commands:
    fmt:
      run: cargo fmt --all -- --check
    clippy:
      run: cargo clippy --all-targets -- -D warnings
```

## The order to fix things in

When you inherit a messy Rust repo, do this in order — each step makes the next
cheaper:

1. `cargo fmt` — one huge diff, then never again.
2. `cargo clippy --fix` — automatic, safe.
3. `cargo clippy -D warnings` in CI.
4. `cargo deny check` in CI.
5. `cargo nextest` for speed.
6. Coverage or `cargo-mutants` to find untested code.
7. `cargo-audit` on a schedule.

---

## Exercises

1. Add `[lints.clippy]` to a project with `all = "warn"` and `unwrap_used =
   "warn"`, then fix the fallout.
2. Run `cargo clippy --fix` on a project with a few style lints and review the
   diff before committing.
3. Write a `deny.toml` that allows only MIT/Apache-2.0/BSD-3-Clause and bans
   duplicate major versions of any crate as an error.
4. Run `cargo audit` and, if it reports anything, evaluate whether it applies to
   your usage.
5. Add the three-job CI workflow above to a real repo and get it green.
6. Explain why `RUSTFLAGS: "-D warnings"` in CI is both useful and dangerous.

**Next:** [Performance and profiling](05-performance-profiling.md)
