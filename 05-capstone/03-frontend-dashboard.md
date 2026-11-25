# 03 · The Dashboard Frontend

The Pulse dashboard is a Next.js App Router app with Tailwind CSS v4 and
**HeroUI v3** (`@heroui/react` + `@heroui/styles`). This module covers the
scaffold, the component composition, and the two things that are easy to get
wrong: the stylesheet import order and accessibility.

The full working project ships alongside this course as
`heroui-saas-dashboard/` (see the README of that repo for exact versions).

## Scaffold

```bash
$ npx create-next-app@latest web --typescript --app --tailwind --eslint --src-dir=false
$ cd web
$ npm install @heroui/react @heroui/styles
```

Add a typecheck script, because `next build` is not a typecheck you can iterate on:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "lint": "next lint"
  }
}
```

```bash
$ npm run typecheck
$ npm run build
```

Both must pass before you call the UI done. A dev server that renders is not the
same thing — `build` catches type errors, invalid exports and server/client
boundary mistakes that `dev` tolerates.

## Tailwind v4: no config file

Tailwind v4 is CSS-first. There is no `tailwind.config.js`; configuration lives in
the stylesheet via `@theme`.

```js
// postcss.config.mjs
const config = {
  plugins: { "@tailwindcss/postcss": {} },
};
export default config;
```

## The global stylesheet — order matters

```css
/* app/globals.css */
@import "tailwindcss";
@import "@heroui/styles";     /* AFTER Tailwind — this is the rule */

/* optional: tune the design tokens HeroUI exposes */
:root {
  --radius-lg: 0.875rem;
}
```

> **Gotcha:** importing `@heroui/styles` **before** `tailwindcss` compiles but
> silently loses component styles, because Tailwind's preflight resets them
> afterwards. The order is not cosmetic.

### Styling with the library's variables, not overrides

HeroUI exposes spacing and radius as CSS custom properties. Use them instead of
patching component internals:

```tsx
<div className="p-[var(--spacing-md)] rounded-[var(--radius-lg)] gap-[var(--spacing-sm)] flex flex-col">
  <Card className="shadow-none">
    <Card.Header className="pb-[var(--spacing-sm)]">…</Card.Header>
  </Card>
</div>
```

Why this matters: overriding `.card__body { padding: 12px }` breaks the moment
the library changes its internal class names, and it fights the design system's
density scale. Consuming the variables keeps your layout consistent with the
components and survives upgrades.

## No provider in v3

HeroUI v3 does **not** need a provider wrapper. There is no `<HeroUIProvider>` to
add to `app/layout.tsx`. If you copy a v2 tutorial that wraps the tree in a
provider, delete it — at best it is dead code, at worst it duplicates context.

```tsx
// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pulse — Usage Analytics",
  description: "SaaS usage analytics dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh bg-[var(--background)] text-[var(--foreground)]">
        {children}
      </body>
    </html>
  );
}
```

## The compound component API

v3 components compose with dot notation. `Card.Header` and `Card.Content` are the
ones that replace v2's monolithic props:

```tsx
import { Card, Badge, ProgressBar } from "@heroui/react";

<Card>
  <Card.Header className="flex items-center justify-between">
    <div>
      <p className="text-sm opacity-70">Monthly recurring revenue</p>
      <p className="text-2xl font-semibold tabular-nums">₹48,200</p>
    </div>
    <Badge color="success">+12.4%</Badge>
  </Card.Header>
  <Card.Content>
    <ProgressBar value={82} aria-label="Quota used" />
  </Card.Content>
</Card>
```

That pattern repeats for every KPI tile. `Card.Header` carries the label and
trend; `Card.Content` carries the visual.

## Layout: sticky header + responsive left nav

```tsx
// app/(dashboard)/layout.tsx  — client component
"use client";

import { useState } from "react";
import { Drawer, Button } from "@heroui/react";
import { SideNav } from "@/components/side-nav";
import { SearchField } from "@/components/search-field";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="min-h-dvh">
      {/* sticky header */}
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur">
        <div className="flex items-center gap-3 px-[var(--spacing-md)] py-[var(--spacing-sm)]">
          <Button
            className="lg:hidden"
            aria-label="Open navigation"
            onPress={() => setNavOpen(true)}
          >
            ☰
          </Button>
          <span className="font-semibold">Pulse</span>
          <div className="ml-auto w-full max-w-sm">
            <SearchField />
          </div>
        </div>
      </header>

      <div className="flex">
        {/* desktop nav: hidden below 1024px */}
        <aside className="hidden lg:block w-64 shrink-0 border-r border-[var(--border)] min-h-[calc(100dvh-57px)]">
          <SideNav />
        </aside>

        {/* mobile nav: a Drawer below 1024px */}
        <Drawer isOpen={navOpen} onOpenChange={setNavOpen} placement="left">
          <Drawer.Content>
            <Drawer.Header>Navigation</Drawer.Header>
            <Drawer.Body>
              <SideNav onNavigate={() => setNavOpen(false)} />
            </Drawer.Body>
          </Drawer.Content>
        </Drawer>

        <main className="flex-1 p-[var(--spacing-md)]">{children}</main>
      </div>
    </div>
  );
}
```

Two details that make this work:

- `lg:` is Tailwind's `min-width: 1024px`. `hidden lg:block` on the aside plus
  `lg:hidden` on the trigger gives exactly the "collapses below 1024px" behaviour.
- The `sticky` header needs a stacking context above the content (`z-40`) or
  cards scroll over it.

## The dashboard page

```tsx
// app/page.tsx
import { Card, Badge, ProgressBar, Table, Avatar, Tabs, Tabs.List, Tabs.Panel } from "@heroui/react";
import { KpiCard } from "@/components/kpi-card";
import { UsageChart } from "@/components/usage-chart";
import { InvoiceTable } from "@/components/invoice-table";
import { PlanBreakdown } from "@/components/plan-breakdown";

