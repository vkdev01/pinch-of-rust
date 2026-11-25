# 02 · Functions and Control Flow

Rust control flow is expression-oriented: `if`, `match`, and blocks all produce
values. This removes a whole category of ceremony.

## Functions

```rust
fn add(a: i32, b: i32) -> i32 {
    a + b          // last expression is the return value — no semicolon
}

fn early(x: i32) -> i32 {
    if x < 0 {
        return 0;  // explicit return exits early
    }
    x * 2
}
```

> **Gotcha:** a trailing semicolon turns the expression into a statement
> returning `()`. `fn f() -> i32 { a + b; }` fails with
> `error[E0308]: mismatched types` and a note "expected `i32`, found `()`". This
> is the single most common beginner error in Rust.

### Everything is an expression

```rust
let x = if true { 1 } else { 2 };        // if is an expression

let y = match x {
    1 => "one",
    _ => "other",
};                                       // match is an expression

let z = {
    let a = 2;
    let b = 3;
    a * b                                // block is an expression
};

let () = ();                             // unit
```

All arms of an `if`-expression must have the same type:

```rust
let x = if cond { 1 } else { "two" };    // error[E0308]
```

### Functions that never return

```rust
fn fatal(msg: &str) -> ! {          // `!` = never type
    eprintln!("{msg}");
    std::process::exit(1);
}
```

`!` coerces to any type, which is why `panic!()` works in a `match` arm that
must produce `i32`.

## `if` / `else if` / `else`

```rust
let temp = 38;
if temp > 40 {
    println!("scorching");
} else if temp > 30 {
    println!("hot");
} else {
    println!("fine");
}
```

No parentheses around the condition, braces always required (even for one line).

## Loops

```rust
// loop — infinite, can return a value
let mut n = 0;
let found = loop {
    n += 1;
    if n * n > 100 { break n; }     // break with a value
};

// while
let mut i = 3;
while i > 0 {
    println!("{i}");
    i -= 1;
}

// for — the idiomatic one
for i in 0..3 { println!("{i}"); }          // 0,1,2  (exclusive)
for i in 0..=3 { println!("{i}"); }         // 0,1,2,3 (inclusive)
for item in &vec { println!("{item}"); }    // iterate by reference
for (idx, item) in vec.iter().enumerate() { }
for _ in 0..10 { }                          // `_` = ignore the value
```

`for` works on anything implementing `IntoIterator`. Prefer it over `while` with
an index — it cannot go out of bounds and it is faster (no bounds checks).

### Loop labels

```rust
'outer: for i in 0..5 {
    for j in 0..5 {
        if i * j == 6 {
            break 'outer;      // break the outer loop, not the inner
        }
        if j == 3 { continue 'outer; }
    }
}
```

Labels are `'name:` before the loop, `break 'name` / `continue 'name` inside.

## `match`

```rust
let n = 7;
match n {
    0 => println!("zero"),
    1 | 2 => println!("small"),        // or-pattern
    3..=9 => println!("medium"),       // range pattern
    x if x < 0 => println!("negative {x}"),  // guard
    other => println!("big {other}"),  // binding catch-all
}
```

`match` is **exhaustive**: the compiler proves every case is handled. Forgetting
a variant of an enum is a compile error, which means adding a variant to an enum
shows you every place that needs updating. This is the single biggest
maintainability win in the language.

### Matching structs and tuples

```rust
struct Point { x: i32, y: i32 }

let p = Point { x: 0, y: 5 };
match p {
    Point { x: 0, y: 0 } => println!("origin"),
    Point { x: 0, y } => println!("on y-axis at {y}"),
    Point { x, y: 0 } => println!("on x-axis at {x}"),
    Point { x, y } => println!("({x}, {y})"),
}

let pair = (1, "a");
match pair {
    (1, s) => println!("one and {s}"),
    (n, _) => println!("{n}"),
}
```

### `@` bindings and `ref`

```rust
match 42 {
    n @ 1..=50 => println!("in range: {n}"),   // bind AND test
    _ => {}
}

// match on a reference does not move: match ergonomics handle it
let s = Some(String::from("hi"));
match &s {
    Some(v) => println!("{v}"),   // v: &String
    None => {}
}
```

### `match` on `Option` and `Result`

```rust
let maybe: Option<i32> = Some(3);
match maybe {
    Some(n) if n > 2 => println!("big {n}"),
    Some(_) => println!("small"),
    None => println!("nothing"),
}
```

## `if let` and `let else`

When you only care about one pattern:

```rust
if let Some(user) = find_user(id) {
    println!("{}", user.name);
}

// let-else: bind or bail — great for early returns
let Some(user) = find_user(id) else {
    return Err(Error::NotFound);
};
println!("{}", user.name);
```

```rust
// while let: drain a stack
while let Some(top) = stack.pop() {
    println!("{top}");
}
```

> **Rule of thumb:** use `match` when you handle two or more cases, `if let` for
> one case with a fall-through, and `let else` when the fall-through is an early
> return. `let else` is usually the cleanest for validation.

## The `?` operator

