---
name: ui-preview-route
description: >-
  Scaffold a dev-only preview route under apps/frontend/src/routes/ui-preview/ so new
  UI renders instantly in-app — with the project's real theme tokens, components, and
  mock data — instead of being driven through the live app with Playwright + login.
  Use this whenever the user wants to SEE a piece of UI they're working on quickly:
  "let me see this", "preview this UI", "show me how this looks", "I want to look at
  the new card / page / layout / empty state", "make a preview", "don't use playwright,
  just show me", or when proposing UI variants for the user to pick between. Prefer this
  over launching a browser, logging in, and navigating to a deep authenticated page —
  that flow gets stuck at login and is slow. A preview route is reachable at
  http://localhost:3000/ui-preview/<feature> with zero auth.
---

# UI Preview Route

## Why this exists

When you're building or restyling a piece of UI, the user wants to **see it now**. The
naive way — launch Playwright, open the app, log in, navigate three levels deep into an
authenticated route — is slow and routinely gets stuck at the login screen. A preview
route sidesteps all of that: it's a standalone page that renders the component with the
project's actual theme tokens and components, fed by mock data, reachable at a fixed URL
with **no auth and no backend**. The user opens one URL and sees the work.

This is also how we propose UI directions: stack a few variants on one preview page and
let the user pick (that's the global "propose UI via a dev-only preview route" rule —
this skill is the implementation of it, inherited from ELP-fe).

> **Not ported yet.** This repo has no `/ui-preview` subtree. Before the first preview,
> port from `ELP-fe/apps/frontend/src/`: `routes/ui-preview/route.tsx` (dev-only guard) +
> `routes/ui-preview/index.tsx` (auto-discovered list) + `routes/ui-preview/badge/` (gallery
> template), `routes/error/404.tsx` (`throw404Error`), `components/mode-toggle.tsx` +
> `components/theme-provider.tsx`, and `hooks/use-page-name.ts` (with a `// UI Preview`
> block). Skip ELP's domain previews (`contest-*`, `gold-topup`, `assign-problems-empty`, …).

## The mechanics that make it work

The whole `/ui-preview/*` subtree is already gated dev-only in
[`route.tsx`](apps/frontend/src/routes/ui-preview/route.tsx) via
`if (!import.meta.env.DEV) throw404Error()`. `import.meta.env.DEV` is Vite's build-time
flag — statically `false` in a production build — so the guard tree-shakes to an
unconditional 404 and the entire subtree disappears from prod. **Every child route you
add inherits this automatically; you never write your own guard.**

Routing is file-based: dropping `ui-preview/<feature>/index.tsx` makes
`@tanstack/router-plugin` regenerate `routeTree.gen.ts` on the next dev-server tick. The
[index page](apps/frontend/src/routes/ui-preview/index.tsx) auto-discovers child routes
from the router tree, so your new page shows up in the sandbox list without editing it.

Dev URL: **`http://localhost:3000/ui-preview/<feature>`** (port is `FRONTEND_PORT || 3000`
in [`vite.config.ts`](apps/frontend/vite.config.ts)).

## Steps

1. **Pick a kebab-case feature slug** for the route segment — `district-cards`,
   `indicators-empty`, `province-header`. If you're showing one component, name it after
   that component; if you're proposing variants of a screen, name it after the screen +
   state (`<feature>-<state>`).

2. **Read the closest existing preview as your template.** Don't scaffold from memory —
   the conventions live in real files. Pick the nearest match:
   - A component/badge gallery → [`ui-preview/badge/index.tsx`](apps/frontend/src/routes/ui-preview/badge/index.tsx)
   - A rich page with mock domain data / an empty-edge state → none yet; the first one you
     build (e.g. `ui-preview/district-cards/`) becomes the template. Until then, use the
     skeleton below.

3. **Create `apps/frontend/src/routes/ui-preview/<feature>/index.tsx`** following the
   skeleton below. Register the route id with `createFileRoute("/ui-preview/<feature>/")`
   (trailing slash — that's the index route's full path).

4. **Add the page-name entry** in
   [`use-page-name.ts`](apps/frontend/src/hooks/use-page-name.ts) under the
   `// UI Preview` block: `"/ui-preview/<feature>/": "Preview — <Label>",`. `PAGE_NAME` is
   an exhaustive `Record<RouteId, string>`; a missing entry fails `pnpm lint`. This is the
   one file edit besides the route itself.

5. **Tell the user the exact URL**: `http://localhost:3000/ui-preview/<feature>`. If the
   dev server isn't running, mention `pnpm dev:fe`. The router regenerates the tree on
   save, so a running server picks the route up with no restart.

## The skeleton

Match whichever template you read in step 2; this is the shared frame every preview uses
— a full-page background, the project's theme tokens, and a `ModeToggle` so the user can
check the design in both light and dark mode.

Replace `district-cards` / `DistrictCards` / `Card quận/huyện` with your own feature slug,
PascalCase name, and label.

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { ModeToggle } from "@/components/mode-toggle";
// import the REAL components you're previewing from @/...

export const Route = createFileRoute("/ui-preview/district-cards/")({
  component: DistrictCardsPreviewPage,
});

function DistrictCardsPreviewPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl space-y-8 p-8">
        <div className="flex items-center justify-between border-b pb-4">
          <h1 className="text-2xl font-bold">Preview — Card quận/huyện</h1>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Toggle Theme:</span>
            <ModeToggle />
          </div>
        </div>

        {/* When proposing variants, stack them as labelled sections so the
            user can compare on one page: */}
        <section className="space-y-4 rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
          <h2 className="text-xl font-semibold">Variant A — bố cục gọn</h2>
          {/* <RealComponent {...mockProps} /> */}
        </section>
      </div>
    </div>
  );
}
```

## What makes a preview useful (and what breaks it)

- **Render the REAL component, not a re-implementation.** The point is to see the actual
  thing. Import the component you're working on from `@/...` and feed it props. If it's
  too coupled to fetch/router/context to render standalone, that coupling is worth
  surfacing — note it and preview the presentational part.

- **Use the project's theme tokens, never hardcoded colors.** `bg-background`,
  `bg-card`, `text-muted-foreground`, `border`, etc. — same Tailwind v4 tokens the real
  app uses. Hardcoded hex defeats the purpose: the user is checking how it looks *in this
  theme*, and the `ModeToggle` lets them verify dark mode too.

- **Mock the data inline — no backend, no repository, no query.** A preview must render
  with the dev server alone, with no auth and no API up. Define plain mock objects/types
  in the file (inline `Mock<Entity>` types that mirror the real DTO shape, e.g.
  `type MockDistrict = { id: number; name: string; population: number }`). If you need believable relative timestamps, build them at
  runtime inside the component, not at module load.

- **Reuse real enums via `<AppBadge value={...} />`** rather than styling status strings
  by hand — that's the project's enum-display rule and keeps the preview honest.

- **Leave the preview in place after the user picks.** Once a variant is chosen, apply it
  to the real component, but keep the preview route as a living sandbox — that's why the
  subtree exists.

## Verify before you report done

- `pnpm lint 2>&1 | grep -E "(ui-preview/<feature>|use-page-name)" | head -20` — empty
  output means your route + the `PAGE_NAME` entry type-check. A missing `PAGE_NAME` row
  is the most common failure here.
- Confirm the route renders against `bg-background` and has the `ModeToggle`, so the user
  can judge both themes.
- Hand the user the URL, not a "done" — the deliverable is something they can open.
