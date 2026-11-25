# 06 · Embedded and IoT

Rust on microcontrollers: no OS, no allocator required, and the same ownership
rules that make systems code safe make firmware safe. Memory errors in firmware
are bricked devices, so this is where Rust's guarantees pay off most.

## The stack

| Layer | Crate | Role |
| --- | --- | --- |
| Language | `#![no_std]` | no standard library |
| HAL traits | `embedded-hal` | standard interfaces (GPIO, SPI, I2C) |
| Async HAL | `embedded-hal-async` | async versions |
| Chip support | `cortex-m`, `cortex-m-rt` | ARM Cortex-M runtime |
| PAC | `stm32f4xx-hal` etc. | register-level access |
| HAL | `embassy-stm32`, `rp2040-hal` | ergonomic per-chip drivers |
| Async runtime | `embassy-executor` | no-alloc async executor |
| Logging | `defmt` | deferred formatting, tiny binary size |
| Flashing | `probe-rs` | debug probe flashing + RTT logging |
| RTOS-ish | `rtic` | real-time scheduling with priorities |

## `no_std` vs `std`

```rust
#![no_std]
#![no_main]

use cortex_m_rt::entry;
use panic_halt as _;        // what to do on panic

#[entry]
fn main() -> ! {
    loop {}                  // embedded main never returns
}
```

You lose `std`'s `String`, `Vec` (unless you add `alloc` with a heap), threads,
files and networking. You gain a binary that fits in 16 KB and boots in
microseconds.

`panic_halt` on panic: an infinite loop. Alternatives: `panic_abort`,
`panic_probe` (prints over RTT then halts — the useful one while developing).

## Blinky: the "hello world"

```toml
[package]
name = "blinky"
version = "0.1.0"
edition = "2021"

[dependencies]
cortex-m = "0.7"
cortex-m-rt = "0.7"
panic-probe = { version = "0.3", features = ["print-defmt"] }
defmt = "0.3"
defmt-rtt = "0.4"
embassy-executor = { version = "0.6", features = ["arch-cortex-m", "executor-thread", "integrated-timers"] }
embassy-time = { version = "0.3", features = ["tick-hz-32_768"] }
embassy-stm32 = { version = "0.1", features = ["stm32f411ce", "time-driver-any", "exti"] }

[profile.release]
debug = 2
lto = true
opt-level = "s"
```

```rust
#![no_std]
#![no_main]

use defmt_rtt as _;
use embassy_executor::Spawner;
use embassy_stm32::gpio::{Level, Output, Speed};
use embassy_time::Timer;
use panic_probe as _;

#[embassy_executor::main]
async fn main(_spawner: Spawner) {
    let p = embassy_stm32::init(Default::default());
    let mut led = Output::new(p.PC13, Level::Low, Speed::Low);

    defmt::info!("blinky started");
    loop {
        led.set_high();
        Timer::after_millis(500).await;
        led.set_low();
        Timer::after_millis(500).await;
    }
}
```

```bash
$ cargo run --release       # requires .cargo/config.toml with `runner = "probe-rs run"`
```

> **Gotcha:** async on a microcontroller is not an OS. `Timer::after(...).await`
> suspends the task and the executor runs something else; there is no thread and
> no stack switch. Stack usage per task is fixed at compile time and a deep call
> chain in one task can still overflow the 2–8 KB you gave it.

## `embedded-hal`: driver code that works everywhere

The reason the ecosystem is healthy: a driver written against `embedded-hal`
traits works on every chip.

```rust
use embedded_hal::digital::OutputPin;
use embedded_hal::delay::DelayNs;

pub struct Led<P: OutputPin> { pin: P }

impl<P: OutputPin> Led<P> {
    pub fn new(pin: P) -> Self { Led { pin } }
    pub fn on(&mut self) -> Result<(), P::Error> { self.pin.set_high() }
    pub fn off(&mut self) -> Result<(), P::Error> { self.pin.set_low() }
}

pub fn blink<P: OutputPin, D: DelayNs>(led: &mut Led<P>, delay: &mut D, times: u32) {
    for _ in 0..times {
        let _ = led.on();
        delay.delay_ms(200);
        let _ = led.off();
        delay.delay_ms(200);
    }
}
```

