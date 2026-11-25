import type { Metadata } from "next";
import Link from "next/link";

import { LearnBrowser } from "@/components/learn-browser";
import { ArrowRight } from "@/components/icons";
import { docsOf, getModules, getStats } from "@/lib/content";
import { plural } from "@/lib/utils";

export const metadata: Metadata = {
  title: "All lessons",
  description:
    "Thirty-nine Rust lessons in six modules: getting started, the language, the ecosystem, real-world use, a capstone and a reference.",
};

export default function LearnPage() {
  const modules = getModules();
  const lessons = docsOf("learn");
  const stats = getStats();

  return (
    <main className="mx-auto max-w-[1180px] px-4 py-10 sm:px-6">
      <header className="max-w-[62ch]">
        <div className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-accent" />
          <span className="label">the course</span>
        </div>
        <h1 className="mt-3 text-balance text-[30px] font-semibold leading-[1.15] tracking-[-0.028em] sm:text-[34px]">
          {stats.lessons} lessons, in the order the compiler teaches them
        </h1>
        <p className="mt-3 text-pretty text-[14px] leading-relaxed text-muted">
          Start at the top and read down, or jump to the thing that is blocking you. Every lesson
          ends with exercises that force a compiler error you then have to reason about.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Link href="/learn/01-getting-started/01-install-and-toolchain" className="btn-link">
            Begin at lesson 01
            <ArrowRight className="size-4" />
          </Link>
          <Link href="/projects" className="btn-outline">
            Skip to projects
          </Link>
          <span className="num text-[11px] text-muted">
            {plural(stats.codeBlocks, "code block")} · {Math.round(stats.minutes / 60)} h
          </span>
        </div>
      </header>

      <div className="mt-10">
        <LearnBrowser modules={modules} lessons={lessons} />
      </div>
    </main>
  );
}
