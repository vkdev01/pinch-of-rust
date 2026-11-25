import type { ReactNode } from "react";

/** Shared frame: hairline card, uppercase label, mono caption. */
export function Figure({
  label,
  caption,
  children,
  className,
}: {
  label: string;
  caption?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure className={`my-7 overflow-hidden rounded-lg border border-border/70 bg-surface/50 ${className ?? ""}`}>
      <figcaption className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2">
        <span className="label text-accent">{label}</span>
        <span className="label-xs text-muted/60">figure</span>
      </figcaption>
      <div className="px-3 py-4">{children}</div>
      {caption ? (
        <p className="border-t border-border/50 px-4 py-2.5 text-[11.5px] leading-relaxed text-muted">
          {caption}
        </p>
      ) : null}
    </figure>
  );
}

export const C = {
  accent: "var(--accent)",
  signal: "var(--signal)",
  fg: "var(--foreground)",
  muted: "var(--muted)",
  border: "var(--border)",
  surface: "var(--surface)",
  success: "var(--success)",
  danger: "var(--danger)",
  warning: "var(--warning)",
};

/** Horizontal bars with a log or linear scale. Good for latency ladders. */
export function BarLadder({
  rows,
  log = false,
  unit,
  highlight,
}: {
  rows: { label: string; value: number; note?: string }[];
  log?: boolean;
  unit: string;
  highlight?: string;
}) {
  const max = Math.max(...rows.map((r) => r.value));
  const min = Math.min(...rows.map((r) => r.value));
  const scale = (v: number) => {
    if (!log) return v / max;
    const lo = Math.log10(Math.max(min, 1));
    const hi = Math.log10(max);
    return (Math.log10(Math.max(v, 1)) - lo) / (hi - lo || 1);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r) => {
        const w = Math.max(2, scale(r.value) * 100);
        const hot = highlight === r.label;
        return (
          <div key={r.label} className="grid grid-cols-[128px_1fr_84px] items-center gap-3">
            <span className="truncate text-right text-[11.5px] text-muted">{r.label}</span>
            <div className="h-3 rounded-sm bg-foreground/[0.04]">
              <div
                className="h-3 rounded-sm"
                style={{
                  width: `${w}%`,
                  background: hot ? C.accent : C.signal,
                  opacity: hot ? 1 : 0.55,
                }}
              />
            </div>
            <span className="num text-[11px] text-foreground/80">
              {r.value >= 1000 ? `${(r.value / 1000).toFixed(r.value >= 10000 ? 0 : 1)}k` : r.value}
              {unit}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Line chart from raw points. x/y already in data units. */
export function LinePlot({
  series,
  xTicks,
  yTicks,
  xLabel,
  yLabel,
  height = 190,
}: {
  series: { name: string; points: [number, number][]; color: string; dash?: string }[];
  xTicks: { at: number; label: string }[];
  yTicks: { at: number; label: string }[];
  xLabel: string;
  yLabel: string;
  height?: number;
}) {
  const W = 620;
  const H = height;
  const padL = 42;
  const padB = 26;
  const padT = 10;
  const padR = 12;

  const xs = series.flatMap((s) => s.points.map((p) => p[0]));
  const ys = series.flatMap((s) => s.points.map((p) => p[1]));
  const xMax = Math.max(...xs);
  const yMax = Math.max(...ys);

  const px = (x: number) => padL + (x / xMax) * (W - padL - padR);
  const py = (y: number) => H - padB - (y / yMax) * (H - padT - padB);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${yLabel} against ${xLabel}`}>
      {yTicks.map((t) => (
        <g key={`y${t.at}`}>
          <line x1={padL} y1={py(t.at)} x2={W - padR} y2={py(t.at)} stroke={C.border} strokeWidth="0.7" strokeDasharray="2 4" />
          <text x={padL - 8} y={py(t.at) + 3} textAnchor="end" fontSize="9.5" fill={C.muted} fontFamily="var(--font-mono)">
            {t.label}
          </text>
        </g>
      ))}
      {xTicks.map((t) => (
        <text key={`x${t.at}`} x={px(t.at)} y={H - 8} textAnchor="middle" fontSize="9.5" fill={C.muted} fontFamily="var(--font-mono)">
          {t.label}
        </text>
      ))}
      {series.map((s) => (
        <polyline
          key={s.name}
          fill="none"
          stroke={s.color}
          strokeWidth="1.8"
          strokeDasharray={s.dash}
          strokeLinejoin="round"
          points={s.points.map((p) => `${px(p[0])},${py(p[1])}`).join(" ")}
        />
      ))}
      <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke={C.border} strokeWidth="1" />
      <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke={C.border} strokeWidth="1" />
    </svg>
  );
}

export function Legend({ items }: { items: { name: string; color: string; dash?: boolean }[] }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((i) => (
        <span key={i.name} className="flex items-center gap-1.5 text-[11px] text-muted">
          <span
            className="inline-block h-0.5 w-4 rounded"
            style={{
              background: i.dash
                ? `repeating-linear-gradient(90deg, ${i.color} 0 4px, transparent 4px 7px)`
                : i.color,
            }}
          />
          {i.name}
        </span>
      ))}
    </div>
  );
}
