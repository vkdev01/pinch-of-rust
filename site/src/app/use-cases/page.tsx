import type { Metadata } from "next";

import { CollectionBrowser } from "@/components/collection-browser";
import { docsOf } from "@/lib/content";

export const metadata: Metadata = {
  title: "Use cases",
  description:
    "Where Rust runs in production — cloud infrastructure, developer tools, data engines, payments, embedded and the web — and what each domain demands.",
};

export default function UseCasesPage() {
  const docs = docsOf("use-cases");

  return (
    <main className="mx-auto max-w-[1180px] px-4 py-10 sm:px-6">
      <header className="max-w-[64ch]">
        <div className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-accent" />
          <span className="label">in production</span>
        </div>
        <h1 className="mt-3 text-balance text-[30px] font-semibold leading-[1.15] tracking-[-0.028em] sm:text-[34px]">
          Real systems, and why they chose Rust
        </h1>
        <p className="mt-3 text-pretty text-[14px] leading-relaxed text-muted">
          Six domains, each with the constraints that decided the language, the teams running it,
          a worked slice of the actual code, and an honest note on where Rust is the wrong answer.
        </p>
      </header>

      <div className="mt-8">
        <CollectionBrowser docs={docs} showLevel={false} />
      </div>
    </main>
  );
}
