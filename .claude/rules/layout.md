---
description: Rules for the landing/auth/error shell, AppHeader, and padding/spacing responsibility between parent and child components
paths:
  - "apps/frontend/**/*.tsx"
---

# Layout Rules

## Shell scope

These rules apply to the **landing / auth / error shell** — i.e. routes that compose `AppHeader` directly (`routes/index.tsx`, plus `routes/auth/route.tsx` / `routes/error/route.tsx` once they exist).

> `AppHeader` / `AppFooter` and the sidebar app shell are not in this repo yet — port them from ELP-fe (`D:\DONASKY\SOURCE\ELP\ELP-fe`) when the shell is built.

The authenticated app shell (the dashboard routes, once added) uses `SidebarProvider` + `SidebarInset` + `SiteHeader` and is governed by shadcn's sidebar primitives, not by this rule. The padding/spacing rule below still applies everywhere.

## Landing / Auth / Error Shell

The shell follows this structure:

```
<div class="flex min-h-svh flex-col">
  <AppHeader />            <!-- sticky, h-14 (3.5rem) -->
  <Outlet />               <!-- page content -->
  <AppFooter />
</div>
```

- The outer wrapper uses `flex min-h-svh flex-col` so the footer sits at the bottom on short pages.
- Vertical scroll is allowed; horizontal scroll is **forbidden** at the shell level — no `overflow-x-*` on the shell wrapper or any ancestor that would clip page content.
- `overflow-x-auto` is only acceptable on a *purpose-built* horizontal scroll container (e.g. a wide table, a horizontal card list, a code console). Never wrap the page or section with it "just in case."

## AppHeader

`AppHeader` is a **single-row** sticky header:

- Outer: `<header class="sticky top-0 z-50 w-full border-b border-border/50 bg-background/95 backdrop-blur ...">`
- Inner: `flex h-14 items-center justify-between gap-4 px-6` containing `[Logo + App name] [spacer] [ModeToggle]`
- Total height: **3.5rem (`h-14`)** — same on all breakpoints, no responsive nav row.

Constraints:

- Always sticky at the top with `z-50`.
- Header content is internal — pages composing `AppHeader` must NOT add `pt-*` to offset themselves from it; the header is sticky, so it occupies its own space.
- If any component anywhere depends on header height via `calc(100svh - <header>)` / `calc(100dvh - <header>)` / `top-<header>`, the constant is **3.5rem / 56px / `h-14`**. If `AppHeader` ever changes height, those call sites must be updated together.

## Padding / Spacing Responsibility

**Parent provides padding; children do not add their own outer padding.**

- The layout or page component that renders a child component is responsible for the spacing/padding around it.
- A new component must **not** add `p-*`, `px-*`, `py-*`, `m-*`, `mx-*`, `my-*` on its own outermost element to offset itself from its parent.
- Only add internal padding (between the component's own children) when it is semantically part of the component (e.g. a card's content area, a header bar's horizontal padding).

```tsx
// Bad — component pads itself against its parent
function MyCard() {
  return <div className="px-6 py-4 ...">...</div>; // ← outer padding belongs to parent
}

// Good — parent controls spacing, component starts at its own boundary
function MyCard() {
  return <div className="...">...</div>;
}

// In parent:
<div className="p-6">
  <MyCard />
</div>
```

This rule applies to **every** route under `apps/frontend/`, including the authenticated app shell.
