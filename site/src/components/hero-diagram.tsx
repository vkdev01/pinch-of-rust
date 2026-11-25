/**
 * The compile pipeline, drawn as an engineering diagram.
 * Pure SVG, themed through CSS variables so it follows light/dark.
 */
export function PipelineDiagram({ className }: { className?: string }) {
  const stages = [
    { x: 16, title: "src/*.rs", sub: "tokens + AST" },
    { x: 172, title: "borrow check", sub: "ownership proven" },
    { x: 328, title: "monomorphise", sub: "one copy per type" },
    { x: 484, title: "codegen", sub: "LLVM → machine" },
  ];

  return (
    <svg
      viewBox="0 0 620 250"
      className={className}
      role="img"
      aria-label="Diagram: Rust source is borrow-checked, monomorphised, then compiled to machine code with no runtime."
    >
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" fill="var(--accent)" />
        </marker>
        <linearGradient id="fade" x1="0" x2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.15" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.5" />
        </linearGradient>
      </defs>

      {stages.map((s, i) => (
        <g key={s.title}>
          <rect
            x={s.x}
            y={44}
            width={120}
            height={56}
            rx={10}
            fill="var(--surface)"
            stroke="var(--border)"
            strokeWidth="1"
          />
          <text
            x={s.x + 60}
            y={70}
            textAnchor="middle"
            fontFamily="var(--font-mono)"
            fontSize="11.5"
            fill="var(--foreground)"
          >
            {s.title}
          </text>
          <text
            x={s.x + 60}
            y={87}
            textAnchor="middle"
            fontSize="9"
            letterSpacing="0.08em"
            fill="var(--muted)"
          >
            {s.sub.toUpperCase()}
          </text>
          {i < stages.length - 1 && (
            <line
              x1={s.x + 122}
              y1={72}
              x2={s.x + 152}
              y2={72}
              stroke="var(--accent)"
              strokeWidth="1.2"
              markerEnd="url(#arrow)"
              strokeDasharray="4 3"
              className="animate-[dash_1.6s_linear_infinite]"
            />
          )}
        </g>
      ))}

      {/* memory panel */}
      <rect x={16} y={132} width={276} height={98} rx={10} fill="none" stroke="var(--border)" strokeDasharray="3 3" />
      <text x={30} y={152} fontSize="9" letterSpacing="0.14em" fill="var(--muted)">
        STACK
      </text>
      <text x={30} y={176} fontFamily="var(--font-mono)" fontSize="11" fill="var(--foreground)">
        s1: ptr · len · cap
      </text>
      <text x={30} y={196} fontFamily="var(--font-mono)" fontSize="11" fill="var(--muted)">
        (24 bytes, fixed)
      </text>

      <rect x={312} y={132} width={292} height={98} rx={10} fill="none" stroke="var(--border)" strokeDasharray="3 3" />
      <text x={326} y={152} fontSize="9" letterSpacing="0.14em" fill="var(--muted)">
        HEAP
      </text>
      <text x={326} y={176} fontFamily="var(--font-mono)" fontSize="11" fill="var(--foreground)">
        &quot;hello world&quot;
      </text>
      <text x={326} y={196} fontFamily="var(--font-mono)" fontSize="11" fill="var(--muted)">
        freed exactly once, at drop
      </text>

      <path
        d="M120 108 C120 122, 120 124, 200 132"
        fill="none"
        stroke="url(#fade)"
        strokeWidth="1.2"
      />
      <circle cx={200} cy={132} r="2.5" fill="var(--accent)" />
    </svg>
  );
}

export function OwnershipDiagram({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 620 120"
      className={className}
      role="img"
      aria-label="Diagram: many shared borrows or one mutable borrow, never both."
    >
      <rect x={16} y={26} width={270} height={68} rx={10} fill="var(--surface)" stroke="var(--border)" />
      <text x={34} y={50} fontSize="10" letterSpacing="0.14em" fill="var(--muted)">
        SHARED — ANY NUMBER
      </text>
      <text x={34} y={76} fontFamily="var(--font-mono)" fontSize="12" fill="var(--foreground)">
        &amp;T &amp;T &amp;T …
      </text>

      <text x={296} y={68} fontSize="11" fill="var(--muted)">
        or
      </text>

      <rect x={330} y={26} width={274} height={68} rx={10} fill="var(--surface)" stroke="var(--accent)" strokeOpacity="0.5" />
      <text x={348} y={50} fontSize="10" letterSpacing="0.14em" fill="var(--accent)">
        EXCLUSIVE — EXACTLY ONE
      </text>
      <text x={348} y={76} fontFamily="var(--font-mono)" fontSize="12" fill="var(--foreground)">
        &amp;mut T
      </text>
    </svg>
  );
}
