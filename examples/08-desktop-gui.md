---
summary: Tauri commands and events, egui panels, iced messages, tray icons, file dialogs and global shortcuts — copy, adapt, ship.
level: Intermediate
time: 15 min
tags: [desktop, gui, tauri]
---

# Desktop and GUI recipes

## 1. A Tauri command that returns a typed error

```rust
#[derive(serde::Serialize)]
pub struct AppError { message: String }

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self { AppError { message: e.to_string() } }
}

#[tauri::command]
fn read_file(path: String) -> Result<String, AppError> {
    Ok(std::fs::read_to_string(path)?)
}
```

```ts
try { const text = await invoke<string>("read_file", { path }); }
catch (e) { console.error((e as AppError).message); }
```

> **Trap:** returning `anyhow::Error` does not serialise. Map to a `Serialize` type at
> the boundary — that is the whole reason the boundary exists.

## 2. Emit an event from Rust to the UI

```rust
use tauri::Emitter;

#[tauri::command]
fn start_import(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        for i in 0..100 {
            let _ = app.emit("import-progress", i);
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
    });
}
```

```ts
import { listen } from "@tauri-apps/api/event";
const unlisten = await listen<number>("import-progress", (e) => setProgress(e.payload));
// call unlisten() when the component unmounts
```

## 3. File dialog

```rust
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
async fn pick_file(app: tauri::AppHandle) -> Option<String> {
    app.dialog().file().blocking_pick_file().map(|p| p.to_string())
}
```

> **Trap:** never ask a user to type a path. Use the platform dialog — it has
> bookmarks, sandbox permissions and recent locations already solved.

## 4. A tray icon with a menu

```rust
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;

let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
let new_note = MenuItem::with_id(app, "new", "New note", true, None::<&str>)?;
let menu = Menu::with_items(app, &[&new_note, &quit])?;

TrayIconBuilder::new()
    .menu(&menu)
    .on_menu_event(|app, event| match event.id.as_ref() {
        "quit" => app.exit(0),
        "new" => { let _ = app.emit("new-note", ()); }
        _ => {}
    })
    .build(app)?;
```

## 5. egui: a panel with a table

```rust
impl eframe::App for App {
    fn update(&mut self, ctx: &egui::Context, _f: &mut eframe::Frame) {
        egui::TopBottomPanel::top("bar").show(ctx, |ui| {
            ui.horizontal(|ui| {
                ui.heading("Notes");
                if ui.button("New").clicked() { self.notes.push(Note::default()); }
            });
        });

        egui::CentralPanel::default().show(ctx, |ui| {
            egui::Grid::new("notes").striped(true).show(ui, |ui| {
                ui.label("Title"); ui.label("Updated"); ui.end_row();
                for n in &self.notes {
                    ui.label(&n.title);
                    ui.label(&n.updated);
                    ui.end_row();
                }
            });
        });
    }
}
```

Immediate mode means the UI is a function of state. No observers, no bindings, no
"why is the list stale".

## 6. egui: run a background task and repaint

```rust
fn update(&mut self, ctx: &egui::Context, _f: &mut eframe::Frame) {
    if self.loading {
        ctx.request_repaint();                 // keep animating while work is in flight
        if let Some(result) = self.rx.try_recv().ok() {
            self.data = result;
            self.loading = false;
        }
    }
}
```

Pass data across threads with an `mpsc::Receiver` stored in the app struct, and call
`request_repaint` from the worker when new data arrives.

## 7. iced: the full message loop

```rust
use iced::widget::{button, column, text_input};

#[derive(Debug, Clone)]
enum Message { TitleChanged(String), Save }

struct App { title: String }

impl App {
    fn update(&mut self, msg: Message) -> iced::Task<Message> {
        match msg {
            Message::TitleChanged(t) => { self.title = t; iced::Task::none() }
            Message::Save => iced::Task::future(async { save(&self.title).await })
                .map(|_| Message::TitleChanged(String::new())),
        }
    }

    fn view(&self) -> iced::Element<'_, Message> {
        column![
            text_input("Title", &self.title).on_input(Message::TitleChanged),
            button("Save").on_press(Message::Save),
        ].into()
    }
}
```

`update` returns a `Task` (the next effect), so async work is composable and the state
machine stays pure.

## 8. Local SQLite with migrations

```rust
fn open(dir: &std::path::Path) -> rusqlite::Result<rusqlite::Connection> {
    let conn = rusqlite::Connection::open(dir.join("app.db"))?;
    conn.pragma_update(None, "journal_mode", "WAL")?;      // concurrent reads
    conn.pragma_update(None, "synchronous", "NORMAL")?;    // durability vs speed
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, title TEXT NOT NULL);",
    )?;
    Ok(conn)
}
```

WAL mode is the one setting that makes a local database feel instant. Never store app
data as a JSON file you rewrite on every save — one crash and it is gone.

## 9. Global shortcut with conflict handling

```rust
use tauri_plugin_global_shortcut::GlobalShortcutExt;

match app.global_shortcut().register("CmdOrCtrl+Shift+N") {
    Ok(()) => {}
    Err(e) => {
        // another app owns it: tell the user, offer to change it
        tracing::warn!(error = %e, "shortcut unavailable");
    }
}
```

Silently failing to register is the most common "it worked yesterday" desktop bug.

## 10. Ship small

```toml
[profile.release]
opt-level = "s"
lto = true
codegen-units = 1
panic = "abort"
strip = true
```

```bash
$ npm run tauri build
$ du -h src-tauri/target/release/bundle/appimage/*.AppImage
```

A Tauri app is typically 6–12 MB. If yours is 60 MB, you are bundling assets you do
not need — check `tauri.conf.json` and your frontend build output.

## The desktop checklist

- [ ] cold start under 1 s
- [ ] installer under 15 MB
- [ ] offline-first: the app is usable with no network
- [ ] file dialogs, not path text fields
- [ ] tray/menu entries with working accelerators
- [ ] single-instance lock
- [ ] signed build + signed update manifest
- [ ] crash log written locally and surfaced on next start

**Back to:** [Examples](../README.md)
