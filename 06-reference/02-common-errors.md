# 02 · Common Errors, Decoded

The compiler messages you will actually see, what they mean, and the fix. Rust's
error codes are stable — search `rust E0382` and you get the official explanation.

## E0382 — borrow of moved value

```text
error[E0382]: borrow of moved value: `s`
  |
3 |     let s = String::from("hi");
  |         - move occurs because `s` has type `String`
4 |     let t = s;
  |             - value moved here
5 |     println!("{s}");
  |               ^^^ value borrowed here after move
help: consider cloning the value if the performance cost is acceptable
```

**Cause:** ownership moved to `t`, then you used `s`.
**Fixes, best first:** pass `&s` instead of `s`; return the value from the
function; if it is genuinely needed twice, `s.clone()` — but think first.

## E0502 — cannot borrow as mutable because also borrowed as immutable

```text
error[E0502]: cannot borrow `v` as mutable because it is also borrowed as immutable
5 | let a = &v;
6 | v.push(1);
  | ^^^^^^^^^ mutable borrow occurs here
7 | println!("{a:?}");
```

**Cause:** a shared borrow is still live when you try to mutate.
**Fix:** end the borrow first (use `a` before `v.push`, or scope it in `{ }`), or
collect the data you need out of `a` before mutating.

## E0499 — two mutable borrows

```text
error[E0499]: cannot borrow `v` as mutable more than once at a time
```

**Cause:** usually a loop mutating a collection it is iterating.
**Fix:** `iter_mut()`, index-based access, or collect-then-modify.

## E0596 — cannot borrow as mutable, not declared as mutable

```text
error[E0596]: cannot borrow `x` as mutable, as it is not declared as mutable
help: consider changing this to be mutable: `mut x`
```

**Fix:** `let mut x`. If `x` is a field accessed through `&self`, the method
needs `&mut self` — or interior mutability.

## E0106 — missing lifetime specifier

```text
error[E0106]: missing lifetime specifier
1 | fn longest(a: &str, b: &str) -> &str {
  |               ----     ----     ^ expected named lifetime parameter
```

**Cause:** two input references, so the compiler cannot tell which one the output
comes from.
**Fix:** `fn longest<'a>(a: &'a str, b: &'a str) -> &'a str`.

## E0597 — does not live long enough

```text
error[E0597]: `s` does not live long enough
  |
5 |     let r = &s;
  |              ^ borrowed value does not live long enough
6 | }
  | - `s` dropped here while still borrowed
```

**Cause:** a reference outlives its owner — often a struct holding a borrow of a
local.
**Fix:** make the owner live longer, or make the struct own the data
(`String`/`Arc<str>` instead of `&str`).

## E0515 — returning a reference to local data

```text
error[E0515]: cannot return value referencing local variable `s`
```

**Fix:** return an owned value, or take the destination as a parameter
(`fn fill(&self, out: &mut String)`).

## E0308 — mismatched types

The most common error in Rust, and the most generic. Read the `expected` /
`found` pair, not the code frame.

```text
error[E0308]: mismatched types
 --> src/main.rs:3:18
  |
3 |     let x: i32 = "hello";
  |            ---   ^^^^^^^ expected `i32`, found `&str`
```

Common variants:

| Message | Meaning |
| --- | --- |
| `expected i32, found ()` | a trailing `;` turned your value into a statement |
| `expected String, found &str` | add `.to_string()` or `.into()` |
| `expected Option<T>, found T` | wrap in `Some(...)` |
| `expected u32, found i32` | explicit cast: `as u32` or `try_from` |

## E0277 — trait bound not satisfied

```text
error[E0277]: the trait bound `MyStruct: Debug` is not satisfied
   = help: the trait `Debug` is not implemented for `MyStruct`
   = note: add `#[derive(Debug)]` to `MyStruct`
```

The `help:` and `note:` lines are usually the complete answer. The three most
common causes:

1. Missing `#[derive(Debug)]` / `Clone` / `PartialEq`.
2. A type that is not `Send` used across threads (see E0277 + `Send`).
3. `?` on an error type with no `From` impl.

## E0277 + `Send` — the async killer

```text
error: future cannot be sent between threads safely
   = help: within `impl Future`, the trait `Send` is not implemented for `Rc<u32>`
note: required by a bound in `tokio::spawn`
```

