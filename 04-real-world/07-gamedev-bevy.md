# 07 · Game Development with Bevy

Bevy is the most active Rust game engine. Its defining idea is **ECS** (Entity
Component System): data lives in components, behaviour lives in systems, and the
engine schedules systems to run in parallel wherever they do not conflict.

> **Version note:** Bevy's API changes quickly (roughly quarterly). The examples
> below target the 0.15/0.16 era (`Camera2d` and `Sprite` as components, required
> components instead of `*Bundle`). If something does not compile, check the
> migration guide for your version — that is normal in Bevy, not a mistake on
> your part.

## Setup

```toml
[package]
name = "my_game"
version = "0.1.0"
edition = "2021"

[dependencies]
bevy = "0.16"

# Much faster builds during development
[profile.dev]
opt-level = 1

[profile.dev.package."*"]
opt-level = 3
```

```bash
$ cargo run
```

The first build compiles ~400 crates and takes several minutes. After that,
incremental builds are seconds.

## The smallest game

```rust
use bevy::prelude::*;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_systems(Startup, setup)
        .add_systems(Update, spin)
        .run();
}

#[derive(Component)]
struct Spinner;

fn setup(mut commands: Commands, asset_server: Res<AssetServer>) {
    commands.spawn(Camera2d);

    commands.spawn((
        Sprite::from_image(asset_server.load("player.png")),
        Transform::from_xyz(0.0, 0.0, 0.0),
        Spinner,
    ));
}

fn spin(time: Res<Time>, mut query: Query<&mut Transform, With<Spinner>>) {
    for mut transform in &mut query {
        transform.rotate_z(1.0 * time.delta_secs());
    }
}
```

Read that as: "on startup, create a camera and an entity with a sprite and a
`Spinner` marker; every frame, rotate everything with a `Spinner`."

`Query<&mut Transform, With<Spinner>>` is a **system parameter** — Bevy uses the
type to decide which entities match and, because the types declare access, it can
run non-conflicting systems in parallel on different threads.

## ECS in one page

| Concept | Meaning |
| --- | --- |
| **Entity** | an ID. Nothing else. Cheap to create and destroy |
| **Component** | a plain struct of data attached to an entity |
| **System** | a function that reads/writes components |
| **Resource** | a singleton, like `Time` or your `Score` |
| **Query** | a typed filter over entities and their components |
| **Schedule** | an ordered set of systems (`Startup`, `Update`, `FixedUpdate`) |

```rust
#[derive(Component)] struct Health { current: f32, max: f32 }
#[derive(Component)] struct Player;
#[derive(Component)] struct Enemy;
#[derive(Resource)] struct Score(u32);
```

## Movement and input

```rust
use bevy::input::keyboard::KeyCode;

fn move_player(
    keys: Res<ButtonInput<KeyCode>>,
    time: Res<Time>,
    mut q: Query<&mut Transform, With<Player>>,
) {
    const SPEED: f32 = 300.0;
    let mut dir = Vec2::ZERO;
    if keys.pressed(KeyCode::KeyW) { dir.y += 1.0; }
    if keys.pressed(KeyCode::KeyS) { dir.y -= 1.0; }
    if keys.pressed(KeyCode::KeyA) { dir.x -= 1.0; }
    if keys.pressed(KeyCode::KeyD) { dir.x += 1.0; }

    if dir != Vec2::ZERO {
        let dir = dir.normalize();
        for mut t in &mut q {
            t.translation += (dir * SPEED * time.delta_secs()).extend(0.0);
        }
    }
}
```

## Spawning and despawning

```rust
fn spawn_enemy(mut commands: Commands, asset_server: Res<AssetServer>) {
    commands.spawn((
        Sprite::from_image(asset_server.load("enemy.png")),
        Transform::from_xyz(400.0, 0.0, 0.0),
        Enemy,
        Health { current: 30.0, max: 30.0 },
    ));
}

fn cleanup(mut commands: Commands, q: Query<(Entity, &Health)>) {
    for (entity, health) in &q {
        if health.current <= 0.0 {
            commands.entity(entity).despawn();     // deferred to end of stage
        }
    }
}
```

`commands` are **deferred**: they apply at a synchronisation point, not
immediately. That is why you can despawn an entity you are still iterating over.

## Combat: a system that touches two queries

