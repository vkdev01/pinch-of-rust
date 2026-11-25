import Link from "next/link";
import { Chip } from "@heroui/react";

import { ArrowLeft, ArrowRight } from "@/components/icons";
import { ProseWithFigures } from "@/components/figure";
import { TocRail } from "@/components/toc-rail";
import { getDocHtml, getModules, lessonsOf, neighbours, type Doc } from "@/lib/content";
import { pad, readingTime } from "@/lib/utils";

type Props = { doc: Doc };

export function DocShell({ doc }: Props) {
  const html = getDocHtml(doc);
  const { prev, next } = neighbours(doc);
  const modules = getModules();
  const isLesson = doc.kind === "learn";
  const lessons = isLesson ? lessonsOf(doc.module) : [];
  const moduleMeta = modules.find((m) => m.slug === doc.module);

  return (
    <div className="mx-auto grid max-w-[1180px] gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_200px]">
      {/* left: course tree, only on lessons */}
      {isLesson ? (
        <aside className="hidden lg:block">
          <div className="sticky top-20">
            <Link href="/learn" className="label mb-3 block hover:text-foreground">
              ← All lessons
            </Link>
            <p className="label mb-2 text-accent">
              {moduleMeta ? `${moduleMeta.index} · ${moduleMeta.title}` : doc.moduleTitle}
            </p>
            <ul className="flex flex-col gap-0.5">
              {lessons.map((l) => (
                <li key={l.id}>
                  <Link
                    href={l.href}
                    aria-current={l.id === doc.id ? "page" : undefined}
                    className="nav-link"
                  >
                    <span className="num shrink-0 text-[10px] text-muted/70">{pad(l.order)}</span>
                    <span className="min-w-0">{l.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      ) : (
        <aside className="hidden lg:block">
          <div className="sticky top-20">
            <Link href={`/${doc.kind}`} className="label mb-3 block hover:text-foreground">
              ← All {doc.kind.replace("-", " ")}
            </Link>
            <p className="label mb-2 text-accent">{doc.moduleTitle}</p>
            <p className="text-[12.5px] leading-relaxed text-muted">
              {doc.summary || "A worked build with milestones, code and a demo checklist."}
            </p>
          </div>
        </aside>
      )}

      {/* centre: the article */}
      <article className="min-w-0">
        <header className="mb-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="label text-accent">
              {isLesson
                ? `${doc.moduleIndex} · lesson ${pad(doc.order)}`
                : doc.kind.replace("-", " ")}
            </span>
            <span className="size-1 rounded-full bg-border" />
            <span className="num text-[10.5px] text-muted">{readingTime(doc.minutes)}</span>
            {doc.level ? (
              <Chip size="sm" variant="secondary" className="num">
                {doc.level}
              </Chip>
            ) : null}
          </div>

          <h1 className="mt-3 text-balance text-[26px] font-semibold leading-[1.18] tracking-[-0.025em] sm:text-[30px]">
            {doc.title}
          </h1>

          {doc.summary ? (
            <p className="mt-3 max-w-[62ch] text-pretty text-[14px] leading-relaxed text-muted">
              {doc.summary}
            </p>
          ) : null}

          {doc.tags.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {doc.tags.map((t) => (
                <span key={t} className="chip num text-[10.5px]">
                  {t}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-6 h-px w-full bg-gradient-to-r from-accent/60 via-border to-transparent" />
        </header>

        <div className="prose">
          <ProseWithFigures html={html} />
        </div>

        <nav className="mt-12 grid gap-3 border-t border-border/70 pt-6 sm:grid-cols-2" aria-label="Pagination">
          {prev ? (
            <Link href={prev.href} className="card-lift rounded-lg border border-border/70 bg-surface/60 p-4">
              <span className="label flex items-center gap-1.5">
                <ArrowLeft className="size-3" /> Previous
              </span>
              <span className="mt-1.5 block text-[13.5px] font-medium">{prev.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={next.href}
              className="card-lift rounded-lg border border-border/70 bg-surface/60 p-4 text-right"
            >
              <span className="label flex items-center justify-end gap-1.5">
                Next <ArrowRight className="size-3" />
              </span>
              <span className="mt-1.5 block text-[13.5px] font-medium">{next.title}</span>
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </article>

      {/* right: table of contents */}
      <aside className="hidden xl:block">
        <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto rail-scroll pr-1">
          <TocRail headings={doc.headings} />
        </div>
      </aside>
    </div>
  );
}
