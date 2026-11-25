import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocShell } from "@/components/doc-shell";
import { docsOf, getDoc } from "@/lib/content";

export const dynamicParams = false;

export function generateStaticParams() {
  return docsOf("examples").map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = getDoc("examples", slug);
  return doc ? { title: doc.title, description: doc.summary } : { title: "Not found" };
}

export default async function ExamplePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = getDoc("examples", slug);
  if (!doc) notFound();
  return <DocShell doc={doc} />;
}
