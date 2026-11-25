---
summary: Tauri, egui, iced, Slint — four ways to ship a desktop app in Rust, and the bundle-size argument that started the migration.
level: Intermediate
time: 25 min
tags: [desktop, gui, tauri]
---

# Desktop applications

Desktop is where Rust's story is least settled and most interesting: four genuinely
different approaches, each with a real product behind it.

## The four approaches

| Toolkit | Rendering | Bundle | Model |
| --- | --- | --- | --- |
| **Tauri** | system webview | 3–10 MB | Rust backend + HTML/JS frontend |
| **egui** | GPU (wgpu/glow) | 5–15 MB | immediate mode |
| **iced** | GPU (wgpu) | 5–15 MB | Elm architecture (message → update → view) |
| **Slint** | GPU or software | 5–20 MB | declarative `.slint` markup |

Compare that to an Electron app: a Chromium runtime plus Node, typically **80–150 MB**
before your code. That gap is why the migration started.

[[fig:bundle-size]]

## What the domain demands

| Requirement | Consequence |
| --- | --- |
| Fast cold start | a 3 s splash screen is a lost user |
| Small download | app stores and corporate installers care |
| Native integration | tray, menus, file dialogs, global shortcuts, notifications |
| Offline-first | local database, no round trip to be usable |
| Auto-update | signed, atomic, rollback-safe |
| Accessibility | screen readers, keyboard-only navigation |

The last one is the honest weakness of the custom-renderer toolkits: a webview
inherits a decade of accessibility work; a GPU canvas does not.

## Who ships it

| Product | Stack |
| --- | --- |
| **Zed** | Rust with GPUI, a custom GPU UI framework — the proof that native Rust UI can be fast and polished |
| **Warp** | Rust, custom renderer |
| **Alacritty** | Rust terminal, GPU-accelerated |
| **Lapce** | Rust code editor (Floem) |
| **1Password** | shared Rust core across desktop and mobile |
| **Tauri apps** | a long tail of production tools, including several well-known developer apps |

The pattern: either a **Rust core with a thin UI** (Tauri, 1Password) or a **Rust UI
framework** (Zed, Alacritty). Both avoid shipping a browser engine you did not need.

## Tauri: the pragmatic default

The backend is Rust; the UI is your existing web skills; the webview is the OS one.

```bash
$ npm create tauri-app@latest
$ cd my-app && npm install && npm run tauri dev
```

```rust
// src-tauri/src/main.rs
#[tauri::command]
fn save_note(state: tauri::State<Db>, title: String, body: String) -> Result<i64, String> {
    state.insert(&title, &body).map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![save_note])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

```ts
// the frontend calls it like a function
import { invoke } from "@tauri-apps/api/core";
const id = await invoke<number>("save_note", { title: "Hello", body: "world" });
```

Why it wins for most teams:

- the UI is HTML/CSS — accessibility, text rendering and layout come free
- the bundle is a fraction of Electron's
- the backend is Rust, so file access, SQLite and crypto are native and safe
- IPC is typed by convention and validated at the boundary

Its cost: the webview differs per OS (WebView2, WKWebView, WebKitGTK), so you test on
three platforms, and you inherit whatever that webview cannot do.

## egui: immediate mode, zero ceremony

```rust
fn main() -> eframe::Result<()> {
    let options = eframe::NativeOptions::default();
    eframe::run_native(
        "counter",
        options,
        Box::new(|_cc| Ok(Box::new(Counter::default()))),
    )
}

#[derive(Default)]
struct Counter { count: i32 }

impl eframe::App for Counter {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        egui::CentralPanel::default().show(ctx, |ui| {
            ui.heading("Counter");
            if ui.button("increment").clicked() {
                self.count += 1;
            }
            ui.label(format!("count = {}", self.count));
        });
    }
}
```

Immediate mode redraws the whole UI every frame and rebuilds the widget tree. That
sounds wasteful and is not: it is trivial to reason about, has no state-sync bugs, and
is the fastest way to build a tool UI, an inspector or a debug panel. `bevy_egui` and
`egui` dev tools are why it is everywhere in game and graphics tooling.

Its weakness: fine-grained text editing, accessibility and complex layout are harder
than in a retained-mode toolkit.

## iced: the Elm architecture

```rust
use iced::widget::{button, column, text};

#[derive(Debug, Clone)]
enum Message { Increment }

#[derive(Default)]
struct Counter { count: i32 }

impl Counter {
    fn update(&mut self, message: Message) {
        match message {
            Message::Increment => self.count += 1,
        }
    }

    fn view(&self) -> iced::Element<'_, Message> {
        column![
            button("increment").on_press(Message::Increment),
            text(format!("count = {}", self.count)),
        ]
        .into()
    }
}

fn main() -> iced::Result {
    iced::application("counter", Counter::update, Counter::view).run()
}
```

Message → update → view, with no interior mutability anywhere. The state machine is
explicit, which makes large UIs tractable and testable.

## The decisions that matter

| Decision | Choose |
| --- | --- |
| You have web skills and need accessibility | Tauri |
| You are building a tool, inspector or debug UI | egui |
| You want a typed, testable large UI | iced |
| You want a designer-editable UI with a small runtime | Slint |
| You need to ship to iOS/Android too | Dioxus or Tauri 2 |
| You are building an editor or terminal | custom renderer (GPUI-style) |

## Native integration checklist

- [ ] file dialogs through the platform, not a text field for a path
- [ ] system tray and menu bar entries
- [ ] global shortcut registration with conflict handling
- [ ] notifications with permission prompts
- [ ] deep links / file associations
- [ ] auto-update: signed manifest, atomic install, rollback
- [ ] single-instance enforcement
- [ ] local database (SQLite) with migrations, not JSON files
- [ ] crash reporting with a local buffer that flushes on next start

## What to steal for a non-desktop project

1. **Bundle size is a feature.** The Electron → Tauri migration is the clearest
   evidence in the ecosystem.
2. **IPC needs a typed boundary** — the same discipline as an HTTP API.
3. **Immediate mode is a legitimate architecture** for internal tools. Redraw
   everything, keep no derived state.

## Where Rust is the wrong answer

- A pixel-perfect, animation-heavy consumer app: Flutter or native toolkits are
  ahead.
- A team with no Rust experience on a tight deadline: Tauri still requires Rust for
  the backend.
- Anything needing deep OS integration on Windows (COM, WinRT) — doable, painful.

## Try it

Build the same counter in Tauri, egui and iced. Compare the binary size, the cold
start and the lines of code. The numbers will tell you which one your next project
should use.

**Back to:** [Use cases](../README.md)
