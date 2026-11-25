# 01 · Command-Line Tools

CLI tools are Rust's home turf: a single static binary, no runtime, startup in
microseconds, and a dependency ecosystem built for exactly this.

## The stack

```toml
[package]
name = "mytool"
version = "0.1.0"
edition = "2021"
rust-version = "1.75"

[dependencies]
clap = { version = "4", features = ["derive", "env", "wrap_help"] }
anyhow = "1"
serde = { version = "1", features = ["derive"] }
toml = "0.8"
indicatif = "0.17"
console = "0.15"
walkdir = "2"
regex = "1"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }

[dev-dependencies]
assert_cmd = "2"
predicates = "3"
tempfile = "3"
```

| Crate | Role |
| --- | --- |
| `clap` | argument parsing, help, completions |
| `anyhow` | error reporting at the top level |
| `indicatif` | progress bars |
| `console` | colours, terminal width, spinners |
| `assert_cmd` + `predicates` | end-to-end CLI testing |
| `tempfile` | isolated test directories |

## Full example: a file search tool

```rust
// src/main.rs
use anyhow::{Context, Result};
use clap::{Parser, Subcommand, ValueEnum};
use std::path::PathBuf;
use std::process::ExitCode;
use walkdir::WalkDir;

#[derive(Parser, Debug)]
#[command(
    name = "findstr",
    version,
    about = "Search files for a pattern",
    long_about = None,
    arg_required_else_help = true
)]
struct Cli {
    /// Print more detail
    #[arg(short, long, global = true, action = clap::ArgAction::Count)]
    verbose: u8,

    /// Disable coloured output
    #[arg(long, global = true, env = "NO_COLOR")]
    no_color: bool,

    #[command(subcommand)]
    cmd: Command,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// Search for a pattern in files
    Search {
        /// Regular expression
        pattern: String,

        /// Directory to search
        #[arg(default_value = ".")]
        dir: PathBuf,

        /// File extensions to include (repeatable)
        #[arg(short = 'e', long = "ext")]
        extensions: Vec<String>,

        /// Skip files larger than this many bytes
        #[arg(long, default_value_t = 10 * 1024 * 1024)]
        max_size: u64,

        /// Output format
        #[arg(long, value_enum, default_value_t = Format::Text)]
        format: Format,
    },
}

#[derive(ValueEnum, Clone, Copy, Debug, PartialEq)]
enum Format {
    Text,
    Json,
}

#[derive(serde::Serialize)]
struct Hit {
    path: String,
    line: usize,
    text: String,
}

fn main() -> ExitCode {
    let cli = Cli::parse();

    let level = match cli.verbose {
        0 => "warn",
        1 => "info",
        _ => "debug",
    };
    tracing_subscriber::fmt()
        .with_env_filter(level)
        .with_target(false)
        .without_time()
        .init();

    match run(cli) {
        Ok(found) if found == 0 => ExitCode::from(1),   // like grep: 1 = no match
        Ok(_) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("error: {e:#}");
            ExitCode::from(2)
        }
    }
}

fn run(cli: Cli) -> Result<usize> {
    match cli.cmd {
        Command::Search { pattern, dir, extensions, max_size, format } => {
            let re = regex::Regex::new(&pattern)
                .with_context(|| format!("invalid regex `{pattern}`"))?;

            let mut hits = 0usize;
            let bar = indicatif::ProgressBar::new_spinner();
            bar.enable_steady_tick(std::time::Duration::from_millis(100));

            for entry in WalkDir::new(&dir)
                .follow_links(false)
                .into_iter()
                .filter_map(Result::ok)
                .filter(|e| e.file_type().is_file())
            {
                let path = entry.path();

                if !extensions.is_empty() {
                    let ok = path
                        .extension()
                        .and_then(|e| e.to_str())
                        .is_some_and(|e| extensions.iter().any(|x| x == e));
                    if !ok { continue; }
                }

                let meta = entry.metadata()?;
                if meta.len() > max_size { continue; }

                let Ok(text) = std::fs::read_to_string(path) else { continue };

                for (i, line) in text.lines().enumerate() {
                    if re.is_match(line) {
                        hits += 1;
                        match format {
                            Format::Text => {
                                println!("{}:{}: {}", path.display(), i + 1, line.trim());
                            }
                            Format::Json => {
                                let hit = Hit {
                                    path: path.display().to_string(),
                                    line: i + 1,
                                    text: line.trim().to_string(),
                                };
                                println!("{}", serde_json::to_string(&hit)?);
                            }
                        }
                    }
                }
            }

            bar.finish_and_clear();
            Ok(hits)
        }
    }
}
```

Note the exit codes: `0` found, `1` not found, `2` error. That is the convention
every shell script and CI system expects, and getting it wrong breaks pipelines
silently.

## Argument parsing patterns

### Env var fallback

```rust
#[arg(long, env = "MYTOOL_TOKEN", hide_env_values = true)]
token: Option<String>,
```

`hide_env_values` keeps secrets out of `--help` output and error messages.

