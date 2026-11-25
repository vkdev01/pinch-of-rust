import { BarLadder, C, Figure, Legend, LinePlot } from "@/components/figures/parts";

/* ---------------------------------------------------------------- Big-O */

export function ComplexityChart() {
  return (
    <Figure
      label="cost at n = 1,000,000"
      caption="Same problem, four growth rates, on a log scale. At a million rows the difference between O(n log n) and O(n²) is the difference between 20 ms and 11 days."
    >
      <BarLadder
        log
        unit=" ops"
        highlight="O(n²)"
        rows={[
          { label: "O(log n)", value: 20 },
          { label: "O(n)", value: 1_000_000 },
          { label: "O(n log n)", value: 20_000_000 },
          { label: "O(n²)", value: 1_000_000_000_000 },
        ]}
      />
    </Figure>
  );
}

/* ------------------------------------------------------- memory ladder */

export function MemoryLatencyChart() {
  return (
    <Figure
      label="memory latency ladder"
      caption="Why the data layout beats the algorithm below ~10,000 elements: one RAM miss costs as much as ~100 L1 hits. A pointer chase per element is a miss per element."
    >
      <BarLadder
        log
        unit="ns"
        highlight="RAM"
        rows={[
          { label: "L1 cache", value: 1 },
          { label: "L2 cache", value: 4 },
          { label: "L3 cache", value: 20 },
          { label: "RAM", value: 100 },
          { label: "NVMe SSD", value: 16_000 },
          { label: "Network RTT", value: 500_000 },
        ]}
      />
    </Figure>
  );
}

/* ------------------------------------------------------ thread scaling */

export function ThreadScalingChart() {
  const threads = [1, 2, 4, 8, 16];
  const ideal = threads.map((t) => [t, t] as [number, number]);
  const amdahl = (serial: number) => (t: number) => 1 / (serial + (1 - serial) / t);

  const p90 = amdahl(0.1);
  const p50 = amdahl(0.5);

  return (
    <Figure
      label="speedup vs threads"
      caption="Amdahl's law, drawn. With 10% of the work serialised you cap at 10×; with 50% you cap at 2×. Adding threads past the knee buys context switches, not throughput."
    >
      <LinePlot
        height={200}
        xLabel="threads"
        yLabel="speedup"
        xTicks={threads.map((t) => ({ at: t, label: `${t}` }))}
        yTicks={[0, 4, 8, 12, 16].map((v) => ({ at: v, label: `${v}×` }))}
        series={[
          { name: "ideal", points: ideal, color: C.border, dash: "4 4" },
          { name: "10% serial", points: threads.map((t) => [t, p90(t)] as [number, number]), color: C.accent },
          { name: "50% serial", points: threads.map((t) => [t, p50(t)] as [number, number]), color: C.signal },
        ]}
      />
      <Legend
        items={[
          { name: "ideal (linear)", color: C.border, dash: true },
          { name: "10% serialised", color: C.accent },
          { name: "50% serialised", color: C.signal },
        ]}
      />
    </Figure>
  );
}

/* ------------------------------------------------------- latency budget */

export function LatencyBudgetChart() {
  const steps = [
    { label: "wire → userspace", ns: 1200, color: C.fg, opacity: 0.32 },
    { label: "parse message", ns: 120, color: C.signal, opacity: 0.9 },
    { label: "book update", ns: 80, color: C.accent, opacity: 0.95 },
    { label: "strategy", ns: 300, color: C.warning, opacity: 0.9 },
    { label: "risk check", ns: 150, color: C.success, opacity: 0.9 },
    { label: "serialise + send", ns: 200, color: C.danger, opacity: 0.9 },
  ];
  const total = steps.reduce((a, s) => a + s.ns, 0);

  return (
    <Figure
      label="tick-to-trade budget"
      caption={`A realistic path totals ~${(total / 1000).toFixed(1)} µs, and 60% of it is the network stack. Every allocation, log line or lock you add is measured against a 100 ns bar.`}
    >
      <div className="flex h-9 w-full overflow-hidden rounded-sm">
        {steps.map((s) => (
          <div
            key={s.label}
            style={{ width: `${(s.ns / total) * 100}%`, background: s.color, opacity: s.opacity }}
            title={`${s.label}: ${s.ns} ns`}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-1.5 sm:grid-cols-3">
        {steps.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-sm" style={{ background: s.color, opacity: s.opacity }} />
            <span className="flex-1 truncate text-[11px] text-muted">{s.label}</span>
            <span className="num text-[10.5px] text-foreground/80">{s.ns} ns</span>
          </div>
        ))}
      </div>
    </Figure>
  );
}

/* -------------------------------------------------------- bundle sizes */

export function BundleSizeChart() {
  return (
    <Figure
      label="install size, same app"
      caption="The Electron → Tauri migration in one chart. A webview you did not ship is the entire argument."
    >
      <BarLadder
        unit=" MB"
        highlight="Tauri"
        rows={[
          { label: "Electron", value: 120 },
          { label: "Slint", value: 18 },
          { label: "egui / iced", value: 12 },
          { label: "Tauri", value: 8 },
        ]}
      />
    </Figure>
  );
}

/* -------------------------------------------------------- queue depth */

export function QueueDepthChart() {
  // a burst, a bounded buffer, and a drain
  const points = [
    0, 2, 6, 18, 42, 80, 96, 100, 100, 100, 92, 74, 55, 38, 24, 14, 8, 4, 2, 1, 0, 0,
  ];
  const W = 620;
  const H = 120;
  const max = 100;
  const step = W / (points.length - 1);
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(H - (p / max) * (H - 8)).toFixed(1)}`)
    .join(" ");

  return (
    <Figure
      label="queue depth under a burst"
      caption="A bounded queue absorbs the spike, then the producer waits. Depth is the memory you committed to; the plateau is backpressure doing its job."
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Queue depth rising to a cap then draining">
        <defs>
          <linearGradient id="qd" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.accent} stopOpacity="0.35" />
            <stop offset="100%" stopColor={C.accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" y1={H - 8} x2={W} y2={H - 8} stroke={C.border} strokeWidth="1" />
        <line x1="0" y1={8} x2={W} y2={8} stroke={C.border} strokeDasharray="3 4" strokeWidth="0.8" />
        <text x={4} y={18} fontSize="9" fill={C.muted} fontFamily="var(--font-mono)">
          capacity
        </text>
        <path d={`${path} L${W},${H - 8} L0,${H - 8} Z`} fill="url(#qd)" />
        <path d={path} fill="none" stroke={C.accent} strokeWidth="1.6" />
      </svg>
    </Figure>
  );
}
