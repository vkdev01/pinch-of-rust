# 08 · Modules, Crates, Packages

Rust has three nested words for "code organisation" and they are easy to
confuse. Get them straight once:

| Word | Means | Example |
| --- | --- | --- |
| **Module** | a namespace inside a crate | `mod db;` |
| **Crate** | one compilation unit — a library or a binary | `myapp`, `serde` |
| **Package** | a `Cargo.toml` with one or more crates | the folder `myapp/` |

A package has **at most one** library crate plus **any number** of binary
crates. All of them can share modules.

## Modules

```rust
// src/lib.rs
mod db;                    // loads src/db.rs or src/db/mod.rs
pub mod api;               // public: callers outside the crate can use it

mod internal {
    pub fn helper() {}     // pub within the module
    fn private() {}        // not visible outside `internal`
}

pub fn run() {
    internal::helper();    // ok — same crate
}
```

### Visibility

| Modifier | Visible to |
| --- | --- |
| (nothing) | the current module and its children |
| `pub` | everyone |
| `pub(crate)` | the whole crate, not external users |
| `pub(super)` | the parent module |
| `pub(in crate::api)` | that specific path |

> **Rule of thumb:** default to private, then `pub(crate)` for internal sharing,
> then `pub` only for what is genuinely part of your API. Public API is a
> promise you have to keep.

```rust
pub struct User {
    pub id: u64,
    email: String,          // private: only this module can read it
}

impl User {
    pub fn email(&self) -> &str { &self.email }   // controlled access
}
```

### The module tree

```rust
// src/lib.rs
pub mod config;      // src/config.rs
pub mod db;          // src/db.rs
pub mod api;         // src/api/mod.rs or src/api.rs
```

```rust
// src/db.rs
pub mod pool;
pub mod queries;
mod migrations;      // private submodule

pub use pool::Pool;  // re-export: users write db::Pool, not db::pool::Pool
```

`pub use` is the **facade** pattern: internal structure can change freely while
the public path stays stable.

### Paths: `crate`, `self`, `super`

```rust
crate::db::Pool           // absolute from the crate root
self::helper()            // current module
super::sibling()          // parent module
::std::vec::Vec           // from the extern prelude (rarely needed)
std::vec::Vec             // same thing, the normal way
```

### `use` and aliasing

```rust
use std::collections::{HashMap, HashSet};
use std::io::{self, Read};             // io::Result and Read
use serde::{Deserialize, Serialize};
use crate::db::Pool as DbPool;
use anyhow::Result as AnyResult;
```

Group order convention (rustfmt enforces within a group):

```rust
use std::collections::HashMap;    // 1. std
use std::sync::Arc;

use serde::Deserialize;           // 2. external crates
use tokio::time;

use crate::config::Config;        // 3. this crate
use crate::db::Pool;
```

> **Gotcha:** `use` is *not* a copy or an import at runtime — it only brings a
> name into scope. `use` at the top of a function body is legal and useful for
> long paths inside one function.

### Glob imports

```rust
use prelude::*;      // discouraged in application code, common in preludes
```

Use for `#[cfg(test)] mod tests { use super::*; }` (standard) and for crate
preludes. Avoid in production modules — you lose track of where names come from
and unused-import warnings.

## Crates

A crate is what `rustc` compiles. It has a **root file**:

| Crate kind | Root | Produces |
| --- | --- | --- |
| library | `src/lib.rs` | `.rlib`, `.so`/`.dll` |
| binary | `src/main.rs` | an executable |

```toml
[package]
name = "myapp"
edition = "2021"

[lib]
name = "myapp"
path = "src/lib.rs"

[[bin]]
name = "myapp"
path = "src/main.rs"

[[bin]]
name = "myapp-admin"
path = "src/bin/admin.rs"
```

Any `.rs` file in `src/bin/` is automatically a binary. That is the quickest way
to add a helper tool:

```text
src/bin/seed.rs     →  cargo run --bin seed
```

### Crate names and `use` names

Cargo package names use hyphens (`my-app`), but Rust crate names use underscores
(`my_app`). Cargo converts automatically; in code you always write the
underscore form.

```toml
[dependencies]
my-app = { path = "../my-app" }
```

```rust
use my_app::Thing;   // underscore
```

### `extern crate` is dead

