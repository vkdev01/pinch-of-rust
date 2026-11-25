---
summary: A Tauri desktop app that is offline-first, 8 MB, and updates itself — SQLite, global shortcuts, tray and signed updates.
level: Intermediate
time: 10–14 h
tags: [desktop, tauri, sqlite]
---

# desktop-notes — an offline-first desktop app

A notes app that works on a plane, starts in under a second, installs in 8 MB, and
updates itself. It is the smallest complete desktop project that still teaches
everything: local storage, IPC, native integration and release engineering.

**What it is:** a Tauri 2 app — Rust backend, SQLite storage, a small web UI — with a
global hotkey, a tray icon and signed auto-update.

## What you learn

| Skill | Where it comes from |
| --- | --- |
| Rust ↔ JS boundary | typed `#[tauri::command]`, error mapping |
| Local persistence | SQLite + migrations, no JSON files |
| Native integration | tray, global shortcut, file dialogs |
| Release engineering | bundle size, code signing, updater |
| Offline-first design | local write, optional sync later |

## Milestones

| # | Ship | Done when |
| --- | --- | --- |
| 1 | Window with a list | `npm run tauri dev` opens and lists notes |
| 2 | Persist | notes survive a restart |
| 3 | Search | full-text search over 10k notes is instant |
| 4 | Global hotkey | `Cmd/Ctrl+Shift+N` opens a capture window from anywhere |
| 5 | Tray | tray menu with "New note" and "Quit" |
| 6 | Ship | signed installer under 10 MB, auto-update works |

## Backend: storage and commands

```rust
// src-tauri/src/lib.rs
use rusqlite::{params, Connection};
use serde::Serialize;
use std::sync::Mutex;

#[derive(Debug, Serialize)]
pub struct Note { pub id: i64, pub title: String, pub body: String, pub updated_at: String }

pub struct Db(Mutex<Connection>);

#[tauri::command]
fn list_notes(db: tauri::State<Db>) -> Result<Vec<Note>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, title, body, updated_at FROM notes ORDER BY updated_at DESC LIMIT 200")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |r| Ok(Note {
            id: r.get(0)?, title: r.get(1)?, body: r.get(2)?, updated_at: r.get(3)?,
        }))
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
fn save_note(db: tauri::State<Db>, id: Option<i64>, title: String, body: String) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    match id {
        Some(id) => {
            conn.execute(
                "UPDATE notes SET title = ?1, body = ?2, updated_at = datetime('now') WHERE id = ?3",
                params![title, body, id],
            ).map_err(|e| e.to_string())?;
            Ok(id)
        }
        None => {
            conn.execute(
                "INSERT INTO notes (title, body, updated_at) VALUES (?1, ?2, datetime('now'))",
                params![title, body],
            ).map_err(|e| e.to_string())?;
            Ok(conn.last_insert_rowid())
        }
    }
}
```

```rust
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = Connection::open(dir.join("notes.db"))?;
            conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS notes (
                    id INTEGER PRIMARY KEY,
                    title TEXT NOT NULL,
                    body TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                 );
                 CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);",
            )?;
            app.manage(Db(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![list_notes, save_note])
        .run(tauri::generate_context!())
        .expect("failed to run app");
}
```

> **Gotcha:** a `Mutex<Connection>` serialises every query. That is correct and fast
> for a single-user app; if you ever need concurrency, use a pool and WAL mode
> (`PRAGMA journal_mode=WAL`).

## Frontend: typed IPC

```ts
// src/lib/api.ts — one place that knows the command names and shapes
import { invoke } from "@tauri-apps/api/core";

export type Note = { id: number; title: string; body: string; updated_at: string };

export const listNotes = () => invoke<Note[]>("list_notes");
export const saveNote = (n: { id?: number; title: string; body: string }) =>
  invoke<number>("save_note", n);
```

The error type crossing the boundary is a `String` — deliberately. Anything richer
(`thiserror` enums) needs serialising, and a `String` is what you would log anyway.
Map at the edge: `Result<T, E>` inside Rust, `Result<T, string>` at the boundary.

## Search that stays instant

```sql
-- SQLite FTS5: full-text search with no server and no index to maintain
CREATE VIRTUAL TABLE notes_fts USING fts5(title, body, content='notes', content_rowid='id');

CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;
```

```rust
let mut stmt = conn.prepare(
    "SELECT n.id, n.title, n.body FROM notes_fts f JOIN notes n ON n.id = f.rowid
     WHERE notes_fts MATCH ?1 ORDER BY rank LIMIT 50",
)?;
```

10,000 notes searched in under a millisecond. A `LIKE '%term%'` scan is 100× slower
and does not rank.

## Global hotkey and tray

```rust
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};

let capture = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyN);

tauri::Builder::default()
    .plugin(tauri_plugin_global_shortcut::Builder::new()
        .with_handler(move |app, shortcut, event| {
            if shortcut == &capture && event.state() == ShortcutState::Pressed {
                if let Some(w) = app.get_webview_window("capture") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        })
        .build())
```

Register shortcuts in `setup` and **handle the conflict case** — another app may
already own the combination, and failing silently is the bug users report as "it
stopped working".

## Release engineering

```json
{
  "bundle": {
    "active": true,
    "targets": ["dmg", "msi", "deb", "appimage"],
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.icns", "icons/icon.ico"],
    "createUpdaterArtifacts": true
  }
}
```

```bash
$ npm run tauri build
$ ls -lh src-tauri/target/release/bundle/dmg/*.dmg     # ~8 MB
```

Three things that are not optional for a shipped app:

1. **Code signing** — unsigned binaries trigger OS warnings and, on macOS, will not
   run without a manual override.
2. **Signed update manifests** — an unsigned updater is remote code execution for
   anyone who can reach the manifest URL.
3. **Atomic install** — write the new version beside the old one, verify, then swap.
   A power cut mid-update must leave a working app.

## Stretch goals

- Sync to a server with conflict resolution (last-write-wins is a trap; try CRDTs).
- Markdown editing with a preview pane.
- A command palette (`Cmd+K`) over all notes.
- Multiple windows: capture window + main window.
- Export to Markdown files in a chosen folder.

## Demo checklist

- [ ] cold start under one second, shown with a stopwatch
- [ ] 10k notes, search returns in under 5 ms
- [ ] global hotkey opens capture from a different app
- [ ] installer under 10 MB
- [ ] an update applied from the previous version, with a rollback test

**Back to:** [Projects](../README.md)
