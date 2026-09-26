# Routes & Layouts

**Use this file when:** adding or editing a route, building a layout, naming a
route file, adding a dynamic/splat param, or splitting route code.

A route is one node in the tree. The file's **path** decides the URL; the file's
**exports** decide behavior. This file covers shape and structure; what goes
*inside* loader/beforeLoad/validateSearch lives in the other references.

## Anatomy of a route file

```tsx
// src/routes/posts/$postId.tsx  →  /posts/:postId
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  component: PostComponent,
  // loader, beforeLoad, validateSearch, loaderDeps, errorComponent,
  // pendingComponent, notFoundComponent, head, params — all optional.
})

function PostComponent() {
  const { postId } = Route.useParams()   // typed: { postId: string }
  return <h1>Post {postId}</h1>
}
```

The path string in `createFileRoute('...')` is kept in sync with the file path
by the plugin — if they disagree, the plugin rewrites the string. The exported
const must be named `Route`.

`Route` is also the typed accessor for this route: `Route.useParams()`,
`Route.useSearch()`, `Route.useLoaderData()`, `Route.useNavigate()`. To use
those typed hooks from a *different* file (e.g. a split-out component), use
`getRouteApi('/posts/$postId')` — see type-safety.md.

## File naming → URL

The router builds the tree from file names. Two equivalent styles, mixable:

| File | URL | Notes |
|---|---|---|
| `index.tsx` | `/` | Index of its folder |
| `about.tsx` | `/about` | Static segment |
| `posts/index.tsx` | `/posts` | Index of `/posts` |
| `posts/$postId.tsx` | `/posts/:postId` | `$` = dynamic param |
| `posts.$postId.tsx` | `/posts/:postId` | Dot notation = same thing, flat file |
| `posts.$postId.edit.tsx` | `/posts/:postId/edit` | Deeper, still flat |
| `files/$.tsx` | `/files/*` | `$` alone = splat / catch-all |

**Folder style vs dot style** produce the same URLs — pick one per area for
consistency. Folders scale better when a route grows children and colocated
files; flat dot-files are lighter for leaf routes.

## Layout routes — sharing a shell

A layout renders a persistent shell (nav, sidebar) and an `<Outlet />` where the
matched child renders. There are three kinds; they differ in whether they add a
URL segment and whether they wrap a *folder*.

### `route.tsx` — layout for a folder that IS a URL segment

```tsx
// src/routes/posts/route.tsx  →  layout for everything under /posts
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({
  component: () => (
    <PostsShell>
      <Outlet />   {/* posts/index.tsx, posts/$postId.tsx, ... render here */}
    </PostsShell>
  ),
})
```

`posts/route.tsx` owns the `/posts` segment *and* wraps every child. Put the
`/posts` `loader`/`beforeLoad` here so it runs once for the whole subtree.

### `_pathless.tsx` — layout that adds NO URL segment

A file prefixed `_` is a **pathless layout**: it groups routes under a shared
shell without contributing a path segment.

```
routes/
  _authed.tsx          → layout, no URL segment
  _authed/dashboard.tsx → /dashboard   (wrapped by _authed)
  _authed/settings.tsx  → /settings    (wrapped by _authed)
```

This is the canonical place for an auth gate — see route-guards.md.

### `(group)` — organize files, NO layout, NO URL segment

A folder in parentheses groups files for organization only — no shared
component, no path segment. `routes/(marketing)/about.tsx` is still `/about`.

### Escaping layout nesting — the `_` suffix

A trailing underscore on a segment opts a route *out* of a parent layout while
keeping the URL. `posts_.$postId.tsx` is still `/posts/:postId` but is NOT
wrapped by `posts/route.tsx` — useful for a full-screen detail view that should
not inherit the list shell.

## Dynamic params

`$paramName` in a file becomes a typed path param, read with `useParams()`:

```tsx
export const Route = createFileRoute('/posts/$postId')({
  component: () => {
    const { postId } = Route.useParams()  // string
    // ...
  },
})
```

Params arrive as **strings**. Coerce where you use them (`Number(postId)`), or
centralize coercion with the `params` option:

```tsx
export const Route = createFileRoute('/posts/$postId')({
  params: {
    parse: (raw) => ({ postId: Number(raw.postId) }),   // string → number
    stringify: (p) => ({ postId: String(p.postId) }),   // number → string for URLs
  },
})
```

## Splitting route code

With `autoCodeSplitting: true` (see project-setup.md) you do **nothing special**
— write a normal route file and the plugin emits the component as its own chunk.

Only when the bundler plugin is unavailable, split manually with a `.lazy.tsx`
file: keep critical config (`loader`, `beforeLoad`, `validateSearch`) in
`posts.tsx`, and move the component into `posts.lazy.tsx`:

```tsx
// posts.lazy.tsx
import { createLazyFileRoute } from '@tanstack/react-router'
export const Route = createLazyFileRoute('/posts')({ component: PostsComponent })
```

`createLazyFileRoute` only accepts the non-critical, non-blocking options
(`component`, `pendingComponent`, `errorComponent`, `notFoundComponent`).

## Page `<head>` & meta

A route sets its document title and meta/link tags with the `head` option. It
returns `{ meta, links, scripts }`; `head` receives `{ params, loaderData, ... }`
so the title can depend on loaded data.

```tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: ({ params }) => fetchPost(params.postId),
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData.title },
      { name: 'description', content: loaderData.excerpt },
    ],
  }),
})
```

The tags only render if `<HeadContent />` (from `@tanstack/react-router`) is
mounted — put it in the root route's component, inside `<head>`. Without it,
`head` is computed but nothing is injected.

## Common mistakes

- **Naming the export anything but `Route`.** The plugin and `getRouteApi` rely
  on it.
- **Expecting a `_pathless` layout to add a URL segment.** It never does — that
  is its whole purpose. Use `route.tsx` when you *want* the segment.
- **Forgetting `<Outlet />` in a layout component.** Children silently don't
  render — the layout shows but the page is blank.
- **Treating params as numbers.** They are strings until you coerce them.
