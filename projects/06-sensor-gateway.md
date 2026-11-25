---
summary: A battery-powered sensor node that survives the field: embassy async, deep sleep, MQTT and OTA updates.
level: Advanced
time: 14–18 h
tags: [embedded, async, iot]
---

# sensor-gateway — firmware that runs for a year

Desktop Rust forgives mistakes; firmware does not. This project builds a real
sensor node: reads temperature and humidity over I2C, buffers when the network is
down, publishes over MQTT, sleeps at 20 µA, and updates itself over the air.

**What it is:** an `embassy` firmware for an ESP32-C3 or STM32 board, plus a small
Rust gateway that receives the readings and writes them to Postgres.

## What you learn

| Skill | Where it comes from |
| --- | --- |
| `no_std` discipline | no allocator, fixed buffers, `defmt` logging |
| Async on bare metal | `embassy-executor`, timers, interrupts |
| Power budgets | deep sleep, wake sources, measuring µA |
| Offline resilience | ring buffer in flash, at-least-once publish |
| OTA safely | A/B partitions, signature check, rollback |

## Milestones

| # | Ship | Done when |
| --- | --- | --- |
| 1 | Blink | the LED blinks without a HAL panic |
| 2 | Read the sensor | `defmt::info!` prints real temperature |
| 3 | Publish | the gateway logs an MQTT message |
| 4 | Sleep | average draw under 100 µA |
| 5 | Buffer | 10 minutes offline, nothing lost |
| 6 | Update | new firmware over the air, old one kept for rollback |

## Crates

```toml
[dependencies]
embassy-executor = { version = "0.6", features = ["arch-cortex-m", "executor-thread", "integrated-timers"] }
embassy-time = { version = "0.3", features = ["tick-hz-32_768"] }
embassy-stm32 = { version = "0.1", features = ["stm32l4r5zi", "time-driver-any", "exti", "memory-x"] }
embedded-hal = "1"
embedded-hal-async = "1"
defmt = "0.3"
defmt-rtt = "0.4"
panic-probe = { version = "0.3", features = ["print-defmt"] }
heapless = "0.8"          # fixed-capacity Vec/String — no allocator
serde = { version = "1", default-features = false, features = ["derive"] }
serde-json-core = "0.6"   # JSON without alloc

[profile.release]
opt-level = "s"
lto = true
debug = 2                 # keep symbols: you will need the backtrace
```

## The main loop

```rust
#![no_std]
#![no_main]

use defmt_rtt as _;
use embassy_executor::Spawner;
use embassy_stm32::i2c::I2c;
use embassy_stm32::time::Hertz;
use embassy_time::{Duration, Timer};
use panic_probe as _;

const SENSOR: u8 = 0x44;   // SHT40

#[embassy_executor::main]
async fn main(_spawner: Spawner) {
    let p = embassy_stm32::init(Default::default());
    let mut i2c = I2c::new_blocking(p.I2C1, p.PB8, p.PB9, Hertz(100_000), Default::default());

    loop {
        match read_sht40(&mut i2c) {
            Ok((t_c, rh)) => defmt::info!("t={=f32} rh={=f32}", t_c, rh),
            Err(e) => defmt::warn!("sensor error: {:?}", e),
        }
        Timer::after(Duration::from_secs(60)).await;
    }
}

fn read_sht40(i2c: &mut impl embedded_hal::i2c::I2c) -> Result<(f32, f32), embedded_hal::i2c::ErrorKind> {
    // command 0xFD = measure T & RH, high precision
    i2c.write(0x44, &[0xFD]).map_err(|e| e)?;
    // the sensor needs ~8.3 ms; in async code: embassy_time::Timer::after_millis(9).await
    let mut buf = [0u8; 6];
    i2c.read(0x44, &mut buf).map_err(|e| e)?;

    let t_raw = u16::from_be_bytes([buf[0], buf[1]]);
    let rh_raw = u16::from_be_bytes([buf[3], buf[4]]);
    let t_c = -45.0 + 175.0 * (t_raw as f32) / 65535.0;
    let rh = -6.0 + 125.0 * (rh_raw as f32) / 65535.0;
    Ok((t_c, rh.clamp(0.0, 100.0)))
}
```

> **Gotcha:** `I2c::new_blocking` in an async task blocks the executor for the
> duration of the transfer (~1 ms at 100 kHz). Use `I2c::new` with DMA and
> `.await` the transfer, or accept the stall — but know which you chose.

## Sleeping is the whole product

```rust
use embassy_stm32::low_power::StopMode;

// between readings, go to STOP2: ~1.1 µA on an STM32L4, RTC keeps running
StopMode::enter().await;
```

| State | Current | Battery (2000 mAh) |
| --- | --- | --- |
| awake, radio on | 80 mA | — |
| awake, sensor only | 4 mA | — |
| stop mode | 1.1 µA | ~2 years |
| 60 s wake + 2 s radio | ~120 µA avg | ~1.9 years |

Measure it. A $10 USB power meter in line with the board turns "should be low
power" into a number you can defend.

## Buffering when the network is gone

```rust
use heapless::{Deque, Vec};

#[derive(serde::Serialize)]
struct Reading { t: i16, rh: u16, ts: u32 }   // fixed point, no floats on the wire

// 128 readings * 8 bytes = 1 KB of RAM — survive a 2-hour outage
static mut RING: Deque<Reading, 128> = Deque::new();
```

Flush the ring on reconnect, oldest first. Each reading carries a sequence number
so the gateway can drop duplicates — the same idempotency rule as module 04.04,
one layer down.

## OTA without bricking the device

1. Two flash slots: `slot_a` (running) and `slot_b`.
2. Download into the inactive slot, verifying a signature per chunk.
3. Write a boot flag **only after** the whole image verifies.
4. Boot the new slot with a "trial" counter; if it does not check in within 5
   minutes, the bootloader reverts.

Never overwrite the running image. Never flip the boot flag before verification.

## Stretch goals

- `defmt` over RTT replaced by a binary log to flash.
- Sensor calibration coefficients stored in a config partition.
- A second core (ESP32) handling the radio while the first sleeps.
- A gateway dashboard showing battery voltage and last-seen.
- Run the same logic under `qemu-system-arm` in CI so firmware gets tests.

## Demo checklist

- [ ] measured average current, with the meter visible in the video
- [ ] 10 minutes of readings buffered through an unplugged gateway
- [ ] an OTA update and a deliberate rollback
- [ ] `cargo build --release` binary under 128 KB