**Cause:** a non-`Send` value (usually `Rc`, `RefCell`, or a guard) is held across
an `.await` inside a spawned task.
**Fix:** scope the value so it drops before the `.await`, or replace `Rc` with
`Arc` and `RefCell` with `Mutex`.

## E0433 / E0432 — unresolved import or path

```text
error[E0432]: unresolved import `crate::db::Pool`
error[E0433]: failed to resolve: use of undeclared crate or module `serde`
```

**Fixes:** add the dependency to `Cargo.toml`; declare `mod db;`; check the
underscore-vs-hyphen crate name; check `pub` visibility on every step of the path.

## E0061 — wrong number of arguments

```text
error[E0061]: this function takes 2 arguments but 1 argument was supplied
```

Often caused by a library version bump. Check `cargo doc --open` for the
signature you actually have.

## E0507 — cannot move out of borrowed content

```text
error[E0507]: cannot move out of `self.field` which is behind a shared reference
```

**Fix:** `.clone()` it, take `&self.field` instead, or use `std::mem::take` /
`Option::take` when you legitimately want to move out.

## E0282 / E0283 — type annotations needed

```text
error[E0282]: type annotations needed for `Vec<T>`
```

**Fix:** `let v: Vec<i32> = Vec::new();` or `Vec::<i32>::new()`. Usually happens
with `collect()` — annotate the target type:
`let v: Vec<_> = it.collect();`.

## `cannot find macro` / derive not found

```text
error: cannot find derive macro `Serialize` in this scope
```

**Fix:** `use serde::Serialize;` — the derive macro is a separate import from the
trait in many crates. Also check the crate's feature flags (serde needs `derive`).

## Borrow-checker fights, and their real fixes

| Symptom | Real fix |
| --- | --- |
| Mutating in a loop over the collection | `iter_mut`, index loop, or collect-then-modify |
| Returning `&local` | return owned, or pass `&mut` out-param |
| Two `&mut` into one `Vec` | `split_at_mut`, `chunks_mut`, `iter_mut` |
| Self-referential struct | store an index or offset, not a slice |
| Storing a borrow in a long-lived struct | own the data (`String`, `Arc`) |
| "I just need to cache this here" | `Arc<Mutex<…>>`, or restructure |
| Closure captures conflict | `move` the closure, or narrow the capture |

> **Rule of thumb:** every borrow error is a question about ownership. Answer the
> question; do not silence it with `clone()`.

## Runtime panics

| Panic | Cause |
| --- | --- |
| `index out of bounds` | `v[i]` with `i >= v.len()` — use `get` |
| `called Option::unwrap() on a None value` | no value — handle `None` |
| `called Result::unwrap() on an Err value: …` | read the inner error |
| `attempt to add with overflow` | debug-only — use `checked_add` |
| `already borrowed: BorrowMutError` | `RefCell` double borrow |
| `already mutably borrowed: BorrowError` | `RefCell` borrow while mutably borrowed |
| `byte index N is not a char boundary` | slicing a `String` mid-character |
| `cannot block the current thread from within a runtime` | `block_on` inside async |
| `there is no reactor running` | async call outside a runtime |

## Clippy lints worth fixing immediately

| Lint | Meaning |
| --- | --- |
| `needless_borrow` | `&x` where `x` works |
| `redundant_clone` | a clone whose result is never used distinctly |
| `clone_on_copy` | `.clone()` on a `Copy` type |
| `ptr_arg` | `&Vec<T>` in a signature — use `&[T]` |
| `manual_map` / `manual_flatten` | an iterator method exists |
| `single_char_pattern` | `split(", ")` vs `split(',')` |
| `unwrap_used` | a panic in library code |
| `large_enum_variant` | one variant much bigger — box it |
| `needless_collect` | collecting into a `Vec` only to iterate |
| `derivable_impls` | a hand-written `Default` that `derive` covers |

## Reading a long error

1. Read the **error code** and the first line — that is the category.
2. Read the **`help:`** block — it is usually the fix.
3. Read the **`note:`** block — it explains the rule you broke.
4. Only then look at the code frame, and look at *both* locations it points to.
5. If it is a macro error, run `cargo expand` to see the real code.

Nine times out of ten, the compiler has already told you the answer in `help:`.
