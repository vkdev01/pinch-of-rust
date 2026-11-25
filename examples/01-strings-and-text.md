---
summary: Twelve text problems you will actually hit — parsing, unicode, splitting, formatting — each with the code and the trap.
level: Beginner
time: 15 min
tags: [strings, parsing, text]
---

# Strings and text

Every recipe is a real problem with the code that solves it and the trap that
catches people.

## Parse `key=value` pairs without allocating

```rust
use std::collections::HashMap;

fn parse_kv(input: &str) -> HashMap<&str, &str> {
    input
        .lines()
        .filter(|l| !l.trim_start().starts_with('#') && !l.trim().is_empty())
        .filter_map(|l| l.split_once('='))
        .map(|(k, v)| (k.trim(), v.trim()))
        .collect()
}

let cfg = parse_kv("host = 0.0.0.0\nport=8080\n# comment\ndebug=true");
assert_eq!(cfg["port"], "8080");
```

The keys borrow from `input`, so the whole map costs one allocation (the map
itself). `split_once` is `O(n)` once, unlike `split('=').collect::<Vec<_>>()`.

> **Trap:** `split('=')` silently loses everything after a second `=`. A password
> containing `=` breaks the naive version.

## Split a line into typed values

```rust
#[derive(Debug, PartialEq)]
struct LogLine<'a> { level: &'a str, path: &'a str, ms: u64 }
```

```rust
fn parse_line(line: &str) -> Option<LogLine<'_>> {
    let mut it = line.split('\t');
    let level = it.next()?;
    let path = it.next()?;
    let ms = it.next()?.parse().ok()?;
    Some(LogLine { level, path, ms })
}

assert_eq!(
    parse_line("INFO\t/api/users\t12"),
    Some(LogLine { level: "INFO", path: "/api/users", ms: 12 })
);
```

`?` on `Option` inside a function returning `Option` is the whole error strategy
for parsers like this.

## Count characters, not bytes

```rust
let s = "नमस्ते";
assert_eq!(s.len(), 18);              // bytes: each Devanagari char is 3 bytes
assert_eq!(s.chars().count(), 6);     // scalar values
```

> **Trap:** even `chars()` is not "user-perceived characters". `"👍🏽"` is two chars
> (emoji + skin tone). If you need grapheme clusters, use the `unicode-segmentation`
> crate.

## Truncate a string safely

```rust
fn truncate(s: &str, max_chars: usize) -> &str {
    match s.char_indices().nth(max_chars) {
        Some((idx, _)) => &s[..idx],
        None => s,
    }
}

assert_eq!(truncate("héllo", 2), "hé");
// truncate("héllo", 2) with &s[..2] would PANIC: byte 2 is mid-character
```

## Case-insensitive comparison without allocating

```rust
assert!("Straße".to_lowercase() == "strasse");   // false! ß ≠ ss in simple case folding
assert!(matches_ignore_case("Hello", "hELLo"));

fn matches_ignore_case(a: &str, b: &str) -> bool {
    a.chars().flat_map(char::to_lowercase).eq(b.chars().flat_map(char::to_lowercase))
}
```

For real international case folding use `unicase` — simple lowercase is not the
same operation.

## Replace many patterns in one pass

```rust
use std::borrow::Cow;

fn sanitise(input: &str) -> Cow<'_, str> {
    if !input.contains(['<', '>', '&', '"']) {
        return Cow::Borrowed(input);       // the common case allocates nothing
    }
    let mut out = String::with_capacity(input.len() + 16);
    for c in input.chars() {
        match c {
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '&' => out.push_str("&amp;"),
            '"' => out.push_str("&quot;"),
            _ => out.push(c),
        }
    }
    Cow::Owned(out)
}
```

`Cow` is the right return type for "usually unchanged" transformations. `serde`,
`regex` and `url` all use it for exactly this.

## Join with a separator without the trailing comma

```rust
let items = ["a", "b", "c"];
assert_eq!(items.join(", "), "a, b, c");

// for non-string items
let nums = [1, 2, 3];
let s: String = nums.iter().map(|n| n.to_string()).collect::<Vec<_>>().join("|");
```

## Format a table that lines up

```rust
println!("{:<10} {:>8} {:>10}", "name", "count", "bytes");
for (n, c, b) in rows {
    println!("{n:<10} {c:>8} {b:>10}");
}
```

Width specifiers (`{:<10}`, `{:>8}`, `{:^6}`) are the whole table library. For
Unicode text, pad by grapheme count, not `{:10}` — the width specifier counts
chars, and wide CJK characters count as one.

## Read a whole file as lines without a trailing empty line

```rust
let text = std::fs::read_to_string("data.txt")?;
for line in text.lines() {          // strips \r\n and \n, no empty tail
    println!("{line}");
}
// text.split('\n') would leave a trailing "" — this is the difference
```

## The one-line check people forget

```rust
if input.trim().is_empty() {
    return Err(Error::Empty);       // " " and "\n\t" are not valid input
}
```

## Escape a string for a shell command

```rust
// do not build shell strings; pass arguments as a list
let output = std::process::Command::new("git")
    .args(["commit", "-m", message])   // no quoting, no injection
    .output()?;
```

> **Trap:** `format!("git commit -m '{}'", msg)` breaks on any message containing
> an apostrophe, and is a command-injection hole. `Command` with separate args is
> the only correct form.

**Next:** [Files and I/O](02-files-and-io.md)
