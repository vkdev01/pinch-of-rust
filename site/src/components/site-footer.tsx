import Link from "next/link";
import { Avatar, Chip } from "@heroui/react";

import { Github } from "@/components/icons";
import { getStats } from "@/lib/content";

export function SiteFooter() {
  const stats = getStats();

  return (
    <footer className="border-t border-border/70 bg-surface/40">
      <div className="mx-auto grid max-w-[1180px] gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <Avatar size="sm">
              <Avatar.Fallback>VK</Avatar.Fallback>
            </Avatar>
            <div>
              <p className="text-[13px] font-medium">pinch/rust</p>
              <p className="num text-[11px] text-muted">
                {stats.docs} docs · {stats.codeBlocks} code blocks
              </p>
            </div>
          </div>
          <p className="mt-4 max-w-[42ch] text-[12.5px] leading-relaxed text-muted">
            A course built from the compiler&apos;s point of view: every lesson ends in code you can
            run, every project ends in something you can demo.
          </p>
        </div>

        <nav aria-label="Course" className="flex flex-col gap-2">
          <p className="label">Course</p>
          <Link href="/learn" className="text-[12.5px] text-muted hover:text-foreground">
            All lessons
          </Link>
          <Link href="/projects" className="text-[12.5px] text-muted hover:text-foreground">
            Projects
          </Link>
          <Link href="/use-cases" className="text-[12.5px] text-muted hover:text-foreground">
            Use cases
          </Link>
          <Link href="/examples" className="text-[12.5px] text-muted hover:text-foreground">
            Examples
          </Link>
        </nav>

        <div className="flex flex-col items-start gap-2">
          <p className="label">Source</p>
          <a
            href="https://github.com/vkdev01/pinch-of-rust"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-[12.5px] text-muted hover:text-foreground"
          >
            <Github className="size-3.5" />
            vkdev01/pinch-of-rust
          </a>
          <Chip size="sm" className="num mt-1">
            MIT licensed
          </Chip>
          <p className="num mt-2 text-[11px] text-muted/70">
            built with next.js · tailwind v4 · heroui v3
          </p>
        </div>
      </div>
    </footer>
  );
}
