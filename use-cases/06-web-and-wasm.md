---
summary: Figma, Shopify and Discord — Rust in the browser, in the edge, and in the parts of a web app that must not stutter.
level: Intermediate
time: 22 min
tags: [wasm, web, frontend]
---

# Web and WebAssembly

Rust is not replacing JavaScript on the web. It is replacing the *hot 5%* of a
web app — the part where the frame budget is spent.

## What the domain demands

| Requirement | Consequence |
| --- | --- |
| 16 ms per frame | Any per-frame allocation shows up as jank |
| No blocking the main thread | Long tasks kill interaction and Core Web Vitals |
| Deterministic memory | Mobile Safari will kill a tab over ~200 MB |
| Ship over the wire | Bundle size is a product decision, not a detail |
| Run everywhere | One artifact for browser, edge worker and server |

## Who runs it

| Product | How Rust is used |
| --- | --- |
| **Figma** | the multiplayer engine and parts of the renderer are compiled to WebAssembly; Figma published the work on getting a 3× speedup from the wasm rewrite |
| **Shopify** | "Functions" — merchant business logic compiled to WebAssembly and run inside Shopify's infrastructure |
| **Discord** | the desktop client's voice/video and some client services are Rust; the Read States service rewrite removed GC pauses |
| **1Password** | a shared Rust core powering the crypto and data layer across every platform |
| **Cloudflare Workers** | Rust targets the edge runtime; the worker runs in a V8 isolate with wasm |
| **Every JS bundler** | swc, Turbopack and Biome are Rust programs doing the work webpack did in JS |

The common thread: the code that had to be fast, or had to be *identical* on five
platforms, moved to Rust. The UI layer stayed where it was.

## The shape of the code

A wasm module is a function library, not an application. Design its boundary
first.

```rust
use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct Doc { pub nodes: Vec<Node>, pub version: u64 }

#[derive(Serialize, Deserialize)]
pub struct Node { pub id: u32, pub x: f32, pub y: f32, pub w: f32, pub h: f32 }

/// Hit-testing is the hot path: called on every pointer move.
/// Keep the document on the Rust side and pass only the result across.
#[wasm_bindgen]
pub struct Scene { doc: Doc }

#[wasm_bindgen]
impl Scene {
    #[wasm_bindgen(constructor)]
    pub fn new(json: &str) -> Result<Scene, JsValue> {
        let doc: Doc = serde_json::from_str(json)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        Ok(Scene { doc })
    }

    /// Returns the id of the topmost node under the point, or 0.
    pub fn hit_test(&self, x: f32, y: f32) -> u32 {
        // iterate back to front: last drawn is on top
        self.doc.nodes.iter().rev()
            .find(|n| x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h)
            .map(|n| n.id)
            .unwrap_or(0)
    }

    pub fn apply_move(&mut self, id: u32, dx: f32, dy: f32) {
        if let Some(n) = self.doc.nodes.iter_mut().find(|n| n.id == id) {
            n.x += dx;
            n.y += dy;
        }
    }
}
```

The important design decision is that `Scene` **owns** the document and lives
across calls. Rebuilding the whole document on every pointer move is the mistake
that makes wasm feel slower than JS.

## The boundary rules

| Rule | Why |
| --- | --- |
| Pass numbers, not objects | Every `JsValue` conversion copies |
| Keep state in Rust | A handle (`u32`) beats a 2 MB round trip |
| Batch calls | 1 call per frame, not 1 per node |
| Use `Float32Array` views for bulk data | Zero-copy over shared linear memory |
| Measure bundle size in CI | It creeps by 30 KB per dependency |

```js
// one call per frame, not per node
const rects = scene.layout();          // returns a Float32Array view
ctx.putImageData(new ImageData(new Uint8ClampedArray(rects), w, h), 0, 0);
```

## When to reach for wasm, and when not to

**Reach for it when:**

- You are doing per-frame numeric work (layout, physics, image, audio, crypto).
- You have an existing Rust library you want in the browser (parsers, codecs,
  compression, simulation).
- The same logic must run in the browser, at the edge and on the server, and
  divergence would be a bug.

**Do not reach for it when:**

- The work is DOM manipulation. JS is faster at that, because it is native to it.
- You need a form. A 200 KB wasm bundle to validate an email address is a
  self-inflicted wound.
- Your team does not already know Rust — the iteration cost is real.

## What to steal for your own project

1. **Start with one function**, not a framework. `resize(imageBytes)` that beats
   the JS version is a complete win; a rewritten app is a project.
2. **Budget the bytes.** `wasm-opt -Oz` plus brotli turns a 1 MB module into ~200 KB.
   Put the number in CI so it cannot regress.
3. **Keep the UI in the UI layer.** Figma did not rewrite its interface in Rust;
   it rewrote the engine.

## Try it

Take a hot loop from any web app — sorting 100k rows, parsing a large CSV,
computing a diff — and implement it twice: once in JS, once in Rust/wasm. Compare
`performance.now()` around each, and the bundle delta. If the win is under 3×, keep
the JS.

**Back to:** [Use cases index](../README.md)