That function compiles for an STM32, an nRF52, an ESP32 and an RP2040 without
change. This is what "traits instead of inheritance" buys you.

## Reading a sensor over I2C

```rust
use embedded_hal::i2c::I2c;

const ADDR: u8 = 0x76;      // BME280

pub fn read_chip_id<I: I2c>(i2c: &mut I) -> Result<u8, I::Error> {
    let mut buf = [0u8; 1];
    i2c.write_read(ADDR, &[0xD0], &mut buf)?;
    Ok(buf[0])
}

pub fn read_temp_raw<I: I2c>(i2c: &mut I) -> Result<i32, I::Error> {
    let mut buf = [0u8; 3];
    i2c.write_read(ADDR, &[0xFA], &mut buf)?;    // temp registers
    Ok(((buf[0] as i32) << 12) | ((buf[1] as i32) << 4) | ((buf[2] as i32) >> 4))
}
```

No allocation, no dynamic dispatch, fixed-size buffers on the stack. Everything is
proven at compile time.

## RTIC: real-time scheduling

```rust
#[rtic::app(device = stm32f4xx_hal::pac, peripherals = true)]
mod app {
    use stm32f4xx_hal::prelude::*;

    #[shared]
    struct Shared { counter: u32 }

    #[local]
    struct Local { led: stm32f4xx_hal::gpio::Pin<'C', 13, Output> }

    #[init]
    fn init(cx: init::Context) -> (Shared, Local) {
        let dp = cx.device;
        let gpio = dp.GPIOC.split();
        let led = gpio.pc13.into_push_pull_output();
        (Shared { counter: 0 }, Local { led })
    }

    #[task(binds = TIM2, local = [led], shared = [counter])]
    fn tick(mut cx: tick::Context) {
        *cx.shared.counter.lock() += 1;
        cx.local.led.toggle();
    }
}
```

RTIC gives you **compile-time-verified** interrupt priorities with no data races:
the borrow checker enforces that two tasks cannot access a shared resource at
conflicting priorities.

## Firmware update (OTA) considerations

The parts people get wrong:

1. **A/B partitions.** Flash two slots; write the new image to the inactive one,
   verify a checksum, flip a boot flag. Never overwrite the running image.
2. **Power loss mid-write** must leave a bootable device. Write-then-verify-then-
   flip-flag is the only safe order.
3. **Signature verification** before boot. An unsigned OTA endpoint is remote
   code execution for anyone who can reach the server.
4. **Rollback.** Keep the previous image until the new one has run for N minutes.

## Practical reality check

| Concern | Reality |
| --- | --- |
| Binary size | Rust firmware is 5–20% larger than C, shrinking with `opt-level="s"` + LTO |
| Toolchain maturity | excellent on Cortex-M and RISC-V; ESP32 and Xtensa also work |
| Debugging | `probe-rs` + `defmt` is better than most C setups |
| Libraries | fewer than C, but `embedded-hal` unifies what exists |
| Hiring | fewer embedded Rust engineers, but they tend to be strong |

## Where Rust embedded is actually used

- **Espressif** ships official Rust support for ESP32.
- **Microsoft Azure Sphere** uses Rust for secure MCU apps.
- **Nordic** supports Rust on nRF52/nRF53.
- Automotive and industrial gateways: RTIC and embassy on Cortex-M.
- **Raspberry Pi Pico** has first-class `embassy-rp` support.

---

## Exercises

1. Get `blinky` running on any dev board with `probe-rs`. If you have no hardware,
   run it under `qemu-system-arm` with the `lm3s6965evb` machine.
2. Write a generic `blink` against `embedded-hal` traits and compile it for two
   different chips.
3. Read a sensor's chip-id over I2C and print it with `defmt::info!`.
4. Convert a polling loop into an `embassy` task with `Timer::after`.
5. Explain why `#![no_main]` is required and what `cortex_m_rt::entry` provides.
6. Design (on paper) an A/B OTA scheme with power-loss safety, and list the
   failure points.

**Next:** [Game development with Bevy](07-gamedev-bevy.md)
