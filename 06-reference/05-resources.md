# 05 · Resources Worth Your Time

A short list, curated. Everything here is free unless marked, and everything here
is genuinely worth the hours.

## The official documentation

| Resource | What it is | When |
| --- | --- | --- |
| [The Rust Programming Language](https://doc.rust-lang.org/book/) | "The Book" — the canonical introduction | Days 1–20 |
| [Rust by Example](https://doc.rust-lang.org/rust-by-example/) | runnable snippets, no prose | When you need a syntax reminder |
| [The Rustonomicon](https://doc.rust-lang.org/nomicon/) | `unsafe`, FFI, the real memory model | Only when you write `unsafe` |
| [The Rust Reference](https://doc.rust-lang.org/reference/) | normative language spec | When two sources disagree |
| [std API docs](https://doc.rust-lang.org/std/) | the standard library | Daily |
| [The Cargo Book](https://doc.rust-lang.org/cargo/) | build system reference | Module 03.01 |
| [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/) | how to design a public crate | Before publishing |
| [The Rust Performance Book](https://nnethercote.github.io/perf-book/) | Nicholas Nethercote's optimisation guide | Module 03.05 |
| [Rust Design Patterns](https://rust-unofficial.github.io/patterns/) | idioms and anti-patterns | After the Book |
| [Comprehensive Rust](https://google.github.io/comprehensive-rust/) | Google's 4-day course | A fast structured review |

## Books

| Book | Author | Read it when |
| --- | --- | --- |
| *Programming Rust* (2nd ed) | Blandy, Orendorff, Tindall | You want depth and precision, with C++ comparisons |
| *Rust for Rustaceans* | Jon Gjengset | After the Book — traits, async internals, API design |
| *Rust Atomics and Locks* | Mara Bos | Concurrency, memory ordering, building your own primitives — free online |
| *Zero to Production in Rust* | Luca Palmieri | Building a production web service, end to end |
| *Command-Line Rust* | Ken Youens-Clark | Learning by writing eight real CLI tools |
| *The Rust Programming Language* (book form) | Klabnik, Nichols | The Book, on paper |

*Rust Atomics and Locks* is free at <https://marabos.nl/atomics/>. *Rust for
Rustaceans* is the single best "next step" book.

## Video

| Channel / series | Why |
| --- | --- |
| **Crust of Rust** (Jon Gjengset) | Long, live-coded deep dives: lifetimes, `Send`/`Sync`, channels, `Arc`. The best Rust video content that exists |
| **Let's Get Rusty** | Short, structured, beginner-friendly |
| **Jon Gjengset's streams** | Building real things slowly, with mistakes |
| **RustConf talks** (YouTube) | The "Rust in production" track is consistently good |
| **fasterthanlime** | Extremely detailed debugging and internals write-ups |

## Reading, weekly

| Source | Content |
| --- | --- |
| [This Week in Rust](https://this-week-in-rust.org/) | The newsletter. Crates, RFCs, jobs, talks — read the top section |
| [r/rust](https://reddit.com/r/rust) | Discussion, release announcements |
| [users.rust-lang.org](https://users.rust-lang.org/) | The forum where hard questions get good answers |
| [Rust Blog](https://blog.rust-lang.org/) | Release notes — read them, they explain new features |
| [Inside Rust](https://blog.rust-lang.org/inside-rust/) | Language team working notes |

## Finding crates

| Site | Use |
| --- | --- |
| [crates.io](https://crates.io) | the registry |
| [docs.rs](https://docs.rs) | rendered docs for every crate and version — your default reference |
| [lib.rs](https://lib.rs) | curated, categorised, better discovery than crates.io |
| [blessed.rs](https://blessed.rs) | opinionated "use this one" recommendations per domain |
| [Are we web yet?](https://www.arewewebyet.org/) | web ecosystem status |
| [Are we game yet?](https://arewegameyet.rs/) | gamedev ecosystem status |
| [Are we embedded yet?](https://areweembeddedyet.org/) | embedded status |

`blessed.rs` is the fastest way to stop wondering which of five HTTP clients to
pick.

## Tools to install

```bash
cargo install cargo-watch        # rebuild on save
cargo install cargo-expand       # see macro output
cargo install cargo-nextest      # faster tests
cargo install cargo-llvm-cov     # coverage
cargo install cargo-audit        # vulnerabilities
cargo install cargo-deny         # licenses, duplicates, advisories
cargo install cargo-mutants      # does your test suite test anything?
cargo install cargo-flamegraph   # profiling
cargo install cargo-semver-checks
cargo install cargo-zigbuild     # painless cross-compilation
cargo install sccache            # shared compile cache
cargo install trunk              # wasm app bundler
cargo install wasm-pack          # wasm npm packaging
cargo install sqlx-cli           # migrations
cargo install tokio-console      # async task inspector
cargo install samply             # profiler with a UI
cargo install --locked bacon      # background cargo check with a TUI
```

`bacon` deserves a mention: it watches your project and shows errors in a pane
while you type. It changes how the edit-compile loop feels.

## Communities

| Where | Culture |
| --- | --- |
| [Rust Discord](https://discord.gg/rust-lang) | fast help, `#beginners` is welcoming |
| [users.rust-lang.org](https://users.rust-lang.org/) | slower, higher-quality answers |
| [r/rust](https://reddit.com/r/rust) | news and discussion |
| [Rust Zulip](https://rust-lang.zulipchat.com/) | language development, for contributors |
| Local meetups | search "Rust" + your city; most are beginner-friendly |

**How to ask a good question:** post the code, the full error, and what you tried.
Better: post a [minimal reproducible example](https://stackoverflow.com/help/minimal-reproducible-example)
— building it usually solves the problem before you post.

## Conferences and talks

- **RustConf** (US, annual) — talks on YouTube
- **Rust Nation UK** (London)
- **EuroRust** (rotating European city)
- **Rust India** and regional meetups
- **Rust Belt Rust**, **RustFest** (historically)

The production-experience talks are the most useful: what broke, what they
measured, what they would do differently.

## Learning by reading code

The fastest way to write idiomatic Rust is to read good Rust. In rough order of
accessibility:

| Project | Why read it |
| --- | --- |
| `ripgrep` | clean CLI + high-performance internals |
| `fd` | small, readable, excellent `clap` usage |
| `bat` | terminal output done well |
| `serde` | the derive-macro architecture |
| `axum` | extractors and tower integration |
| `tokio` | the executor and runtime internals (hard) |
| `polars` | large-scale data engineering in Rust |
| `hyperfine` | small, well-tested CLI |
| `alacritty` | a real application, not a library |
| `rust-analyzer` | a huge codebase doing real compiler work |

Start with `fd` — it is small enough to read in an afternoon and idiomatic
throughout.

## Anti-resources

Honest list of things that waste time:

- **Tutorials that predate 2021.** Editions changed `use` paths, closures and
  `IntoIterator`; pre-2018 tutorials will actively mislead you.
- **Copy-pasting from Stack Overflow answers older than the crate version you
  use.** Check the date and the crate version in the answer.
- **Trying to learn `unsafe`, `Pin` and macros in week one.** They are advanced
  for a reason.
- **Rewriting a C library "to learn Rust".** Pick something you actually want to
  exist.
- **Benchmarking without `--release`.** You will conclude Rust is slow.

## The one-paragraph summary

Read The Book once, type everything. Then read *Rust for Rustaceans*. Then build
something real, and read `docs.rs` for every crate you touch. Ask in
`users.rust-lang.org` when you are stuck for more than 30 minutes. Read `fd`'s
source. That path, in that order, is the fastest one that actually works.
