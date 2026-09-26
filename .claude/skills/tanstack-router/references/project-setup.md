# Project Setup

**Use this file when:** wiring TanStack Router into a project for the first
time, or auditing whether an existing setup is complete.

A working setup is five pieces: packages, the Vite plugin, a generated route
tree, a `createRouter` call, and `<RouterProvider>`. Miss one and routing fails
in a way that is hard to trace — so this file is a checklist, not a tutorial.

## 1. Install

```bash
npm install @tanstack/react-router
npm install -D @tanstack/router-plugin   # file-based routing (Vite/Rspack/Webpack)
npm install -D @tanstack/react-router-devtools   # optional, dev only
```

`@tanstack/router-plugin` generates the route tree from your files. The
standalone `@tanstack/router-cli` (`tsr generate` / `tsr watch`) does the same
without a bundler — use it only if you are not on a supported bundler.

The examples below use **Vite**. `@tanstack/router-plugin` ships matching
entry points for other bundlers (`/rspack`, `/webpack`, `/esbuild`) with the
same options — adapt the import, not the config.

## 2. Vite plugin

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react(), // MUST come after tanstackRouter()
  ],
})
```

Two things matter here:

- **Plugin order.** `tanstackRouter()` must run **before** `react()`. Wrong
  order fails silently — the tree generates but code-splitting transforms don't.
- **`autoCodeSplitting: true`.** The plugin splits each route's component into
  its own chunk at build time. With this on, write plain route files — see
  routes-and-layouts.md. Do not hand-write `lazyRouteComponent` / `.lazy.tsx`.

Common options:

| Option | Purpose |
|---|---|
| `target` | `'react'` \| `'solid'` — must match the framework |
| `autoCodeSplitting` | Split route components into separate chunks |
| `routesDirectory` | Where route files live (default `./src/routes`) |
| `generatedRouteTree` | Output path (default `./src/routeTree.gen.ts`) |
| `routeFileIgnorePrefix` | Files/folders with this prefix are ignored by the router — use it to colocate non-route files (components, utils) inside `routes/` |
| `quoteStyle` | Quote style of the generated file, to match your formatter |

## 3. The generated route tree

`routeTree.gen.ts` is written by the plugin from your route files.

- **Never edit it by hand** — it is overwritten on every route-file change.
- **Committing it is fine** (and common): it is a build input. Decide once per
  project and keep `.gitignore` consistent with that choice.
- It regenerates automatically while the dev server runs; `tsr generate`
  rebuilds it without Vite (useful in CI or pre-typecheck).

## 4. createRouter

```ts
// src/main.tsx
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',        // preload on hover/focus — see navigation.md
  defaultPreloadStaleTime: 0,      // let the data layer decide freshness
  defaultPendingComponent: GlobalSpinner,
  defaultErrorComponent: GlobalError,
  defaultNotFoundComponent: GlobalNotFound,
  scrollRestoration: true,         // restore scroll position per navigation
})
```

Router-level defaults apply to every route; any route can override its own.
`context` (for dependency injection into `beforeLoad`/`loader`) is covered in
data-loading.md and route-guards.md.

## 5. Register the type + render

```ts
// Make every route-aware API (Link, useNavigate, hooks) typed to THIS router.
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function App() {
  return <RouterProvider router={router} />
}
```

The `declare module` augmentation is not optional polish — without it, all
route types collapse to `AnyRouter` and `<Link to="...">` accepts any string.
See type-safety.md.

## File-naming conventions (quick map)

The plugin maps file paths to URLs. Full rules and layout nesting are in
routes-and-layouts.md; this is the at-a-glance version.

| File | Route |
|---|---|
| `__root.tsx` | Root layout — wraps everything |
| `index.tsx` | `/` (index of its folder) |
| `about.tsx` | `/about` |
| `posts.$postId.tsx` | `/posts/:postId` (dot = path separator) |
| `posts/$postId.tsx` | `/posts/:postId` (folder = path separator) |
| `posts/route.tsx` | `/posts` layout for everything under `posts/` |
| `_app.tsx` + `_app/home.tsx` | pathless layout — `/home` wrapped, no `/_app` segment |
| `$.tsx` | splat / catch-all |
| `(group)/...` | route group — organizes files, adds no URL segment |

## Setup smoke test

After setup, this should hold:

- Dev server starts; `routeTree.gen.ts` exists and lists your routes.
- `<Link to="/">` autocompletes real paths (proves the Register augmentation).
- Visiting an unknown URL renders the not-found component, not a blank page.

## Common mistakes

- **Framework plugin before `tanstackRouter()`.** The plugin order is silent
  when wrong — the tree still generates, but code-splitting transforms don't
  run. `tanstackRouter()` must come first.
- **Editing `routeTree.gen.ts`.** It is regenerated on every route-file change;
  edits are lost. Change route files instead.
- **Skipping the `declare module` Register block.** Without it every route type
  collapses to `AnyRouter` and `to` accepts any string — see type-safety.md.
- **Forgetting `<RouterProvider>`.** The route tree exists but nothing renders;
  the app is blank with no error.
- **Hand-writing lazy imports with `autoCodeSplitting` on.** The plugin already
  splits — see routes-and-layouts.md.
