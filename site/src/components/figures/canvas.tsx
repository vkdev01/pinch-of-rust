"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { C } from "@/components/figures/parts";

/* ------------------------------------------------------------ helpers */

function useCanvas(
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  deps: unknown[]
) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  const paint = useCallback(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = cv.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (cv.width !== w * dpr || cv.height !== h * dpr) {
      cv.width = w * dpr;
      cv.height = h * dpr;
    }
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    draw(ctx, w, h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    paint();
    const onResize = () => paint();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [paint]);

  return { ref, paint };
}

function css(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

const Frame = ({ children, label }: { children: React.ReactNode; label: string }) => (
  <div className="my-7 overflow-hidden rounded-lg border border-border/70 bg-surface/50">
    <div className="flex items-center justify-between border-b border-border/60 px-4 py-2">
      <span className="label text-accent">{label}</span>
      <span className="label-xs text-muted/60">interactive</span>
    </div>
    {children}
  </div>
);

const Btn = ({
  children, onClick, active, disabled,
}: { children: React.ReactNode; onClick: () => void; active?: boolean; disabled?: boolean }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`rounded-md border px-2.5 py-1 text-[11.5px] transition-colors disabled:opacity-40 ${
      active
        ? "border-accent/60 bg-accent/10 text-foreground"
        : "border-border/80 text-muted hover:border-accent/40 hover:text-foreground"
    }`}
  >
    {children}
  </button>
);

/* ------------------------------------------------------ sort visualiser */

type Algo = "bubble" | "quick";

