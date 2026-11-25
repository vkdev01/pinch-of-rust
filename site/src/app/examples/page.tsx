import type { Metadata } from "next";

import { CollectionBrowser } from "@/components/collection-browser";
import { docsOf, getStats } from "@/lib/content";

export const metadata: Metadata = {
  title: "Examples",
  description:
    "Task-shaped Rust recipes: strings, files, HTTP, concurrency, testing and cargo — problem, code, and the trap.",
};

export default function ExamplesPage() {
  const docs = docsOf("examples");
  const stats = getStats();

  return (
    <main className="mx-auto max-w-[1180px] px-4 py-10 sm:px-6">
      <header className="max-w-[64ch]">
        <div className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-accent" />
          <span className="label">copy, adapt, ship</span>
        </div>
        <h1 className="mt-3 text-balance text-[30px] font-semibold leading-[1.15] tracking-[-0.028em] sm:text-[34px]">
          {docs.length} collections of runnable examples
        </h1>
        <p className="mt-3 text-pretty text-[14px] leading-relaxed text-muted">
          Organised by the problem you have, not by language feature. Each recipe shows the code,
          explains why it is written that way, and names the trap that catches people. Drawn from
          the same {stats.codeBlocks} code blocks as the rest of the course.
        </p>
      </header>

      <div className="mt-8">
        <CollectionBrowser docs={docs} showLevel={false} />
      </div>
    </main>
  );
}
