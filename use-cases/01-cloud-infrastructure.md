---
summary: Where Rust runs at the bottom of the stack — microVMs, proxies, kernels — and the properties that got it there.
level: Intermediate
time: 25 min
tags: [infra, networking, systems]
---

# Cloud infrastructure

This is Rust's strongest claim: the places where a memory bug is a security
incident, and a garbage-collection pause is an outage.

## What the domain demands

| Requirement | Why it decides the language |
| --- | --- |
| No GC pauses | A 50 ms pause in a proxy is a timeout for 10,000 clients |
| Predictable memory | Container limits are hard; RSS must be flat |
| Safety without a runtime | The kernel cannot trust a GC |
| Small binaries | Boot time and cold-start cost scale with image size |
| Multithreaded by default | One core per request is not affordable |

Rust hits all five at once. That is unusual — C++ hits the first four and loses
the fifth (safety), Go hits the last two and loses the first.

## Who runs it, and what they replaced

| System | What Rust replaced | Why |
| --- | --- | --- |
| **AWS Firecracker** | full VMs / containers for Lambda and Fargate | microVMs boot in ~125 ms with ~5 MB overhead; written in Rust for the isolation guarantees |
| **Cloudflare Pingora** | NGINX for their edge proxy | memory safety plus a threading model that survives hundreds of thousands of connections per process; Cloudflare reported serving over a trillion requests a day on it |
| **Discord "Read States"** | a Go service | Go's GC caused tail-latency spikes at their read volume; the Rust rewrite removed the pauses |
| **Dropbox "Nucleus"** | their old sync engine | a rewrite that had to be correct under partial failure on millions of machines |
| **Linux kernel** | C, for new drivers | Rust support landed in 6.1; GPU drivers for Apple silicon are the most visible in-tree users |
| **Android** | C/C++ in new code | Google reported memory-safety vulnerabilities falling sharply as the share of new Rust code rose |

The pattern: nobody rewrites everything. They rewrite the **hot, dangerous
component** and leave the rest.

## The shape of the code

A proxy's core loop, in the form Cloudflare describes it: accept, route, forward,
with no allocation on the request path.

```rust
use std::sync::Arc;
use tokio::net::{TcpListener, TcpStream};

pub async fn serve(listener: TcpListener, upstreams: Arc<Vec<String>>) -> std::io::Result<()> {
    loop {
        let (client, peer) = listener.accept().await?;
        let upstreams = Arc::clone(&upstreams);

        // one task per connection, no thread per connection
        tokio::spawn(async move {
            if let Err(e) = handle(client, &upstreams, peer).await {
                tracing::debug!(%peer, error = %e, "connection closed");
            }
        });
    }
}

async fn handle(
    mut client: TcpStream,
    upstreams: &[String],
    _peer: std::net::SocketAddr,
) -> std::io::Result<()> {
    // pick an upstream without allocating; health state lives in an atomic
    let idx = fastrand::usize(..upstreams.len());
    let mut upstream = TcpStream::connect(&upstreams[idx]).await?;
    tokio::io::copy_bidirectional(&mut client, &mut upstream).await?;
    Ok(())
}
```

Three things to notice, because they are why this is fast:

- **`spawn` per connection**, not per thread. 100k connections = 100k futures on a
  handful of threads.
- **`copy_bidirectional`** uses a fixed buffer and moves bytes without parsing
  them. Parsing every byte is how proxies get slow.
- **`Arc<Vec<String>>`**, cloned once per connection. A `String` per request would
  allocate on the hot path.

## What to steal for your own service

1. **Flat memory is a feature you can sell.** No GC means `memory.limit` in
   Kubernetes is a real ceiling, not a suggestion.
2. **Start with the hot path, not the whole service.** Rewrite one endpoint, ship
   it, measure. Firecracker started as a VMM, not an operating system.
3. **Instrument the tail, not the mean.** p99 is where Rust's advantage shows up,
   and where the business case lives.

## Where Rust is the wrong answer

- A control plane that runs a few hundred requests a minute: use Go or Python.
- Anything where the team's velocity matters more than the last 20% of latency.
- Glue code between managed services — the network dominates, not the CPU.

## Try it

Take any Rust HTTP service you have built and put it behind a load test with a
50 ms upstream. Watch p99 stay flat while a GC'd equivalent spikes. That
measurement is the entire argument.

**Next:** [Developer tools](02-developer-tools.md)
