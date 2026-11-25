"use client";

import { useEffect, useState } from "react";
import { ProgressBar } from "@heroui/react";

import type { Heading } from "@/lib/content";

export function TocRail({ headings }: { headings: Heading[] }) {
  const [active, setActive] = useState<string | null>(headings[0]?.id ?? null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const els = headings
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => Boolean(el));

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-72px 0px -70% 0px", threshold: [0, 1] }
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [headings]);

  useEffect(() => {
    function onScroll() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (headings.length === 0) return null;

  return (
    <nav aria-label="On this page" className="flex flex-col gap-3">
      <p className="label">On this page</p>
      <ul className="flex flex-col gap-0.5 border-l border-border/70">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              aria-current={active === h.id ? "location" : undefined}
              className={`-ml-px block border-l py-1 text-[12px] leading-snug transition-colors ${
                h.depth === 3 ? "pl-5" : "pl-3"
              } ${
                active === h.id
                  ? "border-accent font-medium text-accent"
                  : "border-transparent text-muted hover:border-border hover:text-foreground"
              }`}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>

      <ProgressBar aria-label="Reading progress" value={Math.round(progress)} className="mt-2">
        <ProgressBar.Track>
          <ProgressBar.Fill />
        </ProgressBar.Track>
      </ProgressBar>
    </nav>
  );
}