```rust
#[derive(Event)]
struct Hit { target: Entity, damage: f32 }

fn apply_hits(
    mut events: EventReader<Hit>,
    mut q: Query<&mut Health>,
) {
    for hit in events.read() {
        if let Ok(mut health) = q.get_mut(hit.target) {
            health.current -= hit.damage;
        }
    }
}

// registration
app.add_event::<Hit>();
app.add_systems(Update, apply_hits);
```

## UI: text and score

```rust
#[derive(Component)]
struct ScoreText;

fn setup_ui(mut commands: Commands, asset_server: Res<AssetServer>) {
    commands.spawn((
        Text::new("Score: 0"),
        TextFont { font: asset_server.load("fonts/FiraSans-Bold.ttf"), font_size: 32.0, ..default() },
        TextColor(Color::WHITE),
        Node { position_type: PositionType::Absolute, top: Val::Px(12.0), left: Val::Px(12.0), ..default() },
        ScoreText,
    ));
}

fn update_score(score: Res<Score>, mut q: Query<&mut Text, With<ScoreText>>) {
    if !score.is_changed() { return; }
    for mut text in &mut q {
        **text = format!("Score: {}", score.0);
    }
}
```

`Res<T>::is_changed()` is the cheap way to skip work when nothing happened —
Bevy tracks change detection per component and per resource.

## Fixed timestep for physics

```rust
app.add_systems(FixedUpdate, physics_step);

// FixedUpdate runs at a fixed rate regardless of frame rate
// configure once:
// app.insert_resource(Time::<Fixed>::from_hz(60.0));
```

Use `FixedUpdate` for physics and game logic that must be deterministic; use
`Update` for input, animation and UI. Mixing them causes the classic
"jumps higher on a fast machine" bug.

## Assets and hot reload

```rust
let texture: Handle<Image> = asset_server.load("sprites/player.png");
```

Assets are loaded by path and return a `Handle`. In debug builds Bevy watches the
assets directory and hot-reloads on save — a large quality-of-life win.

## Performance notes

| Symptom | Cause | Fix |
| --- | --- | --- |
| Low FPS with few entities | per-frame allocation | reuse buffers, avoid `format!` in `Update` |
| Frame spikes | asset loading on the main thread | preload in `Startup`, use `AssetServer` states |
| Systems not parallel | one system queries `&mut` everything | split into narrower queries |
| Huge binary | default features | `default-features = false`, enable only what you need |

```toml
bevy = { version = "0.16", default-features = false, features = [
    "bevy_sprite", "bevy_text", "bevy_ui", "bevy_winit", "png", "x11"
] }
```

## Ecosystem

| Crate | Purpose |
| --- | --- |
| `bevy_rapier2d` / `bevy_rapier3d` | physics |
| `avian2d` / `avian3d` | ECS-native physics (newer alternative) |
| `bevy_egui` | immediate-mode debug UI |
| `bevy-inspector-egui` | live entity inspector — invaluable |
| `bevy_asset_loader` | declarative asset loading states |
| `leafwing-input-manager` | action-mapped input |
| `bevy_kira_audio` | audio |
| `iyes_progress` | loading screens |

Install `bevy-inspector-egui` on day one. Being able to see and edit every
component live saves hours.

## Honest assessment

**Good:** data-oriented architecture, hot reload, excellent 2D, no GC pauses,
strong community momentum, compiles to WASM and native.

**Costs:** API churn between versions, compile times, a smaller asset store than
Unity, and 3D is less mature than 2D.

**When to pick it:** a 2D game, a prototype where you want determinism and no
engine licence, or a game whose logic you want to unit test.

**When not to:** a large 3D title on a deadline, or a team of artists who need
Unity/Unreal tooling.

---

## Exercises

1. Build the spinning-sprite example and add WASD movement.
2. Add a `Score` resource, an `Hit` event, and a system that increments the score
   when an enemy's health reaches zero.
3. Move physics into `FixedUpdate` at 60 Hz and verify behaviour is
   frame-rate-independent by capping the frame rate to 30.
4. Add a `bevy_egui` debug window showing entity count.
5. Split one fat `&mut Transform` system into two narrower systems and check with
   the inspector that they run in parallel.
6. Disable default features and enable only 2D + UI; measure the binary size
   difference.

**Next:** [Data pipelines](08-data-pipelines.md)
