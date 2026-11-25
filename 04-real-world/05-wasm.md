# 05 · WebAssembly in the Browser

Rust compiles to WebAssembly: near-native speed in the browser, a small binary,
and the same language on both sides of the wire.

## When it is worth it

| Use WASM | Do not use WASM |
| --- | --- |
| CPU-heavy work: parsing, codecs, crypto, simulation | ordinary UI and forms |
| Reusing an existing Rust library in the browser | anything the DOM does well |
| Image/video/audio processing | a page that is mostly text |
| Games and graphics | CRUD apps |
| Running untrusted code in a sandbox | when bundle size dominates |

WASM's real win is **sharing logic**: the same validation, parser or pricing
engine running on the server and in the browser, with no reimplementation and no
drift.

## Toolchain

```bash
$ rustup target add wasm32-unknown-unknown
$ cargo install wasm-pack          # build + npm packaging
$ cargo install trunk              # dev server + bundler for web apps
$ cargo install wasm-bindgen-cli
```

## The smallest useful module

```toml
[package]
name = "wasm-lib"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
wasm-bindgen = "0.2"

[profile.release]
opt-level = "s"        # optimise for size
lto = true
```

```rust
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 { a + b }

#[wasm_bindgen]
pub fn slugify(input: &str) -> String {
    input
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}
```

```bash
$ wasm-pack build --target web --release
```

That produces `pkg/` with a `.wasm`, a JS glue file, and TypeScript types.

```html
<script type="module">
  import init, { add, slugify } from './pkg/wasm_lib.js';
  await init();
  console.log(add(2, 3));              // 5
  console.log(slugify('Hello, World!')); // hello-world
</script>
```

`crate-type = ["cdylib", "rlib"]` matters: `cdylib` for the wasm artifact, `rlib`
so you can still unit-test the crate natively with `cargo test`.

## Working with JS values

```rust
use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct Order { pub id: u64, pub total: f64, pub items: Vec<String> }

#[wasm_bindgen]
pub fn total_of(orders: JsValue) -> Result<f64, JsValue> {
    let orders: Vec<Order> = serde_wasm_bindgen::from_value(orders)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    Ok(orders.iter().map(|o| o.total).sum())
}
```

```toml
serde = { version = "1", features = ["derive"] }
serde-wasm-bindgen = "0.6"
```

> **Gotcha:** passing complex data across the boundary costs. Every `JsValue`
> conversion copies. For hot paths, keep the data on the Rust side and pass
> handles (integers) instead of structures.

## Calling the browser

```toml
[dependencies]
wasm-bindgen = "0.2"
web-sys = { version = "0.3", features = ["Window", "Document", "HtmlElement", "console"] }
js-sys = "0.3"
```

```rust
use wasm_bindgen::prelude::*;
use web_sys::window;

#[wasm_bindgen(start)]           // runs automatically on module init
pub fn main() -> Result<(), JsValue> {
    let doc = window().unwrap().document().unwrap();
    let el = doc.get_element_by_id("app").unwrap();
    el.set_inner_html("<h1>Hello from Rust</h1>");
    web_sys::console::log_1(&"wasm started".into());
    Ok(())
}
```

## Panics and logging

```toml
[dependencies]
console_error_panic_hook = "0.1"
```

```rust
#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();   // panic messages in the browser console
}
```

Without this, a Rust panic in WASM shows up as `unreachable executed` with no
information. Set the hook first, always.

## A real app: the Yew framework

```toml
[dependencies]
yew = { version = "0.21", features = ["csr"] }
wasm-bindgen = "0.2"
```

```rust
use yew::prelude::*;

#[function_component(App)]
fn app() -> Html {
    let count = use_state(|| 0);

    let onclick = {
        let count = count.clone();
        Callback::from(move |_| count.set(*count + 1))
    };

    html! {
        <main class="p-4">
            <h1>{ "Counter" }</h1>
            <p>{ format!("Clicked {} times", *count) }</p>
            <button {onclick}>{ "Increment" }</button>
        </main>
    }
}

fn main() { yew::Renderer::<App>::new().render(); }
```

| Framework | Model | Notes |
| --- | --- | --- |
| `leptos` | fine-grained signals | fastest, closest to SolidJS |
| `yew` | React-like components | mature, familiar |
| `dioxus` | React-like, multi-target | also desktop/mobile/TUI |
| `sycamore` | signals | smaller community |

## Trunk: the build tool

```toml
# Trunk.toml
[build]
target = "index.html"

[serve]
port = 8080
```

```html
<!-- index.html -->
<link data-trunk rel="rust" data-wasm-opt="s" />
```

```bash
$ trunk serve --open
$ trunk build --release
```

Trunk compiles the Rust, runs `wasm-bindgen`, runs `wasm-opt`, hashes assets and
serves with hot reload. It removes the whole npm layer for a pure-Rust frontend.

## Size and speed

```bash
$ wasm-opt -Oz -o out.wasm in.wasm
```

```toml
[profile.release]
opt-level = "s"     # or "z" for minimum size
lto = true
codegen-units = 1
panic = "abort"     # much smaller, no unwinding
strip = true
```

| Setting | Rough effect |
| --- | --- |
| `opt-level = "s"` | −10–20% size vs `3` |
| `lto = true` | −10% |
| `panic = "abort"` | −10–15% |
| `wasm-opt -Oz` | −10–20% |
| No `std` formatting | −30% (big) |

`format!` and `Display` pull in a large chunk of `std`. In a size-sensitive WASM
build, avoid them in hot paths — or go `no_std`.

Enable gzip/brotli on the server: WASM compresses to about 30% of its size, and
the browser caches it.

## Threads and SIMD (advanced)

```bash
$ RUSTFLAGS="-C target-feature=+simd128" cargo build --target wasm32-unknown-unknown
```

SIMD is widely supported. Threads require `SharedArrayBuffer`, which needs
cross-origin isolation headers:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without those two headers, `SharedArrayBuffer` is undefined and any
thread-based WASM fails.

## WASM outside the browser

The same `.wasm` runs in:

- **Cloudflare Workers / Fastly Compute** — edge functions.
- **WASI** (`wasm32-wasip1`) — server-side sandboxing, plugins.
- **Extism** — a plugin system for any host language.
- **Wasmtime** — an embeddable runtime.

A plugin architecture where untrusted customer code runs in a WASM sandbox with
explicit host functions is one of the genuinely great uses of this technology.

```rust
// host side with wasmtime
let engine = wasmtime::Engine::default();
let module = wasmtime::Module::from_file(&engine, "plugin.wasm")?;
let mut store = wasmtime::Store::new(&engine, ());
let instance = wasmtime::Instance::new(&mut store, &module, &[])?;
let run = instance.get_typed_func::<(), i32>(&mut store, "run")?;
let result = run.call(&mut store, ())?;
```

---

## Exercises

1. Build the `slugify` module with `wasm-pack` and call it from a plain HTML page.
2. Add `console_error_panic_hook` and trigger a panic; read the message in the
   console.
3. Pass a `Vec<Order>` from JS to Rust as `JsValue` and return the total.
4. Build a Yew counter, then a Leptos counter, and compare bundle sizes.
5. Take a WASM build and shrink it with `opt-level = "s"`, `lto`, `panic =
   "abort"` and `wasm-opt -Oz`. Report each step's size.
6. Explain why `crate-type = ["cdylib", "rlib"]` is needed to keep `cargo test`
   working.

**Next:** [Embedded and IoT](06-embedded.md)
