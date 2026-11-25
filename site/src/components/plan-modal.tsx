"use client";

import { Modal, Button, Chip } from "@heroui/react";

import { Spark } from "@/components/icons";

const WEEKS = [
  {
    title: "Week 1 — the language",
    days: "Days 1–7",
    items: ["toolchain + cargo", "types and control flow", "structs, enums, matching", "collections", "a word-frequency CLI"],
  },
  {
    title: "Week 2 — ownership",
    days: "Days 8–14",
    items: ["move semantics", "borrowing and lifetimes", "traits and generics", "error handling", "refactor without clone()"],
  },
  {
    title: "Week 3 — the ecosystem",
    days: "Days 15–21",
    items: ["testing", "smart pointers", "threads and rayon", "clippy + CI", "ship a CLI"],
  },
  {
    title: "Week 4 — async and a service",
    days: "Days 22–30",
    items: ["async/await", "axum + sqlx", "background jobs", "observability", "deploy it"],
  },
];

export function PlanModal() {
  return (
    <Modal>
      <Button variant="secondary" size="sm">
        <Spark className="size-3.5" />
        30-day plan
      </Button>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-[560px]">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Thirty days, two hours a day</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="mb-4 text-[13px] leading-relaxed text-muted">
                The compressed path from &ldquo;I have never written Rust&rdquo; to a deployed service.
                Every day ends with something that compiles.
              </p>
              <ol className="flex flex-col gap-3">
                {WEEKS.map((w) => (
                  <li key={w.title} className="rounded-lg border border-border/70 bg-surface/50 p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-medium">{w.title}</span>
                      <Chip size="sm" variant="secondary" className="num">
                        {w.days}
                      </Chip>
                    </div>
                    <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
                      {w.items.join(" · ")}
                    </p>
                  </li>
                ))}
              </ol>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