export function SortCanvas() {
  const N = 64;
  const [values, setValues] = useState<number[]>(() =>
    Array.from({ length: N }, (_, i) => i + 1).sort(() => Math.random() - 0.5)
  );
  const [algo, setAlgo] = useState<Algo>("quick");
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState({ comparisons: 0, writes: 0, done: false });

  // the frames are generated up front, then played back — simple and deterministic
  const frames = useRef<{ arr: number[]; i: number; j: number; cmp: number; wr: number }[]>([]);
  const cursor = useRef(0);

  const build = useCallback(
    (input: number[], kind: Algo) => {
      const arr = [...input];
      const out: { arr: number[]; i: number; j: number; cmp: number; wr: number }[] = [];
      let cmp = 0;
      let wr = 0;
      const snap = (i: number, j: number) => out.push({ arr: [...arr], i, j, cmp, wr });

      if (kind === "bubble") {
        for (let i = 0; i < arr.length - 1; i++) {
          for (let j = 0; j < arr.length - 1 - i; j++) {
            cmp++;
            if (arr[j] > arr[j + 1]) {
              [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
              wr += 2;
            }
            snap(j, j + 1);
          }
        }
      } else {
        const qs = (lo: number, hi: number) => {
          if (lo >= hi) return;
          const pivot = arr[hi];
          let i = lo;
          for (let j = lo; j < hi; j++) {
            cmp++;
            if (arr[j] < pivot) {
              [arr[i], arr[j]] = [arr[j], arr[i]];
              wr += 2;
              snap(i, j);
              i++;
            }
          }
          [arr[i], arr[hi]] = [arr[hi], arr[i]];
          wr += 2;
          snap(i, hi);
          qs(lo, i - 1);
          qs(i + 1, hi);
        };
        qs(0, arr.length - 1);
      }
      snap(-1, -1);
      return out;
    },
    []
  );

  const { ref, paint } = useCanvas(
    (ctx, w, h) => {
      const f = frames.current[cursor.current];
      if (!f) return;
      const barW = w / f.arr.length;
      const max = Math.max(...f.arr);
      for (let k = 0; k < f.arr.length; k++) {
        const v = f.arr[k];
        const bh = (v / max) * (h - 12);
        const isActive = k === f.i || k === f.j;
        ctx.fillStyle = isActive ? css("--accent", "#c2410c") : css("--muted", "#8b93a1");
        ctx.globalAlpha = isActive ? 1 : 0.45;
        ctx.fillRect(k * barW + 0.5, h - bh, Math.max(1, barW - 1), bh);
      }
      ctx.globalAlpha = 1;
    },
    [values, algo]
  );

  useEffect(() => {
    frames.current = build(values, algo);
    cursor.current = 0;
    setStats({ comparisons: 0, writes: 0, done: false });
    paint();
  }, [values, algo, build, paint]);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    const speed = algo === "bubble" ? 3 : 6;

    const tick = (now: number) => {
      if (now - last > 16) {
        last = now;
        cursor.current = Math.min(cursor.current + speed, frames.current.length - 1);
        const f = frames.current[cursor.current];
        if (f) setStats({ comparisons: f.cmp, writes: f.wr, done: cursor.current === frames.current.length - 1 });
        paint();
        if (cursor.current >= frames.current.length - 1) {
          setRunning(false);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, algo, paint]);

  const reset = () => {
    setRunning(false);
    setValues(Array.from({ length: N }, (_, i) => i + 1).sort(() => Math.random() - 0.5));
  };

  return (
    <Frame label="sorting, step by step">
      <div className="px-3 pt-3">
        <canvas ref={ref} className="h-[150px] w-full" aria-label="Bar chart animating a sorting algorithm" role="img" />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border/50 px-3 py-2.5">
        <Btn active={algo === "quick"} onClick={() => { setAlgo("quick"); setRunning(false); }}>quick</Btn>
        <Btn active={algo === "bubble"} onClick={() => { setAlgo("bubble"); setRunning(false); }}>bubble</Btn>
        <span className="mx-1 h-4 w-px bg-border" />
        <Btn onClick={() => setRunning((r) => !r)} active={running}>{running ? "pause" : "play"}</Btn>
        <Btn onClick={reset}>shuffle</Btn>
        <span className="ml-auto num text-[10.5px] text-muted">
          {stats.comparisons} comparisons · {stats.writes} writes{stats.done ? " · sorted" : ""}
        </span>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------ ring buffer */

export function RingCanvas() {
  const CAP = 8;
  const [cells, setCells] = useState<(number | null)[]>(Array(CAP).fill(null));
  const [head, setHead] = useState(0);
  const [tail, setTail] = useState(0);
  const [len, setLen] = useState(0);
  const [next, setNext] = useState(1);
  const [log, setLog] = useState("ready");

  const push = () => {
    if (len === CAP) { setLog("full — push overwrites the oldest"); }
    const idx = head;
    const copy = [...cells];
    const overwritten = copy[idx];
    copy[idx] = next;
    setCells(copy);
    setHead((idx + 1) % CAP);
    setLen((l) => Math.min(l + 1, CAP));
    setNext((n) => n + 1);
    if (overwritten !== null && len === CAP) setTail((t) => (t + 1) % CAP);
    setLog(overwritten !== null && len === CAP ? `wrote ${next}, dropped ${overwritten}` : `wrote ${next} at slot ${idx}`);
  };

  const pop = () => {
    if (len === 0) { setLog("empty — pop returns None"); return; }
    const idx = tail;
    const copy = [...cells];
    const v = copy[idx];
    copy[idx] = null;
    setCells(copy);
    setTail((idx + 1) % CAP);
    setLen((l) => l - 1);
    setLog(`read ${v} from slot ${idx}`);
  };

  const { ref } = useCanvas(
    (ctx, w, h) => {
      const pad = 10;
      const cw = (w - pad * 2) / CAP;
      const ch = h - 34;
      for (let i = 0; i < CAP; i++) {
        const x = pad + i * cw;
        const filled = cells[i] !== null;
        ctx.fillStyle = css("--foreground", "#e8edf5");
        ctx.globalAlpha = filled ? 0 : 0.05;
        ctx.fillRect(x + 1, 12, cw - 2, ch);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = css("--border", "#2a3140");
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 1, 12, cw - 2, ch);
        if (filled) {
          ctx.fillStyle = css("--accent", "#c2410c");
          ctx.globalAlpha = 0.16;
          ctx.fillRect(x + 1, 12, cw - 2, ch);
          ctx.globalAlpha = 1;
          ctx.fillStyle = css("--foreground", "#e8edf5");
          ctx.font = "600 12px ui-monospace, monospace";
          ctx.textAlign = "center";
          ctx.fillText(String(cells[i]), x + cw / 2, 12 + ch / 2 + 4);
        }
        ctx.fillStyle = css("--muted", "#8b93a1");
        ctx.font = "9px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText(String(i), x + cw / 2, h - 16);
      }
      const mark = (idx: number, label: string, color: string, dy: number) => {
        const x = pad + idx * cw + cw / 2;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, 12 + (dy === 0 ? -8 : ch + 8));
        ctx.lineTo(x, 12 + (dy === 0 ? -2 : ch + 2));
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.font = "9px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText(label, x, dy === 0 ? 2 : h - 3);
      };
      mark(head, "head", css("--accent", "#c2410c"), 0);
      mark(tail, "tail", css("--signal", "#2b7a9b"), 1);
    },
    [cells, head, tail]
  );

  return (
    <Frame label="ring buffer — capacity 8">
      <div className="px-3 pt-3">
        <canvas ref={ref} className="h-[110px] w-full" aria-label="Ring buffer slots with head and tail pointers" role="img" />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border/50 px-3 py-2.5">
        <Btn onClick={push}>push</Btn>
        <Btn onClick={pop}>pop</Btn>
        <span className="mx-1 h-4 w-px bg-border" />
        <span className="num text-[10.5px] text-muted">len {len}/{CAP}</span>
        <span className="ml-auto text-[11px] text-muted">{log}</span>
      </div>
    </Frame>
  );
}

/* -------------------------------------------------- borrow simulator */

type Borrow = { id: number; kind: "shared" | "mut" };

export function BorrowCanvas() {
  const [borrows, setBorrows] = useState<Borrow[]>([]);
  const [msg, setMsg] = useState("no borrows — the owner can mutate freely");
  const [nextId, setNextId] = useState(1);

  const add = (kind: "shared" | "mut") => {
    const hasMut = borrows.some((b) => b.kind === "mut");
    if (kind === "mut" && borrows.length > 0) {
      setMsg("rejected: a &mut cannot coexist with any other borrow");
      return;
    }
    if (kind === "shared" && hasMut) {
      setMsg("rejected: a & would overlap a live &mut");
      return;
    }
    setBorrows((b) => [...b, { id: nextId, kind }]);
    setNextId((n) => n + 1);
    setMsg(kind === "mut" ? "&mut added — owner is frozen" : "& added — reads are safe");
  };

  const drop = (id: number) => {
    setBorrows((b) => b.filter((x) => x.id !== id));
    setMsg("borrow ended — the value is free again");
  };

  return (
    <Frame label="the borrow rules, live">
      <div className="px-3 pt-3">
        <div className="flex min-h-[54px] flex-wrap items-center gap-1.5 rounded-md border border-dashed border-border/70 p-2">
          <span className="num mr-1 rounded bg-accent/15 px-2 py-1 text-[10.5px] text-accent">owner: value</span>
          {borrows.length === 0 ? (
            <span className="text-[11px] text-muted/70">no live borrows</span>
          ) : (
            borrows.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => drop(b.id)}
                title="drop this borrow"
                className={`num rounded px-2 py-1 text-[10.5px] transition-opacity hover:opacity-70 ${
                  b.kind === "mut"
                    ? "bg-warning/20 text-warning"
                    : "bg-signal/15 text-[color:var(--signal)]"
                }`}
              >
                {b.kind === "mut" ? "&mut" : "&"} #{b.id} ×
              </button>
            ))
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border/50 px-3 py-2.5">
        <Btn onClick={() => add("shared")}>borrow &amp;</Btn>
        <Btn onClick={() => add("mut")}>borrow &amp;mut</Btn>
        <Btn onClick={() => { setBorrows([]); setMsg("all borrows dropped"); }}>drop all</Btn>
        <span className="ml-auto text-[11px] text-muted">{msg}</span>
      </div>
    </Frame>
  );
}
