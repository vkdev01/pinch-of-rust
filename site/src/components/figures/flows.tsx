import { C, Figure } from "@/components/figures/parts";

type Tone = "plain" | "accent" | "signal" | "warn";

const toneColor: Record<Tone, string> = {
  plain: C.border,
  accent: C.accent,
  signal: C.signal,
  warn: C.warning,
};

function Node({
  x, y, w, h, title, sub, tone = "plain", dashed,
}: {
  x: number; y: number; w: number; h: number;
  title: string; sub?: string; tone?: Tone; dashed?: boolean;
}) {
  return (
    <g>
      <rect
        x={x} y={y} width={w} height={h} rx={7}
        fill={C.surface}
        stroke={toneColor[tone]}
        strokeWidth={tone === "plain" ? 1 : 1.3}
        strokeDasharray={dashed ? "4 3" : undefined}
      />
      <text x={x + w / 2} y={y + (sub ? h / 2 - 3 : h / 2 + 4)} textAnchor="middle" fontSize="11" fontFamily="var(--font-mono)" fill={C.fg}>
        {title}
      </text>
      {sub ? (
        <text x={x + w / 2} y={y + h / 2 + 11} textAnchor="middle" fontSize="8.5" letterSpacing="0.06em" fill={C.muted}>
          {sub}
        </text>
      ) : null}
    </g>
  );
}

function Arrow({
  id, d, dashed,
}: { id: string; d: string; label?: string; dashed?: boolean }) {
  return (
    <path
      d={d}
      fill="none"
      stroke={C.muted}
      strokeWidth="1.1"
      strokeDasharray={dashed ? "4 3" : undefined}
      markerEnd={`url(#${id})`}
    />
  );
}

function Marker({ id }: { id: string }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto">
        <path d="M0 0 L10 5 L0 10 z" fill={C.muted} />
      </marker>
    </defs>
  );
}

/* --------------------------------------------------- ownership lanes */

export function OwnershipFlow() {
  const lanes = [
    { y: 24, op: "let b = a;", what: "MOVE", effect: "b owns it · a is invalid", tone: "accent" as Tone },
    { y: 88, op: "let b = a.clone();", what: "CLONE", effect: "both valid · one allocation", tone: "signal" as Tone },
    { y: 152, op: "fn f(x: &T)", what: "SHARE", effect: "many readers · owner keeps it", tone: "plain" as Tone },
    { y: 216, op: "fn f(x: &mut T)", what: "EXCLUSIVE", effect: "one writer · no other borrows", tone: "warn" as Tone },
  ];

  return (
    <Figure
      label="who owns it?"
      caption="Four ways to pass a value. The compiler rejects the fifth: a &mut alongside any other live borrow."
    >
      <svg viewBox="0 0 620 268" className="w-full" role="img" aria-label="Ownership transfer options: move, clone, shared borrow, mutable borrow">
        <Marker id="own" />
        {lanes.map((l) => (
          <g key={l.op}>
            <rect x={0} y={l.y} width={620} height={56} rx={6} fill="none" stroke={C.border} strokeOpacity="0.35" />
            <text x={12} y={l.y + 33} fontSize="10.5" fontFamily="var(--font-mono)" fill={C.fg}>
              {l.op}
            </text>
            <line x1={230} y1={l.y + 28} x2={286} y2={l.y + 28} stroke={C.muted} strokeWidth="1.1" markerEnd="url(#own)" />
            <text x={296} y={l.y + 24} fontSize="8.5" letterSpacing="0.14em" fill={toneColor[l.tone]}>
              {l.what}
            </text>
            <text x={296} y={l.y + 38} fontSize="9.5" fill={C.muted}>
              {l.effect}
            </text>
          </g>
        ))}
      </svg>
    </Figure>
  );
}

/* ------------------------------------------------ job state machine */

export function QueueLifecycle() {
  return (
    <Figure
      label="job state machine"
      caption="The dashed edges are the two that make it production-grade: retry with backoff, and the reaper that rescues jobs from a dead worker."
    >
      <svg viewBox="0 0 620 210" className="w-full" role="img" aria-label="Job lifecycle: pending, running, done, failed, retry and reaper paths">
        <Marker id="job" />
        <Node x={20} y={80} w={104} h={44} title="pending" sub="run_at <= now" tone="plain" />
        <Node x={258} y={80} w={104} h={44} title="running" sub="locked_by" tone="accent" />
        <Node x={496} y={26} w={104} h={44} title="done" sub="effect applied" tone="signal" />
        <Node x={496} y={134} w={104} h={44} title="failed" sub="attempts >= max" tone="warn" />

        <Arrow id="job" d="M126 102 L254 102" />
        <Arrow id="job" d="M364 96 C412 96, 430 60, 492 52" />
        <Arrow id="job" d="M364 110 C412 110, 430 148, 492 156" />
        <Arrow id="job" d="M496 150 C440 150, 380 168, 262 132" dashed />
        <Arrow id="job" d="M300 78 C300 34, 200 34, 128 76" dashed />
        <text x={352} y={172} fontSize="8.5" fill={C.muted} fontFamily="var(--font-mono)">
          retry · backoff
        </text>
        <text x={196} y={36} fontSize="8.5" fill={C.muted} fontFamily="var(--font-mono)">
          reaper
        </text>

        <text x={140} y={96} fontSize="8.5" fill={C.muted} fontFamily="var(--font-mono)">
          FOR UPDATE SKIP LOCKED
        </text>
      </svg>
    </Figure>
  );
}

/* ------------------------------------------------- request pipeline */

