---
summary: The command-line renaissance — ripgrep, uv, Deno, swc — and why every fast tool you use is now written in Rust.
level: Beginner
time: 20 min
tags: [cli, tooling, performance]
---

# Developer tools

The most visible Rust success story is the one you use every day: the tools in
your terminal got faster, and most of them got faster by being rewritten in Rust.

## What the domain demands

| Requirement | Consequence |
| --- | --- |
| Sub-50 ms startup | A tool you run 500 times a day must not think |
| No runtime to install | A single static binary — download, run, done |
| Correct on weird input | UTF-8, CRLF, symlinks, 4 GB files, no trailing newline |
| Composable | stdin/stdout, exit codes, `NO_COLOR`, `--json` |
| Cross-platform | The same binary on macOS, Linux, Windows, ARM |

Startup time is the constraint that kills interpreted tools. A 300 ms JVM start
is fine for a server and fatal for a linter.

## Who runs it

| Tool | Replaced | The number |
| --- | --- | --- |
| **ripgrep** | `grep -r`, `ag` | often 2–10× faster, respects `.gitignore` by default |
| **fd** | `find` | simpler syntax, parallel traversal |
| **bat** | `cat` | syntax highlighting with a `cat`-compatible interface |
| **uv** | `pip` + `virtualenv` | Astral's package manager; installs that took a minute finish in a second |
| **Deno** | Node.js | Rust host embedding V8, with a capability-secure stdlib |
| **swc** | Babel | a JS/TS compiler in Rust, used by Next.js |
| **Turbopack** | webpack | Vercel's incremental bundler |
| **Biome** | ESLint + Prettier | one Rust binary doing lint and format |
| **zoxide, starship, hyperfine, delta** | assorted shell tools | startup budgets measured in single-digit milliseconds |

Notice the pattern: **a better interface was not enough; the tools had to be
faster.** ripgrep did not win by adding features to grep — it won by being
responsive on a monorepo.

## The shape of the code

The core of a fast file walker, using the same crate ripgrep uses:

```rust
use ignore::WalkBuilder;
use std::sync::atomic::{AtomicUsize, Ordering};

fn main() -> anyhow::Result<()> {
    let root = std::env::args().nth(1).unwrap_or_else(|| ".".into());
    let count = AtomicUsize::new(0);

    WalkBuilder::new(&root)
        .standard_filters(true)      // .gitignore, hidden files, symlinks
        .threads(num_cpus())         // parallel directory traversal
        .build_parallel()
        .run(|| {
            Box::new(|entry| {
                if let Ok(e) = entry {
                    if e.file_type().is_some_and(|t| t.is_file()) {
                        count.fetch_add(1, Ordering::Relaxed);
                    }
                }
                ignore::WalkState::Continue
            })
        });

    println!("{} files", count.load(Ordering::Relaxed));
    Ok(())
}

fn num_cpus() -> usize {
    std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1)
}
```

`build_parallel` plus a closure factory looks odd until you see why: the `run`
argument is called once per worker thread, so each thread gets its own closure
with its own state. That is how you parallelise without a mutex.

## The rules that make a tool feel professional

```rust
use std::io::IsTerminal;

// 1. colour only when a human is watching
let colour = std::io::stdout().is_terminal() && std::env::var_os("NO_COLOR").is_none();

// 2. data on stdout, everything else on stderr
eprintln!("scanning {} files…", n);   // progress
println!("{json}");                    // data

// 3. exit codes that scripts can branch on
//    0 = success, 1 = "no match" (not an error), 2 = real error
std::process::ExitCode::from(if hits > 0 { 0 } else { 1 });
```

Those three lines are the difference between a tool that composes and a tool that
has to be babysat.

## What to steal for your own project

1. **Budget the startup.** `hyperfine './target/release/tool --help'` — if it is
   over 20 ms, something is doing work at startup that should be lazy.
2. **Ship one static binary.** `--target x86_64-unknown-linux-musl` removes glibc
   from the equation entirely.
3. **Respect the conventions you inherited**: `--help`, `--version`, `-q`, `-v`,
   `--json`, `NO_COLOR`, stdin when no file is given. Users have muscle memory.

## Where Rust is the wrong answer

- A tool that spends 95% of its time waiting on an HTTP API — the language is
  irrelevant, use whatever ships fastest.
- Plugins: a Rust tool with a Rust-only plugin API has a much smaller plugin
  ecosystem than one with a scripting language. (This is why several Rust tools
  embed Lua or WASM for extensions.)

## Try it

Run `hyperfine --warmup 3 'grep -r TODO src' 'rg TODO src'` on any repo over
50 MB. Then read ripgrep's `searcher` crate — it is the best example in the
ecosystem of turning a simple idea into a fast one without making it unreadable.

**Next:** [Data and streaming](03-data-and-streaming.md)
