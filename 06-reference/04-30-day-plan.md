# 04 · A 30-Day Study Plan

Two hours a day for 30 days gets you from zero to shipping a Rust service. The
plan assumes you code every day — reading alone does not work for this language.

## How to use it

- **60% typing, 40% reading.** Type the examples; do not paste them.
- **Every day ends with something that compiles.** No day is purely conceptual.
- **Keep a `notes.md`** of every compiler error you hit and how you fixed it.
  By day 30 it is the most useful document you own.
- **Do not skip day 9.** Ownership is the hinge the whole language turns on.

## Week 1 — Language basics

| Day | Topic | Read | Build |
| --- | --- | --- | --- |
| 1 | Toolchain, cargo | 01.01, 01.02 | Install, `cargo new`, run hello world |
| 2 | Variables, types | 02.01 | A temperature converter; hit an overflow in debug and release |
| 3 | Functions, control flow | 02.02 | FizzBuzz, then an expression evaluator |
| 4 | Structs, enums | 02.04 | A `Shape` enum with `area()` and `Display` |
| 5 | Pattern matching | 02.04 | A config parser with typed values |
| 6 | Collections | 02.06 | Word-frequency counter over a real text file |
| 7 | Review + exercises | — | Redo every exercise from days 2–6 |

## Week 2 — The hard core

| Day | Topic | Read | Build |
| --- | --- | --- | --- |
| 8 | Ownership | 02.03 | Deliberately trigger E0382, E0502, E0499; write down each fix |
| 9 | Borrowing + lifetimes | 02.03 | `longest_word`, `split_kv`, a `Line<'a>` view type |
| 10 | Traits | 02.05 | A `Repository` trait with two implementations |
| 11 | Generics | 02.05 | Generic `largest`, then make it work for `&str` |
| 12 | Error handling | 02.07 | A CLI with `thiserror` in a lib and `anyhow` in the bin |
| 13 | Modules | 02.08 | Split a single-file program into `lib.rs` + modules + a second binary |
| 14 | Review | — | Refactor your day-12 CLI: no `unwrap()`, `&[T]` not `&Vec<T>` |

## Week 3 — Ecosystem and real code

| Day | Topic | Read | Build |
| --- | --- | --- | --- |
| 15 | Testing | 03.03 | Unit + integration + doc tests for the day-12 CLI |
| 16 | Smart pointers | 02.09 | `Rc<RefCell<T>>` tree; break a cycle with `Weak` |
| 17 | Threads | 02.10 | Bounded worker pool with `thread::scope` |
| 18 | rayon | 02.10 | Parallel word count; measure the speedup |
| 19 | Cargo in depth | 03.01 | Add profiles, a workspace, `sccache`; measure build time |
| 20 | Clippy + fmt + CI | 03.04 | Get `clippy -D warnings` green; add a GitHub Actions workflow |
| 21 | CLI tool | 04.01 | `clap` tool with subcommands, exit codes, `assert_cmd` tests |

## Week 4 — Async and a real service

| Day | Topic | Read | Build |
| --- | --- | --- | --- |
| 22 | Async basics | 02.11 | `join!` vs sequential; measure the difference |
| 23 | Async pitfalls | 02.11 | Reproduce a blocked executor, then fix it |
| 24 | Axum | 04.02 | Two routes, a JSON handler, an error type with `IntoResponse` |
| 25 | SQLx | 04.03 | A migration, `query_as!`, and a `sqlx::test` integration test |
| 26 | Auth + validation | 04.02 | A `FromRequestParts` extractor and a validated newtype |
| 27 | Background jobs | 04.04 | The Postgres queue: claim, complete, fail, retry |
| 28 | Observability | 03.06 | `tracing` with JSON, `/healthz`, `/readyz`, `/metrics` |
| 29 | Capstone | 05.01–05.02 | Wire the API together end to end |
| 30 | Ship it | 05.04 | Multi-stage Docker image, Compose stack, graceful shutdown |

## The daily loop

```bash
$ cargo new day_07 --bin
$ cd day_07
$ cargo add ...
# write code
$ cargo check          # constantly
$ cargo clippy -- -D warnings
$ cargo fmt
$ cargo test
```

Ten minutes at the end of each day: write down what surprised you. That is where
the learning consolidates.

## Milestones to check yourself against

| After | You should be able to |
| --- | --- |
| Day 7 | Write a 100-line program with structs, enums and a `HashMap` |
| Day 14 | Explain every borrow error you hit, and fix it without `clone()` |
| Day 21 | Ship a CLI tool with tests, CI and a release binary |
| Day 30 | Deploy a small async service with a database, a queue and metrics |

## If you have less time

A compressed 10-day version, keeping only the load-bearing parts:

1. 01.02 + 02.01 + 02.02 — get productive
2. 02.03 — ownership (do not compress this one)
3. 02.04 + 02.06 — data and collections
4. 02.05 — traits
5. 02.07 — errors
6. 03.03 — testing
7. 02.11 — async
8. 04.02 — Axum
9. 04.03 — SQLx
10. 05.04 — deploy

## Common ways people stall

| Stall | Fix |
| --- | --- |
| Fighting the borrow checker for days | Re-read 02.03, then write the smallest reproducing example and ask "who owns this?" |
| Copying code without typing it | Type it. The muscle memory is the point |
| Avoiding `async` because it is confusing | Do day 22. It clicks after you break it once |
| Trying to build a huge project on day 3 | Build small things that finish |
| Reading three books and writing no code | One book, and code every day |
| Giving up at the first `Pin` error | Nobody understands `Pin` on day one. Skip it, come back |
