# Rust — The Complete Learning Path

**Read the course online: <https://vkdev01.github.io/pinch-of-rust/>**

The site in `site/` is a Next.js App Router app (Tailwind CSS v4 + HeroUI v3)
that renders these markdown files at build time. Run it locally with
`cd site && npm install && npm run dev`; `npm run build` emits a static site
that GitHub Actions deploys to Pages.

Everything below is the same content in plain markdown, one file per lesson.
Alongside the six modules there are three more collections:

- `projects/` — eight buildable projects with milestones, crates and demo checklists
- `use-cases/` — where Rust runs in production: cloud, devtools, data, fintech, embedded, web, HFT, desktop
- `examples/` — task-shaped recipes: problem, code, trap

---

A structured, project-driven course in Rust: the language, the toolchain, the
ecosystem, and the things people actually ship with it.

Everything here is written to be **read in order once, then used as a reference
forever**. Every module has runnable code, the errors you will actually hit, and
the reasoning behind the design of the language.

---

## Who this is for

| You are | Start at | Skip |
| --- | --- | --- |
| New to systems programming | Module 01 | nothing |
| Coming from Python / JS / Go | Module 01, skim 02.01–02.02 | — |
| Coming from C / C++ | Module 02.03 (Ownership) | 02.01, 02.02 |
| Here to build a web service | 01 → 02.03 → 02.11 → 04.02 | 04.06, 04.07 |
| Here to build a CLI tool | 01 → 02.03 → 03.01 → 04.01 | — |

No prior Rust needed. Comfort with any programming language is assumed.

---

## The path

### Module 01 — Getting started
Set up the toolchain the way professionals do, and understand what `cargo`
is doing on your behalf.

1. [Install and toolchain](01-getting-started/01-install-and-toolchain.md)
2. [Hello, Cargo — your first project](01-getting-started/02-hello-cargo.md)
3. [Project layout and workspaces](01-getting-started/03-project-layout-workspaces.md)

### Module 02 — The language
The core. Ownership is the part that makes Rust Rust; everything else is
downstream of it.

1. [Variables, types, mutability](02-language/01-variables-types-mutability.md)
2. [Functions and control flow](02-language/02-functions-control-flow.md)
3. [Ownership, borrowing, lifetimes](02-language/03-ownership-borrowing-lifetimes.md)
4. [Structs, enums, pattern matching](02-language/04-structs-enums-patterns.md)
5. [Traits and generics](02-language/05-traits-generics.md)
6. [Collections and iterators](02-language/06-collections-iterators.md)
7. [Error handling](02-language/07-error-handling.md)
8. [Modules, crates, packages](02-language/08-modules-crates.md)
9. [Smart pointers and interior mutability](02-language/09-smart-pointers-interior-mutability.md)
10. [Concurrency](02-language/10-concurrency.md)
11. [Async / await](02-language/11-async-await.md)
12. [Macros](02-language/12-macros.md)

### Module 03 — The ecosystem and the build
How real Rust projects are built, tested, measured and shipped.

1. [Cargo in depth](03-ecosystem/01-cargo-deep-dive.md)
2. [The library tour](03-ecosystem/02-library-tour.md)
3. [Testing and benchmarking](03-ecosystem/03-testing.md)
4. [Tooling and CI](03-ecosystem/04-tooling-ci.md)
5. [Performance and profiling](03-ecosystem/05-performance-profiling.md)
6. [Observability: logs, metrics, traces](03-ecosystem/06-observability.md)

### Module 04 — Real-world use cases
Eight domains, each with a working skeleton and the crates that matter.

1. [Command-line tools](04-real-world/01-cli-tool.md)
2. [Web APIs with Axum](04-real-world/02-web-api-axum.md)
3. [Databases with SQLx](04-real-world/03-database-sqlx.md)
4. [Background jobs and queues](04-real-world/04-background-jobs.md)
5. [WebAssembly in the browser](04-real-world/05-wasm.md)
6. [Embedded and IoT](04-real-world/06-embedded.md)
7. [Game development with Bevy](04-real-world/07-gamedev-bevy.md)
8. [Data pipelines and stream processing](04-real-world/08-data-pipelines.md)