export default async function Page() {
  const data = await getDashboard();          // server-side fetch, module 05.02 API

  return (
    <div className="flex flex-col gap-[var(--spacing-lg)]">
      <div className="grid gap-[var(--spacing-md)] sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="MRR" value={formatInr(data.mrr)} change={data.mrr_change_pct} />
        <KpiCard label="Active users" value={data.active_users} change={data.active_users_change_pct} />
        <KpiCard label="Churn" value={`${data.churn_pct}%`} change={-0.4} />
        <KpiCard label="Quota used" value={`${data.quota.used}/${data.quota.limit}`}>
          <ProgressBar
            value={Math.round((data.quota.used / data.quota.limit) * 100)}
            aria-label={`Quota used: ${data.quota.used} of ${data.quota.limit} API calls`}
          />
        </KpiCard>
      </div>

      <Tabs aria-label="Dashboard sections">
        <Tabs.List>
          <Tabs.Tab id="usage">Usage</Tabs.Tab>
          <Tabs.Tab id="plans">Plans</Tabs.Tab>
          <Tabs.Tab id="invoices">Invoices</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel id="usage"><UsageChart data={data.usage} /></Tabs.Panel>
        <Tabs.Panel id="plans"><PlanBreakdown plans={data.plans} /></Tabs.Panel>
        <Tabs.Panel id="invoices"><InvoiceTable invoices={data.invoices} /></Tabs.Panel>
      </Tabs>
    </div>
  );
}
```

## The table, with accessible labelling

```tsx
// components/invoice-table.tsx
"use client";

import { Table, Badge, Dropdown, Button } from "@heroui/react";

