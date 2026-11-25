# 01 · Install and Toolchain

Rust ships as a set of tools, not a single compiler. Understanding what each
piece does saves you hours later.

## The pieces

| Tool | What it is | You use it for |
| --- | --- | --- |
| `rustup` | Toolchain installer and version manager | Installing Rust, switching versions, adding targets |
| `rustc` | The compiler | Almost never called directly |
| `cargo` | Build system + package manager + test runner | Everything |
| `rustfmt` | Auto-formatter | `cargo fmt` |
| `clippy` | Linter with ~750 checks | `cargo clippy` |
| `rust-analyzer` | Language server | Editor autocomplete, inline errors |
| `rustdoc` | Documentation generator | `cargo doc --open` |

You install `rustup`. `rustup` installs the rest.

## Install

**Linux / macOS:**

```bash
$ curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

**Windows:** download and run [rustup-init.exe](https://rustup.rs). You will be
asked to install the **Visual Studio C++ Build Tools** — accept it. Rust uses
the system linker, and on Windows that means MSVC. (The `x86_64-pc-windows-gnu`
target avoids this but causes more problems than it solves.)

**Then, in a fresh shell:**

```bash
$ rustc --version
rustc 1.85.0 (4d91de4e4 2025-02-17)

$ cargo --version
cargo 1.85.0
```

> **Gotcha:** if `cargo: command not found`, your shell has not re-read its
> profile. Run `source "$HOME/.cargo/env"` or open a new terminal. On Windows
> this is almost always a PATH issue fixed by restarting the terminal.

## What rustup actually manages

`rustup` keeps *toolchains* side by side and switches between them per project.

```bash
$ rustup show                    # active toolchain, installed targets
$ rustup update                  # update everything to latest stable
$ rustup toolchain list          # stable, beta, nightly, plus pinned versions
$ rustup toolchain install 1.75.0
$ rustup default stable
$ rustup component add clippy rustfmt
$ rustup target add wasm32-unknown-unknown
```

### Channels

| Channel | Meaning | Use for |
| --- | --- | --- |
| `stable` | Released every 6 weeks, guaranteed backwards compatible | Everything production |
| `beta` | Next stable, for testing | Catching breakage early |
| `nightly` | Daily, enables unstable features via `#![feature(...)]` | Experiments, some tooling |

**Rule: use stable.** Nightly is a research tool, not a default. The one common
exception is `cargo +nightly fmt` for unstable formatting options, and
`cargo miri` for undefined-behaviour checking.

### Pin the toolchain per project

Create `rust-toolchain.toml` in the repo root:

```toml
[toolchain]
channel = "1.85.0"
components = ["rustfmt", "clippy"]
targets = ["x86_64-unknown-linux-gnu"]
```

Now anyone who runs `cargo build` in that directory gets exactly 1.85.0 —
rustup downloads it automatically. This is the single highest-value file in a
Rust repo for reproducibility, and it costs six lines.

## Editions

Editions let the language change syntax without breaking old code. A crate
declares its edition in `Cargo.toml`; editions interoperate freely.

| Edition | Landed | Headline change |
| --- | --- | --- |
| 2015 | 1.0 | Original |
| 2018 | 1.31 | `use` paths, `dyn Trait`, NLL borrow checker |
| 2021 | 1.56 | Disjoint closure captures, `IntoIterator` for arrays, panic macros |
| 2024 | 1.85 | `gen` keyword, `unsafe extern`, RPIT lifetime capture, `if let` temporary scope |

New projects: use `edition = "2024"` if your toolchain is 1.85+, otherwise
`"2021"`. There is no performance difference.

> **Rule of thumb:** an edition is a *syntax* boundary, not an API boundary.
> Crates on different editions link together with no friction. Do not delay an
> upgrade for "compatibility" reasons.

## Editor setup

**VS Code** — install the `rust-analyzer` extension. Disable any other Rust
extension you have; two language servers fight each other.

Settings worth adding (`.vscode/settings.json`):

```json
{
  "rust-analyzer.check.command": "clippy",
  "rust-analyzer.cargo.features": "all",
  "editor.formatOnSave": true,
  "[rust]": { "editor.defaultFormatter": "rust-lang.rust-analyzer" }
}
```

`check.command: clippy` makes inline diagnostics come from Clippy instead of
plain `cargo check` — you see lint warnings as you type, which is a large
quality-of-life win.

**Neovim / Emacs / Zed / JetBrains** all speak LSP; point them at
`rust-analyzer`. JetBrains has a dedicated Rust plugin (RustRover) with a
debugger.

**Debugging:** `lldb` or `gdb` work with Rust. For a nicer experience install
`rust-gdb` / `rust-lldb` (ships with rustup) which loads Rust pretty-printers so
you can inspect `String`, `Vec`, `HashMap` as values instead of raw pointers.

## Cargo's global directories

```bash
~/.cargo/bin/          # cargo, rustc, rustup, cargo-clippy, installed binaries
~/.cargo/registry/     # downloaded crate sources and index cache
~/.cargo/git/          # git dependencies
~/.rustup/toolchains/  # the actual compilers
target/                # per-project build artifacts (safe to delete)
```

> **Gotcha:** `target/` grows fast — 2–10 GB for a large workspace is normal.
> `cargo clean` reclaims it, but you lose all incremental state and the next
> build is a full rebuild. For space pressure use `cargo-sweep` to delete only
> artifacts older than N days.

## Working offline

Cargo caches everything it downloads. To build without network:

```bash
$ cargo fetch          # populate the cache for the current project
$ cargo build --offline
```

For fully air-gapped builds, `cargo vendor` copies all dependency sources into
`vendor/` and a `.cargo/config.toml` points at them:

```bash
$ cargo vendor vendor/
```

## Verifying a healthy install

```bash
$ rustc --version && cargo --version
$ cargo new /tmp/smoke && cd /tmp/smoke
$ cargo run
Hello, world!
$ cargo clippy -- -D warnings
$ cargo fmt --check
```

If all five succeed, you have a working Rust development environment.

---

## Exercises

1. Install Rust, then install the `1.75.0` toolchain alongside stable. Print
   both versions with `rustup run 1.75.0 rustc --version`.
2. Add the `wasm32-unknown-unknown` target. Confirm it appears in `rustup show`.
3. Create `rust-toolchain.toml` in a test project pinning `1.85.0`, then run
   `cargo build` and watch rustup download it.
4. Run `cargo new --help` and read the full flag list. What does
   `--vcs none` do, and when would you want it?

**Next:** [Hello, Cargo](02-hello-cargo.md)
