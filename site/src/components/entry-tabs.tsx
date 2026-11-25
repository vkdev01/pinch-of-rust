"use client";

import Link from "next/link";
import { Tabs } from "@heroui/react";

import { ArrowRight, Book, Code, Layers, Wrench } from "@/components/icons";
import type { Doc } from "@/lib/content";

type Entry = { key: string; label: string; blurb: string; href: string; icon: React.ReactNode; docs: Doc[] };

export function EntryTabs({ entries }: { entries: Entry[] }) {
  return (
    <Tabs defaultSelectedKey={entries[0]?.key}>
      <Tabs.ListContainer className="w-fit max-w-full border border-border/60 bg-surface/50">
        <Tabs.List aria-label="Ways into the course">
          {entries.map((e) => (
            <Tabs.Tab key={e.key} id={e.key} className="whitespace-nowrap px-3">
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                {e.icon}
                {e.label}
              </span>
              <Tabs.Indicator />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>

      {entries.map((e) => (
        <Tabs.Panel key={e.key} id={e.key} className="pt-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <p className="max-w-[58ch] text-[13px] leading-relaxed text-muted">{e.blurb}</p>
            <Link href={e.href} className="btn-outline text-[12px]">
              See all <ArrowRight className="size-3.5" />
            </Link>
          </div>

          <ul className="grid gap-2.5 sm:grid-cols-2">
            {e.docs.map((d) => (
              <li key={d.id}>
                <Link
                  href={d.href}
                  className="card-lift group flex items-start gap-3 rounded-lg border border-border/70 bg-surface/60 p-4"
                >
                  <span className="mt-0.5 shrink-0 text-accent/70">{e.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium leading-snug">{d.title}</span>
                    <span className="mt-0.5 line-clamp-2 block text-[11.5px] leading-relaxed text-muted">
                      {d.summary || d.headings.slice(0, 3).map((h) => h.text).join(" · ")}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}

export const ENTRY_ICONS = {
  learn: <Book className="size-3.5" />,
  projects: <Wrench className="size-3.5" />,
  "use-cases": <Layers className="size-3.5" />,
  examples: <Code className="size-3.5" />,
};