### Mutually exclusive flags

```rust
#[arg(long, conflicts_with = "json")]
yaml: bool,
```

### Validation at parse time

```rust
#[arg(long, value_parser = clap::value_parser!(u16).range(1..=65535))]
port: u16,
```

### Reading from stdin when no file is given

```rust
use std::io::{self, Read};

fn read_input(path: Option<PathBuf>) -> anyhow::Result<String> {
    match path {
        Some(p) => Ok(std::fs::read_to_string(p)?),
        None if !io::stdin().is_terminal() => {
            let mut s = String::new();
            io::stdin().read_to_string(&mut s)?;
            Ok(s)
        }
        None => anyhow::bail!("no input file and stdin is a terminal"),
    }
}
```

This is what makes a tool composable in a pipeline: `cat x | mytool`.

### Shell completions

```rust
use clap::CommandFactory;
use clap_complete::{generate, Shell};

fn print_completions(shell: Shell, cmd: &mut clap::Command) {
    generate(shell, cmd, cmd.get_name().to_string(), &mut std::io::stdout());
}
```

```bash
$ mytool completions bash > /etc/bash_completion.d/mytool
```

## Progress and output

```rust
use indicatif::{ProgressBar, ProgressStyle};

let bar = ProgressBar::new(files.len() as u64);
bar.set_style(
    ProgressStyle::with_template("{spinner:.green} [{bar:40.cyan/blue}] {pos}/{len} {msg}")
        .unwrap()
        .progress_chars("=>-"),
);
for f in &files {
    bar.set_message(f.display().to_string());
    process(f)?;
    bar.inc(1);
}
bar.finish_with_message("done");
```

```rust
use console::style;
println!("{} {}", style("ok").green().bold(), path.display());
println!("{} {}", style("error").red(), msg);
```

> **Gotcha:** write progress to **stderr** and data to **stdout**. Otherwise
> `mytool > out.json` fills the file with progress bar escape codes.

Detect whether colour is appropriate:

```rust
use std::io::IsTerminal;
let colour = std::io::stdout().is_terminal() && std::env::var("NO_COLOR").is_err();
```

Respect the `NO_COLOR` convention — it is a real standard and users expect it.

## Signal handling and clean shutdown

```toml
tokio = { version = "1", features = ["signal", "macros", "rt-multi-thread"] }
```

```rust
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tokio::select! {
        r = run() => r,
        _ = tokio::signal::ctrl_c() => {
            eprintln!("interrupted");
            Ok(())
        }
    }
}
```

For long-running work, write output atomically: write to `out.tmp` then
`fs::rename` — a rename is atomic on POSIX, so a Ctrl-C never leaves a
half-written file.

## Testing a CLI

```rust
// tests/cli.rs
use assert_cmd::Command;
use predicates::prelude::*;

#[test]
fn prints_help() {
    Command::cargo_bin("mytool").unwrap()
        .arg("--help")
        .assert()
        .success()
        .stdout(predicate::str::contains("Search files"));
}

#[test]
fn exits_1_when_no_match() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("a.txt"), "hello").unwrap();

    Command::cargo_bin("mytool").unwrap()
        .args(["search", "zzz", dir.path().to_str().unwrap()])
        .assert()
        .code(1);
}

#[test]
fn finds_a_match() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("a.txt"), "hello world").unwrap();

    Command::cargo_bin("mytool").unwrap()
        .args(["search", "world", dir.path().to_str().unwrap()])
        .assert()
        .success()
        .stdout(predicate::str::contains("hello world"));
}
```

`assert_cmd` runs the real binary — the only way to test exit codes, stdout and
stderr together.

## Distribution

```bash
# static Linux binary that runs anywhere
$ cargo build --release --target x86_64-unknown-linux-musl

# Homebrew tap
$ cargo install --path .

# crates.io
$ cargo publish
```

For cross-platform releases, `cargo-dist` generates the GitHub Actions workflow
and installers:

```bash
$ cargo install cargo-dist
$ cargo dist init
$ cargo dist build
```

## Real-world Rust CLIs worth reading

| Tool | Why read it |
| --- | --- |
| `ripgrep` | the benchmark for fast, correct CLI design |
| `fd` | simple, excellent clap usage |
| `bat` | output formatting and terminal handling |
| `hyperfine` | benchmarking with good UX |
| `zoxide` | shell integration done well |
| `starship` | performance under a strict startup budget |

---

## Exercises

1. Build the `findstr` tool above and add a `--count` flag that prints only the
   number of matches.
2. Add `--json` output that emits one array instead of JSONL. Which is better
   for `jq`? For streaming?
3. Make it respect `.gitignore` using the `ignore` crate (the one ripgrep uses).
4. Add a progress bar on stderr and verify `mytool > out.txt` produces clean
   output.
5. Add a `--exclude` glob flag and tests for it with `assert_cmd`.
6. Add Ctrl-C handling that leaves no partial output file.

**Next:** [Web APIs with Axum](02-web-api-axum.md)
