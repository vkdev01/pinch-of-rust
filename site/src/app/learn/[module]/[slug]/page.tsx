import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocShell } from "@/components/doc-shell";
import { docsOf, getDoc } from "@/lib/content";

export const dynamicParams = false;

export function generateStaticParams() {
  return docsOf("learn").map((d) => ({ module: d.module, slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ module: string; slug: string }>;
}): Promise<Metadata> {
  const { module, slug } = await params;
  const doc = getDoc("learn", slug, module);
  if (!doc) return { title: "Not found" };
  return {
    title: doc.title,
    description: doc.headings.slice(0, 4).map((h) => h.text).join(", "),
  };
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ module: string; slug: string }>;
}) {
  const { module, slug } = await params;
  const doc = getDoc("learn", slug, module);
  if (!doc) notFound();
  return <DocShell doc={doc} />;
}
