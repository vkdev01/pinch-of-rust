// Build-time content pipeline.
// Markdown in the repo root -> JSON (pre-highlighted HTML + metadata) in src/content.
// Runs before `next build`; nothing here ships to the browser.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeStringify from "rehype-stringify";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT = path.resolve(__dirname, "../src/content");

const MODULES = [
  { slug: "01-getting-started", index: "01", title: "Getting started", blurb: "Toolchain, cargo, workspaces — the setup professionals actually use." },
  { slug: "02-language", index: "02", title: "The language", blurb: "Ownership, traits, iterators, errors, concurrency, async. The core." },
  { slug: "03-ecosystem", index: "03", title: "Ecosystem & build", blurb: "Cargo in depth, the crate landscape, testing, CI, profiling." },
  { slug: "04-real-world", index: "04", title: "Real-world use cases", blurb: "CLIs, APIs, databases, queues, WASM, embedded, games, data." },
  { slug: "05-capstone", index: "05", title: "Capstone project", blurb: "A complete SaaS service: Rust API, Postgres, worker, dashboard." },
  { slug: "06-reference", index: "06", title: "Reference", blurb: "Cheat sheet, error decoder, interview bank, 30-day plan." },
  { slug: "07-dsa", index: "07", title: "Data structures & algorithms", blurb: "Complexity you can measure, cache-aware layouts, arenas, heaps, graphs, sorting." },
  { slug: "08-concurrency", index: "08", title: "Concurrency in practice", blurb: "Threads and pools, every sync primitive, atomics and ordering, lock-free SPSC, parallel patterns." },
  { slug: "09-design", index: "09", title: "Design & architecture", blurb: "API design, crate boundaries, testability, concurrency architecture, system design cases." },
];

const COLLECTIONS = [
  { kind: "learn", dir: null, label: "Lessons" },
  { kind: "projects", dir: "projects", label: "Projects" },
  { kind: "use-cases", dir: "use-cases", label: "Use cases" },
  { kind: "examples", dir: "examples", label: "Examples" },
];

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSlug)
  .use(rehypePrettyCode, {
    theme: { light: "github-light", dark: "github-dark-dimmed" },
    keepBackground: false,
    defaultLang: { block: "text", inline: "text" },
    bypassInlineCode: true,
  })
  .use(rehypeStringify);

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

function parseFrontmatter(raw) {
  if (!raw.startsWith("---\n")) return { data: {}, body: raw };
  const end = raw.indexOf("\n---", 4);
  if (end === -1) return { data: {}, body: raw };
  const block = raw.slice(4, end);
  const body = raw.slice(end + 4).replace(/^\n+/, "");
  const data = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (v.startsWith("[") && v.endsWith("]")) {
      data[m[1]] = v
        .slice(1, -1)
        .split(",")
        .map((x) => x.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else {
      data[m[1]] = v.replace(/^["']|["']$/g, "");
    }
  }
  return { data, body };
}

function extractTitle(body, fallback) {
  const m = body.match(/^#\s+(.+)$/m);
  if (!m) return { title: fallback, body };
  const raw = m[1].trim();
  const rest = body.slice(0, m.index) + body.slice(m.index + m[0].length);
  const title = raw.includes("·") ? raw.split("·").slice(1).join("·").trim() : raw;
  return { title, display: raw, body: rest };
}

function extractHeadings(body) {
  const out = [];
  let inFence = false;
  for (const line of body.split("\n")) {
    if (line.trimStart().startsWith("```")) inFence = !inFence;
    if (inFence) continue;
    const m = line.match(/^(#{2,3})\s+(.+?)\s*$/);
    if (!m) continue;
    const text = m[2].replace(/`/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
    out.push({ depth: m[1].length, text, id: slugify(text) });
  }
  return out;
}

function countWords(s) {
  return s.split(/\s+/).filter(Boolean).length;
}

async function renderDoc(raw, fallbackTitle) {
  const { data, body: afterFm } = parseFrontmatter(raw);
  const { title, body } = extractTitle(afterFm, fallbackTitle);
  const headings = extractHeadings(body);
  const html = String(await processor.process(body));
  const minutes = Math.max(1, Math.round(countWords(body) / 220));
  return { data, title, html, headings, minutes };
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, "docs"), { recursive: true });

  const docs = [];
  let codeBlocks = 0;

  // ---- learn: one folder per module ----
  for (const mod of MODULES) {
    const dir = path.join(ROOT, mod.slug);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
    let order = 0;
    for (const file of files) {
      order += 1;
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      const fallback = file.replace(/\.md$/, "").replace(/^\d+-/, "").replace(/-/g, " ");
      const doc = await renderDoc(raw, fallback);
      codeBlocks += (doc.html.match(/data-rehype-pretty-code-figure/g) || []).length;

      const slug = file.replace(/\.md$/, "");
      const id = `learn/${mod.slug}/${slug}`;
      docs.push({
        id,
        kind: "learn",
        href: `/learn/${mod.slug}/${slug}`,
        module: mod.slug,
        moduleIndex: mod.index,
        moduleTitle: mod.title,
        slug,
        title: doc.title,
        summary: doc.data.summary ?? "",
        level: doc.data.level ?? "",
        tags: doc.data.tags ?? [],
        order,
        minutes: doc.minutes,
        headings: doc.headings,
      });

      const outFile = path.join(OUT, "docs", "learn", mod.slug, `${slug}.json`);
      fs.mkdirSync(path.dirname(outFile), { recursive: true });
      fs.writeFileSync(outFile, JSON.stringify({ html: doc.html }));
    }
  }

  // ---- flat collections ----
  for (const col of COLLECTIONS.filter((c) => c.dir)) {
    const dir = path.join(ROOT, col.dir);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
    let order = 0;
    for (const file of files) {
      order += 1;
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      const fallback = file.replace(/\.md$/, "").replace(/^\d+-/, "").replace(/-/g, " ");
      const doc = await renderDoc(raw, fallback);
      codeBlocks += (doc.html.match(/data-rehype-pretty-code-figure/g) || []).length;

      const slug = file.replace(/^\d+-/, "").replace(/\.md$/, "");
      const id = `${col.kind}/${slug}`;
      docs.push({
        id,
        kind: col.kind,
        href: `/${col.kind}/${slug}`,
        module: col.kind,
        moduleIndex: "",
        moduleTitle: col.label,
        slug,
        title: doc.title,
        summary: doc.data.summary ?? "",
        level: doc.data.level ?? "",
        tags: doc.data.tags ?? [],
        order,
        minutes: doc.minutes,
        headings: doc.headings,
      });

      const outFile = path.join(OUT, "docs", col.kind, `${slug}.json`);
      fs.mkdirSync(path.dirname(outFile), { recursive: true });
      fs.writeFileSync(outFile, JSON.stringify({ html: doc.html }));
    }
  }

  const stats = {
    docs: docs.length,
    lessons: docs.filter((d) => d.kind === "learn").length,
    projects: docs.filter((d) => d.kind === "projects").length,
    useCases: docs.filter((d) => d.kind === "use-cases").length,
    examples: docs.filter((d) => d.kind === "examples").length,
    modules: MODULES.length,
    codeBlocks,
    minutes: docs.reduce((a, d) => a + d.minutes, 0),
  };

  fs.writeFileSync(
    path.join(OUT, "index.json"),
    JSON.stringify({ stats, modules: MODULES, docs }, null, 0)
  );

  console.log(
    `content: ${stats.docs} docs (${stats.lessons} lessons, ${stats.projects} projects, ` +
      `${stats.useCases} use cases, ${stats.examples} examples), ${codeBlocks} code blocks`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