### Module 05 — Capstone: a real SaaS service
An end-to-end build: Rust API + Postgres + background worker + Next.js
dashboard. This is the "project repo".

1. [Brief and architecture](05-capstone/01-brief-and-architecture.md)
2. [Building the Rust API](05-capstone/02-rust-api-build.md)
3. [The dashboard frontend](05-capstone/03-frontend-dashboard.md)
4. [Deployment](05-capstone/04-deploy.md)

### Module 06 — Reference
1. [Cheat sheet](06-reference/01-cheatsheet.md)
2. [Common errors, decoded](06-reference/02-common-errors.md)
3. [Interview questions with answers](06-reference/03-interview.md)
4. [A 30-day study plan](06-reference/04-30-day-plan.md)
5. [Resources worth your time](06-reference/05-resources.md)

### Module 07 — Data structures & algorithms
1. [Complexity, measured](07-dsa/01-complexity-and-measurement.md)
2. [Arrays, slices and the cache](07-dsa/02-arrays-and-cache.md)
3. [Linked structures, and why you rarely want them](07-dsa/03-linked-structures.md)
4. [Stacks, queues and ring buffers](07-dsa/04-stacks-queues.md)
5. [Hashing and maps](07-dsa/05-hashing.md)
6. [Trees and ordered maps](07-dsa/06-trees.md)
7. [Heaps and priority queues](07-dsa/07-heaps.md)
8. [Graphs](07-dsa/08-graphs.md)
9. [Sorting and selection](07-dsa/09-sorting.md)

### Module 08 — Concurrency in practice
1. [Threads and pools](08-concurrency/01-threads-and-pools.md)
2. [Synchronisation primitives](08-concurrency/02-synchronisation.md)
3. [Atomics and memory ordering](08-concurrency/03-atomics.md)
4. [Lock-free structures](08-concurrency/04-lock-free.md)
5. [Parallel data patterns](08-concurrency/05-parallel-patterns.md)

### Module 09 — Design & architecture
1. [Designing a Rust API](09-design/01-api-design.md)
2. [Architecture and boundaries](09-design/02-architecture.md)
3. [Designing for testability](09-design/03-testability.md)
4. [Concurrency architecture](09-design/04-concurrency-architecture.md)
5. [System design, in Rust](09-design/05-system-design.md)

---

## How to use this material

**Read with a terminal open.** Type the examples; do not copy them. Rust's
compiler is the best teacher in the ecosystem and it only teaches you when it
rejects *your* code.

**Do the exercises.** Each module ends with a short set. They are small on
purpose — the point is to force a compiler error you then have to reason about.

**Read the errors.** Rust error messages are unusually good: they name the
problem, point at both locations involved, and frequently print the exact fix.
Learning to read `error[E0382]` fluently is a real skill and it is worth more
than memorising syntax.

**Do not fight the borrow checker with `clone()`.** When you hit a borrow error,
the question is always "who should own this?" — not "how do I silence this?".
`clone()` and `Rc<RefCell<T>>` are legitimate tools; using them to avoid
thinking is how people end up writing slow Rust that feels like Java.

---

## What Rust is good at, honestly

**Genuinely excellent:** CLI tools, network services, parsers and compilers,
embedded firmware, WebAssembly, anything where you need C-level performance
with memory safety, and anything that must run for months without leaking.

**Good, with more work:** game development (Bevy is young but real), GUI
desktop apps (the ecosystem is fragmented), machine learning (use Python to
train, Rust to serve), rapid prototyping (compile times and strictness slow you
down early).

**Not the tool:** throwaway scripts, heavy data exploration, anything where the
library ecosystem you need exists only in Python.

---

## Conventions used here

- Code blocks are labelled with a language: `rust`, `toml`, `bash`, `sql`, `tsx`.
- `$` at the start of a shell line means "run this in your terminal".
- **Bold lead-ins in blockquotes** mark a gotcha, a rule of thumb, or a common trap.
- Version numbers are the ones stable at the time of writing. Crate APIs move;
  the compiler and `cargo doc` are the final authority.
- The capstone's code lives in `capstone/` alongside this file.
