"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Chip } from "@heroui/react";

import { ArrowRight } from "@/components/icons";
import type { Doc, Module } from "@/lib/content";
import { pad, readingTime } from "@/lib/utils";

export function LearnBrowser({ modules, lessons }: { modules: Module[]; lessons: Doc[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return lessons;
    return lessons.filter((l) => {
      if (l.title.toLowerCase().includes(q)) return true;
      if (l.summary.toLowerCase().includes(q)) return true;
      return l.headings.some((h) => h.text.toLowerCase().includes(q));
    });
  }, [lessons, query]);

  const byModule = useMemo(() => {
    const map = new Map<string, Doc[]>();
    for (const m of modules) map.set(m.slug, []);
    for (const l of filtered) {
      const list = map.get(l.module);
      if (list) list.push(l);
    }
    return map;
  }, [filtered, modules]);

  const total = filtered.length;

  return (
    <div className="flex flex-col gap-8">
      <div className="sticky top-14 z-20 -mx-4 border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <label className="flex items-center gap-2 rounded-lg border border-border/80 bg-surface/70 px-3 py-2 focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/15">
          <span className="label shrink-0">Filter</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ownership, axum, sqlx, lifetimes…"
            aria-label="Filter lessons by title or section"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted/70"
          />
          <span className="num shrink-0 text-[10.5px] text-muted">
            {total}/{lessons.length}
          </span>
        </label>
      </div>

      {modules.map((m) => {
        const list = byModule.get(m.slug) ?? [];
        if (list.length === 0) return null;
        return (
          <section key={m.slug} id={m.slug} className="scroll-mt-32">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="num text-[10.5px] text-accent">{m.index}</span>
                  <span className="label">{m.title}</span>
                </div>
                <p className="mt-1.5 max-w-[52ch] text-[12.5px] leading-relaxed text-muted">
                  {m.blurb}
                </p>
              </div>
              <span className="num shrink-0 text-[10.5px] text-muted/70">
                {list.length} {list.length === 1 ? "lesson" : "lessons"}
              </span>
            </div>

            <ul className="mt-3 divide-y divide-border/50 overflow-hidden rounded-lg border border-border/70 bg-surface/50">
              {list.map((l) => (
                <li key={l.id}>
                  <Link
                    href={l.href}
                    className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/[0.05]"
                  >
                    <span className="num w-5 shrink-0 text-[10px] text-muted/60">{pad(l.order)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-foreground/90 group-hover:text-foreground">
                        {l.title}
                      </span>
                      {l.headings.length > 0 ? (
                        <span className="mt-0.5 block truncate text-[11.5px] text-muted/80">
                          {l.headings
                            .slice(0, 3)
                            .map((h) => h.text)
                            .join(" · ")}
                        </span>
                      ) : null}
                    </span>
                    <span className="num hidden shrink-0 text-[10.5px] text-muted/60 sm:block">
                      {readingTime(l.minutes)}
                    </span>
                    <ArrowRight className="size-3.5 shrink-0 text-muted/30 transition-all group-hover:translate-x-0.5 group-hover:text-accent" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {total === 0 ? (
        <div className="rounded-lg border border-dashed border-border/80 p-10 text-center">
          <p className="text-[13.5px] font-medium">No lesson matches “{query}”.</p>
          <p className="mt-1 text-[12.5px] text-muted">
            Try a broader term, or browse{" "}
            <Link href="/examples" className="text-accent underline">
              the examples
            </Link>
            .
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-surface/50 p-4">
        <Chip size="sm" variant="secondary">
          Jump to
        </Chip>
        {modules.map((m) => (
          <a key={m.slug} href={`#${m.slug}`} className="chip num">
            {m.index} {m.title}
          </a>
        ))}
      </div>
    </div>
  );
}
