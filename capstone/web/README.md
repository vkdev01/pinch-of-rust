# Northwind Analytics - SaaS revenue dashboard

A scaffolded SaaS dashboard built with **Next.js (App Router) + TypeScript**, **Tailwind CSS v4**
(CSS-first, no `tailwind.config.js`) and **HeroUI v3**.

## Stack

| Package | Version |
| --- | --- |
| next | 16.4.6 |
| react / react-dom | 19.3.1 |
| tailwindcss | 4.3.5 |
| @tailwindcss/postcss | 4.3.5 |
| @heroui/react | 3.2.8 |
| @heroui/styles | 3.2.8 |
| typescript | 5.9.x |

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck  # tsc --noEmit
npm run build      # production build
```

## Project structure

```
src/
  app/
    globals.css        # @import "tailwindcss"; then @import "@heroui/styles";
    layout.tsx
    page.tsx
  components/dashboard/
    app-shell.tsx         # sticky header, desktop sidebar, mobile Drawer nav
    sidebar-nav.tsx
    dashboard-view.tsx    # page title, toolbar (Select / Dropdown / Modal), Tabs
    metrics-grid.tsx      # Card + Card.Header + Card.Content + Chip
    revenue-card.tsx      # CSS-only bar chart built from --spacing tokens
    plan-breakdown.tsx    # ProgressBar per plan
    top-accounts.tsx      # ListBox (single selection) + Avatar
    usage-card.tsx        # ProgressBar per metered resource
    invoices-table.tsx    # Table with aria-label + aria-describedby
    new-invoice-modal.tsx # Modal with Input + Select
    icons.tsx
  lib/
    data.ts               # seed data (MRR, plans, usage, invoices, accounts)
    format.ts             # Intl formatters
```

## HeroUI v3 notes

- **No provider.** HeroUI v3 needs no `HeroUIProvider`; components are used directly.
- **Styles.** `src/app/globals.css` starts with `@import "tailwindcss";` followed by
  `@import "@heroui/styles";` - order matters.
- **Design tokens.** Layout spacing/radius is expressed with the library tokens
  (`calc(var(--spacing) * n)`, `var(--radius-xl)`, `var(--surface)`, `var(--separator)`, ...)
  rather than overriding component internals.
- **Compound API used:** `Card.Header/.Title/.Description/.Content/.Footer`, `Modal.*`, `Drawer.*`,
  `Tabs.*`, `Table.*`, `Select.*` + `ListBox.*`, `Dropdown.*`, `Avatar.*`, `Badge.Anchor`,
  `ProgressBar.*`.

## Responsive navigation

The left sidebar is a CSS-rendered `<aside>` that is hidden with
`@media (max-width: 1023px)`, and the identical `SidebarNav` is rendered inside a HeroUI
`Drawer` whose trigger (`.app-drawer-trigger`) is only displayed below 1024px. No `matchMedia`
or JS viewport detection is involved, so there is no hydration flash.

## Accessibility

- `Select` is labelled by a `<Label>` element (React Aria wires `aria-labelledby`); keyboard:
  `ArrowDown`/`ArrowUp`/`Enter`/`Space` opens, arrows move the active option, `Enter` selects,
  `Escape` closes and returns focus to the trigger, typing jumps to a matching option.
- `Table.Content` carries `aria-label="Recent invoices"` plus `aria-describedby` pointing at the
  card description; the first column uses `isRowHeader`.
- The Drawer trigger is a `Button` with `aria-label="Open navigation menu"`; the search input is
  labelled by a visually hidden `<Label>`; `Badge`/icons are decorative and `aria-hidden`.
- The bar chart is exposed as a single `role="img"` with an `aria-label` summary.
