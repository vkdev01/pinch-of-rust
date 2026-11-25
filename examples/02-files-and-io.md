---
summary: Reading, writing, walking and watching — the file recipes that avoid the classic performance and durability traps.
level: Beginner
time: 15 min
tags: [files, io, performance]
---

# Files and I/O

## Read a file, three ways

```rust
// 1. whole file as a String — simplest, needs UTF-8
let text = std::fs::read_to_string("a.txt")?;

// 2. whole file as bytes — works for anything
let bytes = std::fs::read("a.bin")?;

// 3. line by line — constant memory for a 10 GB file
use std::io::{BufRead, BufReader};
let f = BufReader::new(std::fs::File::open("big.log")?);
for line in f.lines() {
    let line = line?;
    process(&line);
}
```

> **Trap:** `File::read_to_string` with no `BufReader` issues one syscall per byte
> read in some patterns. `BufReader` batches; it is usually a 10–100× difference.

## Write a file atomically

A crash mid-write must not leave a half-file.

```rust
use std::io::Write;

fn write_atomic(path: &str, contents: &[u8]) -> std::io::Result<()> {
    let tmp = format!("{path}.tmp");
    {
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(contents)?;
        f.sync_all()?;               // durability before the rename
    }
    std::fs::rename(&tmp, path)?;    // atomic on POSIX and NTFS
    Ok(())
}
```

`rename` is atomic within a filesystem, so a reader sees either the old file or
the new one — never a partial one.

## Append to a log without reopening

```rust
use std::fs::OpenOptions;

let mut f = OpenOptions::new().create(true).append(true).open("app.log")?;
writeln!(f, "{ts} started")?;
```

`append(true)` is atomic for small writes across processes on POSIX — two
processes appending will not interleave mid-line.

## Walk a directory tree

```rust
use walkdir::WalkDir;

for entry in WalkDir::new("src").into_iter().filter_map(Result::ok) {
    if entry.file_type().is_file() && entry.path().extension() == Some("rs".as_ref()) {
        println!("{}", entry.path().display());
    }
}
```

For gitignore-aware walking use `ignore::WalkBuilder` (module 04.01) — it is what
ripgrep and fd use, and it parallelises.

## Copy a file efficiently

```rust
let bytes = std::io::copy(&mut std::fs::File::open("in")?, &mut std::fs::File::create("out")?)?;
// std::io::copy uses copy_file_range/sendfile where available
```

## Get a temp directory that cleans itself up

```rust
let dir = tempfile::tempdir()?;          // removed on drop, even on panic
let path = dir.path().join("out.txt");
std::fs::write(&path, b"hi")?;
```

## Stream a large CSV row by row

```rust
use csv::ReaderBuilder;

let mut rdr = ReaderBuilder::new()
    .has_headers(true)
    .from_path("data.csv")?;

for result in rdr.deserialize::<Row>() {
    let row: Row = result?;
    // constant memory, regardless of file size
}
```

## Write a compressed file

```rust
use flate2::write::GzEncoder;
use flate2::Compression;

let f = std::fs::File::create("out.gz")?;
let mut enc = GzEncoder::new(f, Compression::default());
enc.write_all(b"hello")?;
enc.finish()?;                          // must be called: it writes the trailer
```

## Watch a file for changes

```rust
use notify::{Watcher, RecursiveMode, recommended_watcher};

let mut watcher = recommended_watcher(|res: notify::Result<notify::Event>| {
    if let Ok(event) = res {
        println!("{:?}", event.paths);
    }
})?;
watcher.watch("src".as_ref(), RecursiveMode::Recursive)?;
std::thread::park();
```

> **Trap:** editors write files by replacing them, which fires a `Remove` +
> `Create` rather than a `Modify`. Debounce by timestamp, not by event kind.

## Check before you overwrite

```rust
use std::path::Path;

if Path::new("out.csv").exists() && !force {
    return Err(Error::WouldOverwrite("out.csv".into()));
}
```

Silently clobbering a user's file is the most common CLI sin. Ask, or require a
flag.

## Paths, not string concatenation

```rust
use std::path::PathBuf;

let mut p = PathBuf::from("/tmp");
p.push("logs");
p.push("app.log");                 // correct separator on every OS
assert!(p.ends_with("logs/app.log") || cfg!(windows));
```

`format!("{dir}/{}", name)` breaks on Windows and on paths that already end with a
separator. `PathBuf::push` handles both.

**Next:** [HTTP and JSON](03-http-and-json.md)
