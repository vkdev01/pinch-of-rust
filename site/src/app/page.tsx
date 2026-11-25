import Link from "next/link";
import { Card, Chip, Table } from "@heroui/react";

import { ENTRY_ICONS, EntryTabs } from "@/components/entry-tabs";
import { OwnershipDiagram, PipelineDiagram } from "@/components/hero-diagram";
import { ArrowRight, Terminal } from "@/components/icons";
import { PlanModal } from "@/components/plan-modal";
import { docsOf, featured, getModules, getStats, lessonsOf } from "@/lib/content";
import { pad, plural, readingTime } from "@/lib/utils";

const setupLines: { text: string; comment?: string }[] = [
  { text: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh", comment: "toolchain" },
  { text: "cargo new hello && cd hello" },
  { text: "cargo run", comment: "compiles, links, runs" },
  { text: "cargo add tokio --features full" },
  { text: "cargo clippy --all-targets -- -D warnings", comment: "the linter that teaches" },
  { text: "cargo build --release --target x86_64-unknown-linux-musl" },
];

const WHO: { domain: string; where: string; replaced: string }[] = [
  { domain: "Cloud", where: "AWS Firecracker, Cloudflare Pingora", replaced: "VMs and NGINX" },
  { domain: "Kernel", where: "Linux 6.1+, Android, Windows", replaced: "C for new drivers" },
  { domain: "Developer tools", where: "ripgrep, uv, Deno, swc, Biome", replaced: "grep, pip, Babel" },
  { domain: "Data", where: "Polars, InfluxDB IOx, Materialize", replaced: "JVM and pandas engines" },
  { domain: "Web", where: "Figma, Shopify Functions, 1Password", replaced: "hot JS paths" },
  { domain: "Embedded", where: "ESP32, Azure Sphere, RTIC firmware", replaced: "hand-written C" },
];

export default function HomePage() {
  const stats = getStats();
  const modules = getModules();
  const projects = featured("projects", 3);
  const cases = featured("use-cases", 4);
  const examples = featured("examples", 4);

  return (
    <main>
      {/* ------------------------------------------------------------ hero */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="eng-grid pointer-events-none absolute inset-0" aria-hidden="true" />
        <div
          className="pointer-events-none absolute -left-40 -top-40 size-[560px] rounded-full bg-accent/[0.16] blur-[120px]"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -right-32 top-[16%] size-[460px] rounded-full bg-[var(--signal)]/[0.10] blur-[120px]"
          aria-hidden="true"
        />

        <div className="relative mx-auto max-w-[1180px] px-4 pb-14 pt-14 sm:px-6 sm:pt-20">
          <div className="grid items-center gap-12 lg:grid-cols-[1.02fr_1fr] lg:gap-14">
            <div className="fade-up">
              <div className="flex items-center gap-2.5">
                <span className="size-1.5 rounded-full bg-accent" />
                <span className="label">rust · lessons · projects · use cases</span>
              </div>

              <h1 className="mt-5 text-balance text-[34px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[42px]">
                Rust, from <span className="num text-accent">let</span> to a
                <br className="hidden sm:block" /> service in production.
              </h1>

              <p className="mt-4 max-w-[46ch] text-pretty text-[14.5px] leading-relaxed text-foreground/70">
                {stats.lessons} lessons on the language, {stats.projects} projects you can actually
                ship, and the real-world systems that run on Rust today. Every claim has code under
                it; every error message is the one you will really see.
              </p>

              <p className="mt-3 max-w-[46ch] text-[13px] text-muted">
                Written for people who already program in something else and want to stop guessing
                at what the borrow checker wants.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link href="/learn/02-language/03-ownership-borrowing-lifetimes" className="btn-link">
                  Start with ownership
                  <ArrowRight className="size-4" />
                </Link>
                <Link href="/projects" className="btn-outline">
                  See the projects
                </Link>
                <PlanModal />
              </div>

              <div className="mt-7 flex flex-wrap items-center gap-2 font-mono text-[11.5px] text-muted">
                <Terminal className="size-3.5 text-accent/70" />
                <span>
                  <span className="text-accent/80">rustc&gt;</span> let s = String::from(&quot;hi&quot;);
                </span>
                <span className="text-success">ok</span>
                <span className="text-muted/50"># moved, not copied</span>
              </div>
            </div>

            {/* browser chrome around the diagram */}
            <div className="fade-up">
              <div className="overflow-hidden rounded-xl border border-border/70 bg-surface/70 backdrop-blur-sm">
                <div className="flex h-9 items-center gap-2 border-b border-border/60 bg-surface-secondary/40 px-3">
                  <span className="size-2 rounded-full bg-border" />
                  <span className="size-2 rounded-full bg-border" />
                  <span className="size-2 rounded-full bg-border" />
                  <div className="ml-2 flex h-5 flex-1 items-center rounded-[5px] border border-border/60 bg-background/60 px-2">
                    <span className="num truncate text-[10px] text-muted/80">
                      pinch-of-rust/02-language/ownership
                    </span>
                  </div>
                  <span className="label-xs flex items-center gap-1 text-muted/70">
                    <span className="size-1 rounded-full bg-[var(--signal)]" />
                    fig. 01
                  </span>
                </div>
                <div className="p-3">
                  <PipelineDiagram className="h-[250px] w-full" />
                </div>
                <div className="flex items-center justify-between border-t border-border/60 px-3 py-2">
                  <span className="label-xs text-muted/70">compile once, run forever</span>
                  <span className="num text-[10px] text-muted/60">no runtime · no gc</span>
                </div>
              </div>
            </div>
          </div>

          {/* stats */}
          <div className="mt-14 grid grid-cols-2 gap-6 border-t border-border/60 pt-6 sm:grid-cols-4">
            {[
              { value: pad(stats.docs), label: "docs" },
              { value: pad(stats.codeBlocks), label: "code blocks" },
              { value: pad(stats.projects), label: "buildable projects" },
              { value: `${Math.round(stats.minutes / 60)}h`, label: "of reading" },
            ].map((s) => (
              <div key={s.label}>
                <div className="num text-[22px] leading-none text-foreground">{s.value}</div>
                <div className="label mt-2">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- entry points */}
      <section id="start" className="mx-auto max-w-[1180px] px-4 py-14 sm:px-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <span className="label">four ways in</span>
            <h2 className="mt-2 text-[22px] font-semibold tracking-[-0.02em]">
              Read it, build it, or steal it
            </h2>
          </div>
        </div>

        <div className="mt-6">
          <EntryTabs
            entries={[
              {
                key: "learn",
                label: "Lessons",
                icon: ENTRY_ICONS.learn,
                href: "/learn",
                blurb:
                  "The course, in order. Ownership first, because everything else in Rust is downstream of it.",
                docs: lessonsOf("02-language").slice(0, 4),
              },
              {
                key: "projects",
                label: "Projects",
                icon: ENTRY_ICONS.projects,
                href: "/projects",
                blurb:
                  "Six builds with milestones, crates, skeleton code and a demo checklist. Each one is a portfolio piece.",
                docs: projects,
              },
              {
                key: "use-cases",
                label: "Use cases",
                icon: ENTRY_ICONS["use-cases"],
                href: "/use-cases",
                blurb:
                  "Where Rust actually runs in production, what it replaced, and what to steal for your own system.",
                docs: cases,
              },
              {
                key: "examples",
                label: "Examples",
                icon: ENTRY_ICONS.examples,
                href: "/examples",
                blurb:
                  "Task-shaped recipes: parse this, stream that, retry the other. Problem, code, trap.",
                docs: examples,
              },
            ]}
          />
        </div>
      </section>

      {/* ------------------------------------------------------- modules */}
      <section className="border-y border-border/60 bg-surface/25">
        <div className="mx-auto max-w-[1180px] px-4 py-14 sm:px-6">
          <div className="flex items-end justify-between">
            <div>
              <span className="label">the syllabus</span>
              <h2 className="mt-2 text-[22px] font-semibold tracking-[-0.02em]">
                Six modules, {stats.lessons} lessons
              </h2>
            </div>
            <Link
              href="/learn"
              className="hidden items-center gap-1.5 text-[12.5px] text-muted transition-colors hover:text-foreground sm:flex"
            >
              All lessons <ArrowRight className="size-3.5" />
            </Link>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            {modules.map((m) => {
              const list = lessonsOf(m.slug);
              return (
                <Card key={m.slug} className="overflow-hidden">
                  <Card.Header>
                    <div className="flex w-full items-start justify-between gap-3">
                      <div>
                        <Card.Title className="text-[15px] tracking-[-0.01em]">
                          <span className="num mr-2 text-[10.5px] text-accent">{m.index}</span>
                          {m.title}
                        </Card.Title>
                        <Card.Description className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                          {m.blurb}
                        </Card.Description>
                      </div>
                      <span className="num shrink-0 text-[10px] text-muted/60">
                        {plural(list.length, "lesson")}
                      </span>
                    </div>
                  </Card.Header>
                  <Card.Content className="pt-0">
                    <ul className="divide-y divide-border/50 border-t border-border/60">
                      {list.slice(0, 3).map((l) => (
                        <li key={l.id}>
                          <Link
                            href={l.href}
                            className="group flex items-center gap-3 py-2 transition-colors hover:text-accent"
                          >
                            <span className="num w-4 shrink-0 text-[9.5px] text-muted/50">
                              {pad(l.order)}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground/80 group-hover:text-foreground">
                              {l.title}
                            </span>
                            <ArrowRight className="size-3 shrink-0 text-muted/30 transition-all group-hover:translate-x-0.5 group-hover:text-accent" />
                          </Link>
                        </li>
                      ))}
                      {list.length > 3 ? (
                        <li className="py-2">
                          <Link
                            href={`/learn#${m.slug}`}
                            className="num text-[10.5px] text-muted/60 transition-colors hover:text-accent"
                          >
                            +{list.length - 3} more
                          </Link>
                        </li>
                      ) : null}
                    </ul>
                  </Card.Content>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ projects */}
      <section className="mx-auto max-w-[1180px] px-4 py-14 sm:px-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <span className="label">build something</span>
            <h2 className="mt-2 text-[22px] font-semibold tracking-[-0.02em]">
              Projects with a demo at the end
            </h2>
          </div>
          <Link href="/projects" className="btn-outline hidden sm:inline-flex">
            All {stats.projects} projects
          </Link>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={p.href}
              className="card-lift flex flex-col rounded-lg border border-border/70 bg-surface/60 p-5"
            >
              <div className="flex items-center justify-between">
                <Chip size="sm" variant="secondary" className="num">
                  {p.level}
                </Chip>
                <span className="num text-[10px] text-muted/60">{p.minutes} min</span>
              </div>
              <h3 className="mt-3 text-[14.5px] font-semibold leading-snug">{p.title}</h3>
              <p className="mt-1.5 line-clamp-3 text-[12.5px] leading-relaxed text-muted">
                {p.summary}
              </p>
              <div className="mt-auto flex flex-wrap gap-1 pt-4">
                {p.tags.slice(0, 3).map((t) => (
                  <span key={t} className="num text-[10px] text-muted/70">
                    #{t}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------- use cases */}
      <section className="border-y border-border/60 bg-surface/25">
        <div className="mx-auto grid max-w-[1180px] gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div>
            <span className="label">in production</span>
            <h2 className="mt-2 text-[22px] font-semibold tracking-[-0.02em]">
              Who runs Rust, and what it replaced
            </h2>
            <p className="mt-3 max-w-[42ch] text-[13px] leading-relaxed text-muted">
              Rust did not win on syntax. It won where a garbage-collection pause was an outage and
              a memory bug was a security incident.
            </p>
            <OwnershipDiagram className="mt-6 w-full" />
            <Link href="/use-cases" className="btn-outline mt-5 inline-flex">
              Read the use cases
            </Link>
          </div>

          <div className="min-w-0">
            <Table>
              <Table.ScrollContainer>
                <Table.Content aria-label="Where Rust runs in production" className="min-w-[420px]">
                  <Table.Header>
                    <Table.Column isRowHeader>Domain</Table.Column>
                    <Table.Column>Where</Table.Column>
                    <Table.Column>Replaced</Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {WHO.map((row) => (
                      <Table.Row key={row.domain} id={row.domain}>
                        <Table.Cell>
                          <span className="text-[12.5px] font-medium">{row.domain}</span>
                        </Table.Cell>
                        <Table.Cell>
                          <span className="text-[12px] text-muted">{row.where}</span>
                        </Table.Cell>
                        <Table.Cell>
                          <span className="num text-[11px] text-muted/80">{row.replaced}</span>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- setup */}
      <section className="mx-auto grid max-w-[1180px] gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div>
          <span className="label">setup</span>
          <h2 className="mt-2 text-[22px] font-semibold tracking-[-0.02em]">
            One toolchain, no build server
          </h2>
          <p className="mt-3 max-w-[46ch] text-[13px] leading-relaxed text-muted">
            Everything in this course is a cargo project. The capstone is a workspace of three
            crates plus a Next.js dashboard, and it ships as a single static binary.
          </p>
          <ul className="mt-5 space-y-2.5 text-[13px] text-muted">
            {[
              "Every example compiles with the stable toolchain",
              "Every project lists the exact crates and features",
              "Every error message is copied from a real compiler run",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5">
                <span className="mt-[7px] size-1 shrink-0 rounded-full bg-accent" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="overflow-hidden rounded-xl border border-border/70 bg-surface/60">
          <div className="flex h-9 items-center gap-2 border-b border-border/60 bg-surface-secondary/40 px-3">
            <span className="size-2 rounded-full bg-border" />
            <span className="size-2 rounded-full bg-border" />
            <span className="size-2 rounded-full bg-border" />
            <span className="num ml-2 text-[10px] text-muted/80">zsh — pinch-of-rust</span>
          </div>
          <pre className="overflow-x-auto px-4 py-3.5 font-mono text-[12px] leading-[1.9]">
            {setupLines.map((l) => (
              <div key={l.text} className="whitespace-pre">
                <span className="select-none text-accent/60">$ </span>
                <span className="text-foreground/85">{l.text}</span>
                {l.comment ? (
                  <span className="text-muted/45">{"  # " + l.comment}</span>
                ) : null}
              </div>
            ))}
          </pre>
        </div>
      </section>

      {/* ------------------------------------------------------------ cta */}
      <section className="border-t border-border/60">
        <div className="mx-auto flex max-w-[1180px] flex-col items-start gap-5 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-[20px] font-semibold tracking-[-0.02em]">
              Start where the language starts.
            </h2>
            <p className="mt-1.5 text-[13px] text-muted">
              {docsOf("learn").length} lessons · {plural(stats.codeBlocks, "code block")} ·{" "}
              {readingTime(stats.minutes)} of reading
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/learn" className="btn-link">
              Open the course
              <ArrowRight className="size-4" />
            </Link>
            <Link href="/learn/06-reference/01-cheatsheet" className="btn-outline">
              Cheat sheet
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