Propagates errors (or `None`) and is by far the most-used piece of control flow
in real Rust.

```rust
use std::fs;
use std::io;

fn read_config() -> Result<String, io::Error> {
    let s = fs::read_to_string("config.toml")?;   // return early on Err
    Ok(s.trim().to_string())
}

fn maybe_parse(s: &str) -> Option<u32> {
    let n: u32 = s.parse().ok()?;                 // Result -> Option -> early None
    Some(n)
}
```

Full treatment in [Error handling](07-error-handling.md).

## Recursion and stack depth

```rust
fn fib(n: u64) -> u64 {
    if n < 2 { return n; }
    fib(n - 1) + fib(n - 2)      // exponential — do not ship this
}
```

Rust has no guaranteed tail-call optimisation. Deep recursion overflows the
stack (default 8 MB main thread, 2 MB spawned threads). For deep structures,
write an explicit loop with a `Vec` stack, or use the `stacker` crate.

## A worked example: a tiny expression evaluator

Control flow, `match`, recursion and `Result` in 40 lines.

```rust
#[derive(Debug, PartialEq)]
enum Token { Num(i64), Plus, Minus, Star, LParen, RParen }

fn tokenize(src: &str) -> Result<Vec<Token>, String> {
    let mut out = Vec::new();
    let mut chars = src.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '0'..='9' => {
                let mut n = c.to_digit(10).unwrap() as i64;
                while let Some(d) = chars.peek().and_then(|c| c.to_digit(10)) {
                    n = n * 10 + d as i64;
                    chars.next();
                }
                out.push(Token::Num(n));
            }
            '+' => out.push(Token::Plus),
            '-' => out.push(Token::Minus),
            '*' => out.push(Token::Star),
            '(' => out.push(Token::LParen),
            ')' => out.push(Token::RParen),
            ' ' | '\t' => {}
            other => return Err(format!("unexpected character {other:?}")),
        }
    }
    Ok(out)
}

struct Parser { toks: Vec<Token>, pos: usize }

impl Parser {
    fn peek(&self) -> Option<&Token> { self.toks.get(self.pos) }

    fn expr(&mut self) -> Result<i64, String> {
        let mut lhs = self.term()?;
        while let Some(op) = self.peek() {
            match op {
                Token::Plus => { self.pos += 1; lhs += self.term()?; }
                Token::Minus => { self.pos += 1; lhs -= self.term()?; }
                _ => break,
            }
        }
        Ok(lhs)
    }

    fn term(&mut self) -> Result<i64, String> {
        let mut lhs = self.atom()?;
        while matches!(self.peek(), Some(Token::Star)) {
            self.pos += 1;
            lhs *= self.atom()?;
        }
        Ok(lhs)
    }

    fn atom(&mut self) -> Result<i64, String> {
        match self.peek() {
            Some(Token::Num(n)) => { let n = *n; self.pos += 1; Ok(n) }
            Some(Token::LParen) => {
                self.pos += 1;
                let v = self.expr()?;
                match self.peek() {
                    Some(Token::RParen) => { self.pos += 1; Ok(v) }
                    _ => Err("expected ')'".into()),
                }
            }
            other => Err(format!("unexpected token {other:?}")),
        }
    }
}

fn eval(src: &str) -> Result<i64, String> {
    let toks = tokenize(src)?;
    let mut p = Parser { toks, pos: 0 };
    let v = p.expr()?;
    if p.pos != p.toks.len() { return Err("trailing input".into()); }
    Ok(v)
}

fn main() {
    assert_eq!(eval("2 + 3 * 4"), Ok(14));
    assert_eq!(eval("(2 + 3) * 4"), Ok(20));
    assert!(eval("2 +").is_err());
    println!("{}", eval("10 * (2 - 1) + 5").unwrap());
}
```

Two subtleties worth noting:

- `matches!(self.peek(), Some(Token::Star))` avoids borrowing problems that a
  `match` on `self.peek()` inside a `&mut self` method would create.
- `let n = *n; self.pos += 1;` copies the number out *before* mutating `self`,
  because the borrow from `peek()` is still alive.

## Style notes that matter in review

```rust
// instead of this
if x == true { }

// write
if x { }

// instead of
if let Some(v) = o { return v } else { return 0 }

// write
o.unwrap_or(0)
```

Clippy catches most of these. Run it (module 03.04).

---

## Exercises

1. Write `fn classify(n: i32) -> &'static str` returning `"negative"`,
   `"zero"`, `"small"`, `"large"` using a `match` with guards and ranges.
2. Rewrite the evaluator to support `/` with division-by-zero returning an
   error instead of panicking.
3. Add unary minus so `-3 + 4` evaluates to `1`.
4. Write a `loop` that reads lines from stdin until the user types `quit`,
   accumulating a running total. Use `break` with a value to return the total.
5. Convert a `match` with `Some(x) => Some(f(x)), None => None` into `.map(f)`.
   Then convert a chain of `if let` into `?`.

**Next:** [Ownership, borrowing, lifetimes](03-ownership-borrowing-lifetimes.md)
