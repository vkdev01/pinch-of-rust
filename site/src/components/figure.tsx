import type { ComponentType } from "react";

import {
  BundleSizeChart,
  ComplexityChart,
  LatencyBudgetChart,
  MemoryLatencyChart,
  QueueDepthChart,
  ThreadScalingChart,
} from "@/components/figures/charts";
import { BorrowCanvas, RingCanvas, SortCanvas } from "@/components/figures/canvas";
import { ArchLayers, AxumRequest, MatchFlow, OwnershipFlow, QueueLifecycle } from "@/components/figures/flows";

/**
 * Markdown carries `[[fig:key]]` on its own line; the build leaves it as text and
 * this map turns it into a live component. Unknown keys are dropped silently.
 */
const REGISTRY: Record<string, ComponentType> = {
  "ownership-flow": OwnershipFlow,
  "complexity": ComplexityChart,
  "memory-latency": MemoryLatencyChart,
  "thread-scaling": ThreadScalingChart,
  "latency-budget": LatencyBudgetChart,
  "bundle-size": BundleSizeChart,
  "queue-depth": QueueDepthChart,
  "queue-lifecycle": QueueLifecycle,
  "axum-request": AxumRequest,
  "arch-layers": ArchLayers,
  "match-flow": MatchFlow,
  "canvas-sort": SortCanvas,
  "canvas-ring": RingCanvas,
  "canvas-borrow": BorrowCanvas,
};

const MARKER = /<p>\s*\[\[fig:([a-z0-9-]+)\]\]\s*<\/p>/;

export function ProseWithFigures({ html }: { html: string }) {
  const parts = html.split(MARKER);

  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) {
          if (!part.trim()) return null;
          return (
            <div key={`h${i}`} className="contents" dangerouslySetInnerHTML={{ __html: part }} />
          );
        }
        const Fig = REGISTRY[part];
        return Fig ? <Fig key={`f${i}-${part}`} /> : null;
      })}
    </>
  );
}
