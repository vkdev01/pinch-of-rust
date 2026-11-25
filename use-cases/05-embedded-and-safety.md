---
summary: Firmware, robotics and certified systems — where a use-after-free is a recalled product.
level: Advanced
time: 25 min
tags: [embedded, safety, no_std]
---

# Embedded and safety-critical

Rust's pitch — memory safety without a garbage collector — matters most where
there is no operating system to clean up after you.

## What the domain demands

| Requirement | Consequence |
| --- | --- |
| No heap | A 64 KB RAM part cannot afford an allocator |
| Deterministic timing | An interrupt that arrives 200 µs late is a missed deadline |
| No hidden allocation | `Vec` growth in an ISR is a bug, not a slow path |
| Provable absence of UB | Certification bodies require it, not just tests |
| Long support windows | Firmware ships for 15 years |

The absence of a GC is not a performance argument here; it is a correctness
argument. There is nowhere to run a collector.

## Who runs it

| System | Detail |
| --- | --- |
| **Espressif (ESP32)** | first-class Rust support via `esp-hal`; officially maintained, not a community fork |
| **Microsoft Azure Sphere** | Rust supported for applications on the secured MCU platform |
| **Linux kernel** | Rust in-tree since 6.1; real drivers, not just samples |
| **Ferrocene** | a qualified Rust toolchain for ISO 26262 (automotive) and IEC 61508 (industrial) — certification is what unlocks safety-critical adoption |
| **RTIC** | a real-time concurrency framework whose interrupt priorities are checked at compile time |
| **Drone and robotics stacks** | Rust in flight-controller components where a panic is a crash — literally |

## The compile-time guarantee that sells it

RTIC's trick: the borrow checker enforces that two interrupt handlers at
conflicting priorities cannot access the same peripheral.

```rust
#[rtic::app(device = stm32l4xx_hal::pac, peripherals = true, dispatchers = [TIM3])]
mod app {
    use stm32l4xx_hal::prelude::*;

    #[shared]
    struct Shared {
        // only reachable through a lock — RTIC proves no two tasks hold it at once
        readings: heapless::Deque<Reading, 64>,
    }

    #[local]
    struct Local {
        sensor: Sht40<I2c1>,
        radio: Radio,
    }

    #[init]
    fn init(_cx: init::Context) -> (Shared, Local) {
        (Shared { readings: heapless::Deque::new() }, Local { /* … */ })
    }

    /// Highest priority: read the sensor, never block.
    #[task(binds = EXTI0, local = [sensor], shared = [readings], priority = 4)]
    fn on_sensor_ready(mut cx: on_sensor_ready::Context) {
        if let Ok(r) = cx.local.sensor.read() {
            let _ = cx.shared.readings.lock(|q| q.push_back(r));   // non-blocking push
        }
    }

    /// Lower priority: drain the queue and transmit when there is room.
    #[task(local = [radio], shared = [readings], priority = 2)]
    async fn flush(mut cx: flush::Context) {
        if let Some(r) = cx.shared.readings.lock(|q| q.pop_front()) {
            cx.local.radio.send(r).await;
        }
    }
}
```

If `flush` and `on_sensor_ready` both tried to take `&mut readings` without the
lock, it would not compile. On bare metal, that is the difference between a design
review and a runtime heisenbug.

## Fixed capacity is a design tool

```rust
use heapless::{Deque, String, Vec};

// 64 readings × 8 bytes = 512 bytes, known at compile time, no fragmentation
static mut QUEUE: Deque<Reading, 64> = Deque::new();

// a formatted log line that cannot allocate
let mut line: String<64> = String::new();
let _ = core::fmt::write(&mut line, format_args!("t={} rh={}", t, rh));
defmt::info!("{}", line.as_str());
```

`heapless` collections return `Err(())` on overflow instead of growing. That error
is a design decision you have to make explicitly — which is exactly what firmware
requires.

## Panics are not free

```toml
# a panic handler must exist; choose deliberately
panic-halt = "0.2"          # infinite loop — the device stops responding
# panic-probe              # log over RTT, then halt — best while developing
# panic-reset              # reboot — right for a watchdog-supervised device
```

For a device in the field, `panic-reset` plus a watchdog is usually correct: a
reboot recovers, a halt bricks. Log the panic reason to a retained RAM region so
you can read it after the restart.

## The testing gap, and how to close it

Firmware is famously untestable. Three techniques that work:

1. **Separate logic from hardware.** Put the state machine in a `no_std` crate with
   no HAL dependency, test it on the host with `cargo test`.
2. **Fake the HAL.** Implement `embedded-hal` traits for a mock sensor that
   returns scripted values, including errors.
3. **Run the firmware in QEMU in CI.** `qemu-system-arm -machine lm3s6965evb` boots
   a Cortex-M binary; `defmt` output can be asserted on.

```rust
#[cfg(test)]
mod tests {
    use super::*;

    struct FlakySensor { calls: usize }

    impl embedded_hal::i2c::ErrorType for FlakySensor { type Error = core::convert::Infallible; }
    impl embedded_hal::i2c::I2c for FlakySensor {
        fn read(&mut self, _addr: u8, buf: &mut [u8]) -> Result<(), Self::Error> {
            self.calls += 1;
            if self.calls == 2 { buf.fill(0); }   // simulate a stuck sensor
            Ok(())
        }
        fn write(&mut self, _addr: u8, _bytes: &[u8]) -> Result<(), Self::Error> { Ok(()) }
    }

    #[test]
    fn survives_a_stuck_sensor() {
        let mut sensor = FlakySensor { calls: 0 };
        assert!(read_temperature(&mut sensor).is_err() || read_temperature(&mut sensor).is_ok());
    }
}
```

## What to steal for your own project

1. **`defmt` over `println!`.** Deferred formatting means the format string lives
   in the debugger, not the binary — often a 30% size reduction.
2. **`probe-rs` for flashing and logging.** One tool, no vendor IDE.
3. **Budget flash and RAM in CI.** `cargo size --release` in the pipeline catches
   the day someone pulls in `core::fmt`.

## Where Rust is the wrong answer

- A part with no LLVM backend. If `rustc` cannot target it, the conversation ends.
- Teams with existing certified C code and no appetite for re-certification.
- Ultra-low-power parts where a 20 KB binary is already too big.

## Try it

Build `blinky` for any Cortex-M board (or QEMU), then rewrite it against
`embedded-hal` traits and compile the same function for a second chip. The moment
the identical driver code compiles for two different MCUs is the moment the
ecosystem's design makes sense.

**Next:** [Web and WebAssembly](06-web-and-wasm.md)