export function InvoiceTable({ invoices }: { invoices: InvoiceRow[] }) {
  return (
    <Table aria-label="Recent invoices">
      <Table.Header>
        <Table.Column isRowHeader>Invoice</Table.Column>
        <Table.Column>Period</Table.Column>
        <Table.Column>Amount</Table.Column>
        <Table.Column>Status</Table.Column>
        <Table.Column>Actions</Table.Column>
      </Table.Header>
      <Table.Body>
        {invoices.map((inv) => (
          <Table.Row key={inv.id}>
            <Table.Cell>{inv.number}</Table.Cell>
            <Table.Cell>{inv.period}</Table.Cell>
            <Table.Cell className="tabular-nums">{formatInr(inv.amount)}</Table.Cell>
            <Table.Cell>
              <Badge color={inv.status === "paid" ? "success" : "warning"}>
                {inv.status}
              </Badge>
            </Table.Cell>
            <Table.Cell>
              <Dropdown>
                <Dropdown.Trigger>
                  <Button size="sm" variant="flat" aria-label={`Actions for ${inv.number}`}>
                    ⋯
                  </Button>
                </Dropdown.Trigger>
                <Dropdown.Menu aria-label={`Actions for ${inv.number}`}>
                  <Dropdown.Item id="view">View</Dropdown.Item>
                  <Dropdown.Item id="download">Download PDF</Dropdown.Item>
                  <Dropdown.Item id="void">Void</Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
}
```

`aria-label` on `<Table>` gives the grid a name for screen readers, and
`isRowHeader` on the first column makes each row announce "INV-2026-091, row 1"
instead of just reading cell values. Without both, a screen-reader user hears an
unnamed grid of numbers.

## Select and ListBox

```tsx
// components/plan-filter.tsx
"use client";

import { Select, ListBox } from "@heroui/react";

export function PlanFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select
      aria-label="Filter by plan"
      placeholder="All plans"
      selectedKey={value}
      onSelectionChange={(k) => onChange(String(k))}
    >
      <ListBox>
        <ListBox.Item id="all">All plans</ListBox.Item>
        <ListBox.Item id="free">Free</ListBox.Item>
        <ListBox.Item id="pro">Pro</ListBox.Item>
        <ListBox.Item id="scale">Scale</ListBox.Item>
      </ListBox>
    </Select>
  );
}
```

`aria-label` is required: a `Select` with only a placeholder has no accessible
name, and a screen reader announces an unnamed combobox.

## Modal and Drawer

```tsx
"use client";
import { Modal, Button } from "@heroui/react";

const [open, setOpen] = useState(false);

<Button onPress={() => setOpen(true)}>Invite member</Button>

<Modal isOpen={open} onOpenChange={setOpen}>
  <Modal.Content>
    <Modal.Header>Invite a member</Modal.Header>
    <Modal.Body>
      <InviteForm onDone={() => setOpen(false)} />
    </Modal.Body>
    <Modal.Footer>
      <Button variant="light" onPress={() => setOpen(false)}>Cancel</Button>
      <Button type="submit" form="invite-form">Send invite</Button>
    </Modal.Footer>
  </Modal.Content>
</Modal>
```

Both `Modal` and `Drawer` handle focus trapping, `Escape`, and restoring focus to
the trigger on close. That is a large accessibility win you get for free — do not
reimplement it with a div.

## Avatar and Badge

```tsx
<Avatar src={user.avatarUrl} name={user.name} aria-label={user.name} size="sm" />
<Badge color="danger">{unread}</Badge>
```

## Search field

```tsx
// components/search-field.tsx
"use client";
import { SearchField as HeroSearchField } from "@heroui/react";

export function SearchField() {
  return (
    <HeroSearchField
      aria-label="Search invoices, customers and plans"
      placeholder="Search…"
      className="w-full"
    />
  );
}
```

## Accessibility checklist

- [ ] Every `Select`, `Table`, `Modal`, `Drawer` and icon-only `Button` has an
      `aria-label` or an associated visible label.
- [ ] `Table` has `aria-label` **and** `isRowHeader` on the first column.
- [ ] Icon-only buttons say what they do (`aria-label="Open navigation"`), not
      what they look like.
- [ ] Focus is visible: never `outline-none` without a `focus-visible` ring.
- [ ] Colour is not the only signal — the invoice status has text, not just a
      green dot.
- [ ] `ProgressBar` has an `aria-label` including the actual numbers.
- [ ] Tab order follows visual order; the nav Drawer comes before `main` in the
      DOM.
- [ ] Contrast ≥ 4.5:1 for body text.

### Verifying keyboard navigation

Do this by hand, in this order — it takes two minutes and catches almost
everything:

| Component | Keys to test | Expected |
| --- | --- | --- |
| `Select` | `Tab` to focus, `Enter`/`Space` to open | menu opens, focus moves into it |
| `Select` | `↓` `↑` | highlight moves, announced by the screen reader |
| `Select` | `Enter` | selects, closes, focus returns to the trigger |
| `Select` | `Esc` | closes without changing the value |
| `Table` | `Tab` | focus enters the grid, arrow keys move between cells |
| `Table` | `Home` / `End` | first / last cell in the row |
| `Modal` | `Esc` | closes; focus returns to the button that opened it |
| `Drawer` | `Tab` | focus is trapped inside while open |
| Nav | `Tab` from the header | reaches the nav links in visual order |

Screen-reader spot checks (VoiceOver `Cmd+F5` on macOS, NVDA on Windows):

1. The table announces its name and "row 1 of 12".
2. The select announces "Filter by plan, combo box, All plans".
3. The progress bar announces "Quota used: 412000 of 500000".

## Wiring the API

```ts
// lib/api.ts
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export async function getDashboard(): Promise<Dashboard> {
  const res = await fetch(`${API}/v1/dashboard`, {
    headers: { Authorization: `Bearer ${process.env.API_TOKEN}` },
    next: { revalidate: 30 },        // cache for 30s
  });
  if (!res.ok) throw new Error(`dashboard: ${res.status}`);
  return res.json();
}
```

Fetch on the server where possible: the token stays out of the browser bundle, and
the first paint has data instead of a spinner.

## Loading and error states

```tsx
// app/loading.tsx
export default function Loading() {
  return <div className="p-[var(--spacing-lg)] opacity-60">Loading dashboard…</div>;
}
```

```tsx
// app/error.tsx
"use client";
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="p-[var(--spacing-lg)]">
      <h2 className="font-semibold">Could not load the dashboard</h2>
      <button className="underline" onClick={reset}>Try again</button>
    </div>
  );
}
```

`loading.tsx` and `error.tsx` are App Router conventions — no library needed.

---

## Exercises

1. Confirm the stylesheet import order by swapping the two `@import` lines and
   observing the visual breakage.
2. Add a fourth KPI tile using `Card` + `Card.Header` + `Card.Content`.
3. Move every hard-coded padding to `var(--spacing-*)` and every radius to
   `var(--radius-*)`.
4. Add a `Select` + `ListBox` filter that actually filters the invoice table.
5. Run the keyboard table above against your build and fix anything that fails.
6. Add a `Modal` to create an invoice and a `Drawer` for invoice detail, both
   with correct focus behaviour.
7. Confirm `npm run typecheck` and `npm run build` both pass with zero warnings.

---

**Next:** [Deployment](04-deploy.md)
