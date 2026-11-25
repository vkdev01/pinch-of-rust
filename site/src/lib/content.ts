import fs from "node:fs";
import path from "node:path";

export type Heading = { depth: number; text: string; id: string };

export type DocKind = "learn" | "projects" | "use-cases" | "examples";

export type Doc = {
  id: string;
  kind: DocKind;
  href: string;
  module: string;
  moduleIndex: string;
  moduleTitle: string;
  slug: string;
  title: string;
  summary: string;
  level: string;
  tags: string[];
  order: number;
  minutes: number;
  headings: Heading[];
};

export type Module = { slug: string; index: string; title: string; blurb: string };

export type Stats = {
  docs: number;
  lessons: number;
  projects: number;
  useCases: number;
  examples: number;
  modules: number;
  codeBlocks: number;
  minutes: number;
};

export type ContentIndex = { stats: Stats; modules: Module[]; docs: Doc[] };

const DIR = path.join(process.cwd(), "src", "content");

let cached: ContentIndex | null = null;

export function getIndex(): ContentIndex {
  if (!cached) {
    cached = JSON.parse(fs.readFileSync(path.join(DIR, "index.json"), "utf8")) as ContentIndex;
  }
  return cached;
}

export function getStats(): Stats {
  return getIndex().stats;
}

export function getModules(): Module[] {
  return getIndex().modules;
}

export function allDocs(): Doc[] {
  return getIndex().docs;
}

export function docsOf(kind: DocKind): Doc[] {
  return getIndex().docs.filter((d) => d.kind === kind);
}

export function lessonsOf(moduleSlug: string): Doc[] {
  return docsOf("learn").filter((d) => d.module === moduleSlug);
}

export function getDoc(kind: DocKind, slug: string, moduleSlug?: string): Doc | undefined {
  return getIndex().docs.find(
    (d) => d.kind === kind && d.slug === slug && (!moduleSlug || d.module === moduleSlug)
  );
}

/** Previous / next within the same collection (or the whole course for lessons). */
export function neighbours(doc: Doc): { prev?: Doc; next?: Doc } {
  const list = doc.kind === "learn" ? docsOf("learn") : docsOf(doc.kind);
  const i = list.findIndex((d) => d.id === doc.id);
  return { prev: i > 0 ? list[i - 1] : undefined, next: i >= 0 ? list[i + 1] : undefined };
}

export function getDocHtml(doc: Doc): string {
  const file =
    doc.kind === "learn"
      ? path.join(DIR, "docs", "learn", doc.module, `${doc.slug}.json`)
      : path.join(DIR, "docs", doc.kind, `${doc.slug}.json`);
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { html: string };
  return raw.html;
}

/** A handful of docs for the landing page. */
export function featured(kind: DocKind, n: number): Doc[] {
  return docsOf(kind).slice(0, n);
}
