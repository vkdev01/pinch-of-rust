---
summary: Ship image processing to the browser in WebAssembly — resize, blur and watermark without uploading a byte.
level: Intermediate
time: 8–12 h
tags: [wasm, performance, browser]
---

# pixel-forge — image work in the browser

Uploading a 12 MB photo to a server to resize it is a waste of everyone's
bandwidth. This project moves the pixels to the client: Rust compiled to
WebAssembly, driven by a tiny JS UI, processing a 4000×3000 image in under 200 ms.

**What it is:** a wasm module exposing `resize(bytes, w, h) -> bytes`, a
`blur(radius)` and `watermark(text)`, plus a drag-and-drop page that shows before
and after.

## What you learn

| Skill | Where it comes from |
| --- | --- |
| The wasm boundary | `wasm-bindgen`, `Uint8Array`, avoiding copies |
| Binary size discipline | `opt-level="s"`, `lto`, `wasm-opt -Oz` |
| Memory in the browser | linear memory, `Vec` → JS transfer |
| Async in wasm | `web-sys`, canvas, `createImageBitmap` |
| Shipping | `trunk`, cache headers, brotli |

## Milestones

| # | Ship | Done when |
| --- | --- | --- |
| 1 | `add(a,b)` in wasm | the page calls Rust |
| 2 | Decode + encode an image | round-trip a PNG byte-for-byte |
| 3 | Resize | 4000×3000 → 800×600 in < 200 ms |
| 4 | Convolve | a box blur that does not freeze the tab |
| 5 | Drag and drop | files in, preview out |
| 6 | Under 300 KB | wasm + JS, brotli-compressed |

## Crates

```toml
[lib]
crate-type = ["cdylib", "rlib"]     # cdylib for wasm, rlib so `cargo test` works

[dependencies]
wasm-bindgen = "0.2"
js-sys = "0.3"
web-sys = { version = "0.3", features = ["console", "Window", "Document", "HtmlCanvasElement", "CanvasRenderingContext2d", "ImageData"] }
image = { version = "0.25", default-features = false, features = ["png", "jpeg"] }
console_error_panic_hook = "0.1"

[profile.release]
opt-level = "s"
lto = true
panic = "abort"
strip = true
```

## The boundary

```rust
use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();   // otherwise panics are invisible
}

/// Resize a JPEG/PNG and return new bytes. One copy in, one copy out.
#[wasm_bindgen]
pub fn resize(bytes: &[u8], width: u32, height: u32) -> Result<Vec<u8>, JsValue> {
    let img = image::load_from_memory(bytes)
        .map_err(|e| JsValue::from_str(&format!("decode: {e}")))?;

    let thumb = img.resize_exact(width, height, image::imageops::FilterType::Lanczos3);

    let mut out = Vec::with_capacity(64 * 1024);
    thumb
        .write_to(&mut std::io::Cursor::new(&mut out), image::ImageFormat::Png)
        .map_err(|e| JsValue::from_str(&format!("encode: {e}")))?;
    Ok(out)
}
```

```js
import init, { resize } from "./pkg/pixel_forge.js";
await init();

const buf = new Uint8Array(await file.arrayBuffer());
const out = resize(buf, 800, 600);        // Uint8Array, copied once
const url = URL.createObjectURL(new Blob([out], { type: "image/png" }));
```

> **Gotcha:** every `&[u8]` parameter copies into wasm memory. For a 12 MB photo
> that is a 12 MB memcpy — unavoidable with `wasm-bindgen`'s default ABI. For
> bigger payloads, allocate in wasm and write into the view:
> `let ptr = alloc(len); new Uint8Array(memory.buffer, ptr, len).set(bytes);`

## Blur without freezing the tab

A naive convolution on 12 M pixels blocks the main thread for seconds. Two fixes:

```rust
/// Separable box blur: two 1-D passes instead of one 2-D pass.
/// O(w*h*r) becomes O(w*h) per pass.
pub fn box_blur(pixels: &mut [u8], w: usize, h: usize, radius: usize) {
    // horizontal
    for y in 0..h {
        let row = &mut pixels[y * w * 4..(y + 1) * w * 4];
        let mut acc = [0u32; 4];
        // sliding window over the row, clamped at the edges
        // (see the repo for the full loop)
        let _ = (&mut acc, row, radius);
    }
    // vertical pass is the same with a stride of w*4
}
```

```js
// keep the UI responsive: run per-tile in a worker, or yield between rows
const worker = new Worker("/blur-worker.js");
worker.postMessage({ buf, w, h, radius }, [buf.buffer]);   // transfer, no copy
```

Transferring the `ArrayBuffer` (second argument to `postMessage`) moves ownership
instead of copying — the single biggest win for large images.

## Size budget

| Step | Bytes |
| --- | --- |
| naive build | ~1.4 MB |
| `opt-level="s"` + `lto` | ~900 KB |
| `panic="abort"` | ~760 KB |
| `wasm-opt -Oz` | ~620 KB |
| brotli over the wire | ~210 KB |

Drop `image`'s default features — it pulls in every format decoder. `default-features = false, features = ["png", "jpeg"]` alone is worth ~300 KB.

## Stretch goals

- A `--simd128` build with a hand-written SIMD blur.
- OffscreenCanvas rendering.
- Batch mode: process 50 images, show a progress bar from wasm callbacks.
- A worker pool sized to `navigator.hardwareConcurrency`.
- Compare against a pure-JS implementation and publish the numbers.

## Demo checklist

- [ ] a 12 MB JPEG resized in the browser with the network tab showing zero uploads
- [ ] the wasm bundle under 300 KB compressed
- [ ] the tab stays interactive during a blur
- [ ] `cargo test` still runs natively against the same code