export function AxumRequest() {
  const steps = [
    { t: "request", s: "GET /users/7" },
    { t: "TraceLayer", s: "span + status" },
    { t: "Timeout", s: "30 s" },
    { t: "Path<u64>", s: "400 on parse" },
    { t: "handler", s: "async fn" },
    { t: "Json<T>", s: "200 / 4xx" },
  ];

  return (
    <Figure
      label="request lifecycle"
      caption="Everything left of the handler is a tower layer or an extractor. That is why a malformed path parameter never reaches your code — it becomes a 400 first."
    >
      <svg viewBox="0 0 620 132" className="w-full" role="img" aria-label="Axum request pipeline from middleware through extractors to the handler and JSON response">
        <Marker id="ax" />
        {steps.map((s, i) => {
          const w = 88;
          const x = 6 + i * 103;
          return (
            <g key={s.t}>
              <Node x={x} y={30} w={w} h={48} title={s.t} sub={s.s} tone={i === 4 ? "accent" : "plain"} />
              {i < steps.length - 1 ? <Arrow id="ax" d={`M${x + w + 2} 54 L${x + w + 13} 54`} /> : null}
            </g>
          );
        })}
        <text x={6} y={18} fontSize="8.5" letterSpacing="0.14em" fill={C.muted}>
          TOWER LAYERS
        </text>
        <text x={330} y={18} fontSize="8.5" letterSpacing="0.14em" fill={C.muted}>
          EXTRACTORS
        </text>
      </svg>
    </Figure>
  );
}

/* --------------------------------------------------- crate layers */

export function ArchLayers() {
  const layers = [
    { t: "api", s: "wiring · server · shutdown", tone: "accent" as Tone },
    { t: "adapters", s: "postgres · http · queue", tone: "plain" as Tone },
    { t: "app", s: "use cases · orchestration", tone: "plain" as Tone },
    { t: "domain", s: "types + rules · no I/O", tone: "signal" as Tone },
  ];

  return (
    <Figure
      label="dependency direction"
      caption="Arrows point one way only. domain has no sqlx, no axum, no tokio — which is why its tests run in microseconds and why it never triggers a rebuild."
    >
      <svg viewBox="0 0 620 208" className="w-full" role="img" aria-label="Layered architecture: api depends on adapters, which depend on app, which depends on domain">
        <Marker id="arch" />
        {layers.map((l, i) => (
          <g key={l.t}>
            <Node x={28} y={16 + i * 48} w={272} h={38} title={l.t} sub={l.s} tone={l.tone} />
            {i < layers.length - 1 ? (
              <Arrow id="arch" d={`M164 ${54 + i * 48} L164 ${62 + i * 48}`} />
            ) : null}
          </g>
        ))}

        <rect x={330} y={16} width={262} height={166} rx={7} fill="none" stroke={C.border} strokeDasharray="3 4" />
        <text x={344} y={36} fontSize="8.5" letterSpacing="0.14em" fill={C.muted}>
          THE RULE
        </text>
        <text x={344} y={58} fontSize="10" fill={C.accent} fontFamily="var(--font-mono)">
          depends on ↓
        </text>
        <text x={344} y={76} fontSize="10" fill={C.muted} fontFamily="var(--font-mono)">
          never on ↑
        </text>
        <text x={344} y={104} fontSize="9.5" fill={C.muted}>
          If domain needs sqlx, the
        </text>
        <text x={344} y={119} fontSize="9.5" fill={C.muted}>
          layering has broken — and a
        </text>
        <text x={344} y={134} fontSize="9.5" fill={C.muted}>
          reviewer sees it in a
        </text>
        <text x={344} y={149} fontSize="9.5" fill={C.muted}>
          six-line Cargo.toml.
        </text>
      </svg>
    </Figure>
  );
}

/* ------------------------------------------------ matching engine */

export function MatchFlow() {
  return (
    <Figure
      label="matching a limit order"
      caption="Price-time priority: walk the best opposite level, fill FIFO within it, rest whatever is left. The loop is the whole engine."
    >
      <svg viewBox="0 0 620 236" className="w-full" role="img" aria-label="Order matching flow: cross check, fill against best level, loop while quantity remains, then rest in book">
        <Marker id="mm" />
        <Node x={16} y={96} w={112} h={44} title="incoming order" sub="buy or sell" tone="accent" />
        <Node x={170} y={96} w={112} h={44} title="crosses?" sub="price vs best" />
        <Node x={324} y={96} w={112} h={44} title="fill at level" sub="FIFO within price" tone="signal" />
        <Node x={478} y={96} w={126} h={44} title="qty left?" sub="partial fill" />
        <Node x={478} y={176} w={126} h={40} title="rest in book" sub="joins the queue" />
        <Node x={324} y={16} w={112} h={40} title="emit trade" sub="maker + taker" />

        <Arrow id="mm" d="M128 118 L166 118" />
        <Arrow id="mm" d="M282 118 L320 118" />
        <Arrow id="mm" d="M436 118 L474 118" />
        <Arrow id="mm" d="M380 96 L380 60" />
        <Arrow id="mm" d="M541 140 L541 172" />
        <Arrow id="mm" d="M478 118 C450 118, 450 150, 440 118" dashed />
        <text x={200} y={78} fontSize="8.5" fill={C.muted} fontFamily="var(--font-mono)">
          no cross → rest
        </text>
        <path d="M226 96 C226 60, 470 44, 478 96" fill="none" stroke={C.muted} strokeWidth="1.1" strokeDasharray="4 3" markerEnd="url(#mm)" />
      </svg>
    </Figure>
  );
}
