import type { Metadata } from "next";

import { CollectionBrowser } from "@/components/collection-browser";
import { docsOf, getStats } from "@/lib/content";

export const metadata: Metadata = {
  title: "Projects",
  description:
    "Six Rust projects with milestones, crates, skeleton code and a demo checklist — from a log-search CLI to an embedded sensor gateway.",
};

export default function ProjectsPage() {
  const docs = docsOf("projects");
  const stats = getStats();

  return (
    <main className="mx-auto max-w-[1180px] px-4 py-10 sm:px-6">
      <header className="max-w-[64ch]">
        <div className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-accent" />
          <span className="label">build something real</span>
        </div>
        <h1 className="mt-3 text-balance text-[30px] font-semibold leading-[1.15] tracking-[-0.028em] sm:text-[34px]">
          {stats.projects} projects that end in a demo
        </h1>
        <p className="mt-3 text-pretty text-[14px] leading-relaxed text-muted">
          Each project states what you build, which skills it forces, a milestone table you can
          check off, the exact crates and features, skeleton code, and a demo checklist. Nothing
          here is a toy: every one of these is a portfolio piece.
        </p>
      </header>

      <div className="mt-8">
        <CollectionBrowser docs={docs} />
      </div>
    </main>
  );
}
