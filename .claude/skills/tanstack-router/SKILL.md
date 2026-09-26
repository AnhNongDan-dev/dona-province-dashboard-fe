---
name: tanstack-router
description: >-
  Type-safe, file-based routing for React apps built with TanStack Router (v1).
  Use whenever you create or edit a route, set up the route tree or the Vite
  router plugin, write a route loader, validate URL/search params with
  validateSearch, guard a route with beforeLoad, redirect or handle not-found,
  navigate with <Link> or useNavigate, split route code, configure preloading,
  or wire router context — even when the user only says "add a page", "read the
  URL params", "protect this route", "the loader", or "the route tree". Covers
  route-tree structure, layouts, data loading, search params, navigation,
  guards, and end-to-end type safety.
compatibility: TanStack Router v1 (@tanstack/react-router), React 18+, file-based routing via @tanstack/router-plugin
---

# TanStack Router

TanStack Router is a fully type-safe router for React. Routes form a tree; each
route owns a slice of the URL and declares — declaratively — how to validate its
search params, guard access, load data, and render. This skill is **generic**:
it teaches the router itself, not any one project's conventions. See
[Adapting to a project](#adapting-to-a-project) at the end.

## How this skill is organized

One concern per file. Find your task in the table, open that one reference —
you should never need to read all of them for a single change.

| Your task | Open |
|---|---|
| Install the router, set up the Vite plugin, `createRouter`, route tree | [references/project-setup.md](references/project-setup.md) |
| Add/edit a route or layout; name a route file; dynamic params; split route code; page `<head>`/title | [references/routes-and-layouts.md](references/routes-and-layouts.md) |
| Write a `loader`, prime a cache, integrate a query library, defer slow data | [references/data-loading.md](references/data-loading.md) |
| Validate `?query` params, read/update search state from the URL | [references/search-params.md](references/search-params.md) |
| Link somewhere, navigate in code, redirect, block navigation, preload | [references/navigation.md](references/navigation.md) |
| Protect a route (auth/permission), handle not-found, error & pending UI | [references/route-guards.md](references/route-guards.md) |
| Type a helper that takes route paths / search / navigation options | [references/type-safety.md](references/type-safety.md) |

Each reference follows the same shape — *when to use it → concepts with minimal
examples → common mistakes* — so they stay predictable to read and to extend.

### …or start from a symptom

Routing bugs usually present as a symptom, not a task. Jump straight to the cause:

| Symptom | Cause → file |
|---|---|
| Loader keeps stale data when only the URL/search changes | Search field missing from `loaderDeps` → [data-loading.md](references/data-loading.md) |
| Loader/component crashes reading a search param (`undefined`) | Route is missing `validateSearch` → [search-params.md](references/search-params.md) |
| A route 403s or redirects unexpectedly | A parent route's `beforeLoad` ran first → [route-guards.md](references/route-guards.md) |
| `<Link to>` / hooks don't autocomplete; `to` accepts any string | Router type not registered → [type-safety.md](references/type-safety.md) |
| Layout renders but the page area is blank | Layout component missing `<Outlet />` → [routes-and-layouts.md](references/routes-and-layouts.md) |
| Protected content flashes before the redirect | Guard placed in the component, not `beforeLoad` → [route-guards.md](references/route-guards.md) |
| Page `<title>` / meta tags don't update | `<HeadContent />` not mounted in the root → [routes-and-layouts.md](references/routes-and-layouts.md) |
| Code-splitting transforms don't run | `tanstackRouter()` ordered after the framework plugin → [project-setup.md](references/project-setup.md) |

## The route lifecycle — one job per hook

Every navigation runs the matched routes through the same ordered pipeline.
Knowing the order is what keeps routing logic clear: each hook does **one**
thing, and putting work in the wrong hook is the most common bug.

```
URL changes
  │
  1. validateSearch  parse & validate ?search params         → typed search object
  2. beforeLoad      guards: auth checks, redirects, context  (runs parent → child)
  3. loaderDeps      pick which search values the loader needs to re-run on
  4. loader          fetch / prime data                      (parent → child; siblings parallel)
  5. component       render — reads params, search, loader data via hooks
```

Error & pending branches: while loaders run the router shows `pendingComponent`;
a thrown error renders `errorComponent`; `throw notFound()` renders
`notFoundComponent`; `throw redirect(...)` navigates instead of rendering.

**Keep each hook to its job:**

- Auth/redirect decisions go in `beforeLoad`, never in the component (a component
  check flashes protected content before it redirects) and not in `loader`
  (guards should run before, and before child loaders).
- Data fetching goes in `loader`, never in a `useEffect` (loaders run before
  render, are cancellable, dedupe, and integrate with preloading).
- Search parsing goes in `validateSearch`, never hand-parsed in the component.
- If a `loader` reads a search value, that value **must** be returned from
  `loaderDeps` — otherwise the loader keeps stale data when only search changes.

## Golden rules

These cut across every reference. Each exists for a concrete reason:

1. **Prefer file-based routing.** The Vite plugin generates the route tree from
   your file structure — the tree stays correct without hand-maintenance. Reach
   for code-based routes only when generating routes dynamically.
2. **Register the router type once.** The `declare module` augmentation is what
   makes every `<Link>`, `useNavigate`, and hook autocomplete real routes. Skip
   it and the whole app silently falls back to untyped routing.
3. **Validate search params with a schema.** A Zod schema in `validateSearch`
   turns `?page=2` into a typed, defaulted `{ page: number }` and rejects junk.
4. **Guard in `beforeLoad`, fetch in `loader`.** See the lifecycle above.
5. **Couple `loaderDeps` to `validateSearch`.** Any search field the loader uses
   belongs in `loaderDeps`, or the loader serves stale data.
6. **Let the bundler split code.** With `autoCodeSplitting` on, write normal
   route files; don't hand-write `lazyRouteComponent` / dynamic imports.
7. **Use `notFound()` and `redirect()`, not conditional rendering.** Throwing
   routes through the framework's error/redirect machinery; an `if` in the
   component does not (no status code, no SSR support, late in the lifecycle).
8. **Never edit the generated route tree** (`routeTree.gen.ts`). It is rebuilt
   on every route-file change; hand edits are lost.

## Project setup check

Before adding routes, confirm the project is wired up (details in
[references/project-setup.md](references/project-setup.md)):

- `@tanstack/react-router` + `@tanstack/router-plugin` installed
- `tanstackRouter({ target: 'react', autoCodeSplitting: true })` in `vite.config.ts`,
  placed **before** the framework plugin
- A generated route tree (e.g. `src/routeTree.gen.ts`) and a `createRouter` call
- The `declare module '@tanstack/react-router'` Register augmentation
- The app wrapped in `<RouterProvider router={router} />`

If any are missing, start with project-setup.md. If all are present, go straight
to the reference for your task.

## Verifying your routing works

Routing is type-driven, so verification is mostly the type-checker:

1. **Regenerate the tree.** The Vite plugin rewrites `routeTree.gen.ts` on save
   while the dev server runs; the standalone `tsr generate` does it without Vite.
2. **Type-check.** Run the project's typecheck. A wrong `to`, a missing
   `params`, or a search value not in the schema all surface as type errors —
   that is the router working as intended.
3. **Check the route in the browser** and, if installed, the Router Devtools
   panel — it shows matched routes, loader state, and search params live.

## Router hooks at a glance

Every hook is typed to the registered route tree. Inside a route file the
`Route` object exposes the same hooks without arguments (`Route.useParams()`);
the standalone hooks take a `from` route id — see type-safety.md.

| Hook | Gives you | Detail in |
|---|---|---|
| `useParams` | Typed path params | routes-and-layouts.md |
| `useSearch` | Typed, validated search params | search-params.md |
| `useLoaderData` | Typed loader return value | data-loading.md |
| `useLoaderDeps` | The resolved `loaderDeps` for the route | data-loading.md |
| `useRouteContext` | Typed router context | data-loading.md |
| `useNavigate` | Imperative `navigate()` function | navigation.md |
| `useRouter` | Router instance — `invalidate()`, `history`, … | navigation.md |
| `useRouterState` | Subscribe to router state (`location`, `isLoading`, …) | navigation.md |
| `useLocation` | Current location, reactively | navigation.md |
| `useMatches` / `useMatch` | The matched-route objects | route-guards.md |
| `useMatchRoute` | Imperatively test whether a route matches | navigation.md |
| `useBlocker` | Block navigation (unsaved-changes guard) | navigation.md |
| `useLinkProps` | `<Link>`-equivalent props for a custom element | navigation.md |
| `getRouteApi(id)` | Typed route hooks from *outside* the route file | type-safety.md |

## Adapting to a project

This skill is portable; real projects layer their own conventions on top. When
you drop it into a project, expect to find these decisions already made — follow
the existing code rather than this skill's generic examples:

- **Guards.** Projects usually wrap auth/permission checks in a helper (e.g.
  `requireAuth()`, `requirePermission(...)`) called from `beforeLoad` or
  `loader`. Reuse the helper; don't re-implement the check inline.
- **Data layer.** Loaders rarely call `fetch` directly — they call into a
  query/repository layer that owns cache keys. Match that layer.
- **Search schemas.** A project may keep search schemas next to its API
  contracts and pass them straight to `validateSearch`. Prefer the shared schema
  over a hand-rolled one.

Keep those project specifics in the project's own docs or rules — not in this
skill, so it stays reusable.

## Extending this skill

The structure is built so additions stay localized:

- **A facet of an existing concern** (one more search-param trick, another
  guard pattern) → add a section to that reference file. Nothing else changes.
- **A genuinely new concern** a developer would look up on its own → add a new
  `references/<concern>.md` following the shared template (*when to use it →
  concepts → common mistakes*), then add one row to the task table and, if it
  has a tell-tale failure mode, one row to the symptom table.
- Keep every example **generic** — no project-specific imports, helpers, or
  paths — so the skill drops cleanly into the next project.

**Scope:** client-side routing with TanStack Router v1. SSR, streaming, and
server functions belong to TanStack Start — out of scope here; if a project
needs them, cover them in a separate skill rather than stretching this one.