```rust
extern crate serde;   // 2015 edition only — do not write this
```

Since the 2018 edition, dependencies are in scope automatically. Delete any
`extern crate` you find except in specific macro/`no_std` situations.

## Re-exports: building a clean public API

```rust
// src/lib.rs
mod error;
mod model;
mod service;

pub use error::{Error, Result};
pub use model::{User, Order};
pub use service::Service;

pub mod prelude {
    pub use crate::error::{Error, Result};
    pub use crate::model::{Order, User};
}
```

Callers now write `myapp::User` and `myapp::Result` regardless of how the
internals are arranged. Renaming a module becomes a non-breaking change.

## Conditional compilation

```rust
#[cfg(target_os = "linux")]
fn platform_init() { }

#[cfg(target_os = "windows")]
fn platform_init() { }

#[cfg(feature = "metrics")]
mod metrics;

#[cfg(test)]
mod tests;

#[cfg(debug_assertions)]
fn log_verbose(msg: &str) { eprintln!("{msg}"); }

#[cfg(not(debug_assertions))]
fn log_verbose(_: &str) { }
```

```toml
[target.'cfg(unix)'.dependencies]
libc = "0.2"

[target.'cfg(windows)'.dependencies]
winapi = "0.3"
```

Test the matrix:

```bash
$ cargo check --all-targets --all-features
$ cargo check --no-default-features
$ cargo check --target x86_64-pc-windows-gnu
```

> **Gotcha:** `cfg` blocks that do not compile are never checked by default. A
> Windows-only module can rot for months. Add `--all-targets` and a
> cross-target `cargo check` to CI.

## Documentation as part of the module system

```rust
//! # My crate
//!
//! Crate-level docs. Everything here appears on the front page of `cargo doc`.

/// Adds two numbers.
///
/// # Examples
/// ```
/// assert_eq!(myapp::add(2, 2), 4);
/// ```
///
/// # Panics
/// Never panics.
pub fn add(a: i32, b: i32) -> i32 { a + b }
```

- `//!` documents the *containing* item (module or crate).
- `///` documents the *following* item.
- `#[doc(hidden)]` hides an item from the docs but keeps it public.
- `#[doc = include_str!("../README.md")]` puts your README on the crate page.

```bash
$ cargo doc --no-deps --open
$ cargo doc --document-private-items
```

## A worked example: a multi-binary package

```text
app/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── config.rs
    ├── error.rs
    ├── store/
    │   ├── mod.rs
    │   └── memory.rs
    ├── main.rs
    └── bin/
        └── migrate.rs
```

```rust
// src/lib.rs
pub mod config;
pub mod error;
pub mod store;

pub use error::{Error, Result};
pub use store::Store;
```

```rust
// src/store/mod.rs
mod memory;
pub use memory::MemoryStore;

use crate::error::Result;

pub trait Store: Send + Sync {
    fn put(&self, key: &str, value: &[u8]) -> Result<()>;
    fn get(&self, key: &str) -> Result<Option<Vec<u8>>>;
}
```

```rust
// src/main.rs
use app::{config::Config, Store};

fn main() -> app::Result<()> {
    let cfg = Config::from_env()?;
    let store = app::store::MemoryStore::new();
    store.put("boot", b"ok")?;
    println!("running on {}:{}", cfg.host, cfg.port);
    Ok(())
}
```

```rust
// src/bin/migrate.rs — a second binary, shares the library
fn main() -> app::Result<()> {
    println!("running migrations");
    Ok(())
}
```

```bash
$ cargo run                 # the main binary
$ cargo run --bin migrate   # the second one
$ cargo build --bins        # both
```

---

## Exercises

1. Split a single-file program into `lib.rs` + `main.rs`, with a `store` module
   containing two implementations behind a `pub trait`.
2. Add `pub use` re-exports so external code writes `myapp::Store`, not
   `myapp::store::memory::MemoryStore`.
3. Add a second binary in `src/bin/` that reuses the library.
4. Add a `#[cfg(feature = "extra")]` module and verify `cargo check` fails to
   see it without the feature, and passes with it.
5. Write crate-level `//!` docs and run `cargo doc --open`. Confirm your doc
   example is executed by `cargo test`.

**Next:** [Smart pointers and interior mutability](09-smart-pointers-interior-mutability.md)
