"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Chip, Label, ListBox, Select } from "@heroui/react";

import { ArrowRight } from "@/components/icons";
import type { Doc } from "@/lib/content";
import { pad, readingTime } from "@/lib/utils";

const LEVELS = ["All levels", "Beginner", "Intermediate", "Advanced"];

export function CollectionBrowser({
  docs,
  showLevel = true,
}: {
  docs: Doc[];
  showLevel?: boolean;
}) {
  const [level, setLevel] = useState("all");

  const filtered = useMemo(() => {
    if (level === "all") return docs;
    return docs.filter((d) => d.level.toLowerCase() === level);
  }, [docs, level]);

  return (
    <div className="flex flex-col gap-6">
      {showLevel ? (
        <div className="flex flex-wrap items-center gap-3">
          <Select
            aria-label="Filter by level"
            className="w-[190px]"
            selectedKey={level}
            onSelectionChange={(key) => {
              if (key != null) setLevel(String(key));
            }}
          >
            <Label>Level</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {LEVELS.map((l) => (
                  <ListBox.Item key={l} id={l === "All levels" ? "all" : l.toLowerCase()} textValue={l}>
                    {l}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>

          <span className="num text-[11px] text-muted">
            {filtered.length} of {docs.length}
          </span>
        </div>
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2">
        {filtered.map((d, i) => (
          <li key={d.id}>
            <Link
              href={d.href}
              className="card-lift flex h-full flex-col rounded-lg border border-border/70 bg-surface/60 p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="num text-[10px] text-muted/60">{pad(i + 1)}</span>
                <div className="flex items-center gap-1.5">
                  {d.level ? (
                    <Chip size="sm" variant="secondary" className="num">
                      {d.level}
                    </Chip>
                  ) : null}
                  <span className="num text-[10px] text-muted/60">{readingTime(d.minutes)}</span>
                </div>
              </div>

              <h3 className="mt-2.5 text-[14.5px] font-semibold leading-snug tracking-[-0.01em]">
                {d.title}
              </h3>
              {d.summary ? (
                <p className="mt-1.5 line-clamp-3 text-[12.5px] leading-relaxed text-muted">
                  {d.summary}
                </p>
              ) : null}

              <div className="mt-auto flex items-center justify-between pt-4">
                <div className="flex flex-wrap gap-1">
                  {d.tags.slice(0, 3).map((t) => (
                    <span key={t} className="num text-[10px] text-muted/70">
                      #{t}
                    </span>
                  ))}
                </div>
                <ArrowRight className="size-3.5 text-muted/30 transition-all group-hover:translate-x-0.5" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
