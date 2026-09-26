# Route Guards & Status UI

**Use this file when:** protecting a route (auth/permission), handling
not-found, or wiring error and pending UI.

Guards and status components all answer the same question — *what renders when
the happy path doesn't apply* — so they live together. The lifecycle order
(validateSearch → beforeLoad → loader → component) decides which tool to reach
for.

## `beforeLoad` — the guard hook

`beforeLoad` runs **before** `loader`, **parent → child**. It is the place for
access decisions: it can redirect away before any data loads or any component
mounts, so the user never sees a flash of protected content.

```tsx
export const Route = createFileRoute('/dashboard')({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
        replace: true,
      })
    }
  },
})
```

`beforeLoad` can also **return a partial context object**, which is merged into
the context seen by this route's `loader` and all descendants — a typed way to
pass a verified value (e.g. the loaded user) down the tree:

```tsx
beforeLoad: async ({ context }) => {
  const user = await context.auth.getUser()
  return { user }            // descendants get context.user, fully typed
}
```

## The authenticated pathless layout

Don't repeat the guard on every page. Put it once on a **pathless layout**
(`_authed.tsx` — see routes-and-layouts.md) and nest protected routes under it.
`beforeLoad` runs parent-first, so every child is gated by the one check.

```tsx
// routes/_authed.tsx — guards everything under it, adds no URL segment
export const Route = createFileRoute('/_authed')({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
  },
})

// routes/_authed/dashboard.tsx — reachable only when authenticated
export const Route = createFileRoute('/_authed/dashboard')({
  component: Dashboard,
})
```

**Parent guards run first — always.** A child route with no `beforeLoad` is
still gated by its ancestors. When a route 403s unexpectedly, check every
ancestor's `beforeLoad`/`loader`, not just the leaf.

## `notFound()` — the route exists, the resource doesn't

When a route matches but its data is missing (a deleted post), **throw
`notFound()`** from the loader. It renders the nearest `notFoundComponent`
instead of crashing or rendering a half-empty page.

```tsx
import { notFound } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    const post = await fetchPost(params.postId)
    if (!post) throw notFound()
    return post
  },
  notFoundComponent: () => <p>Post not found</p>,
})
```

Throwing `notFound()` beats `if (!post) return <NotFound />` in the component:
it routes through the framework (correct status code under SSR, nearest
boundary, no partial render).

## Status components — error & pending UI

A route can declare what renders during each non-happy state. Set sensible
global defaults on `createRouter` (`defaultErrorComponent`,
`defaultPendingComponent`, `defaultNotFoundComponent`); override per route only
when that route genuinely needs different UI.

| Option | Renders when |
|---|---|
| `pendingComponent` | The route's loaders are still running |
| `errorComponent` | The loader/beforeLoad threw a non-redirect, non-notFound error |
| `notFoundComponent` | `notFound()` was thrown (or a child wasn't matched) |

```tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: ({ params }) => fetchPost(params.postId),
  pendingComponent: () => <PostSkeleton />,
  errorComponent: ({ error, reset }) => (
    <ErrorBox message={error.message} onRetry={reset} />
  ),
})
```

`pendingMs` delays the pending component so fast loads don't flash a spinner;
`pendingMinMs` keeps it visible long enough to avoid a flicker once shown.

## Choosing the right tool

| Situation | Use |
|---|---|
| User may not access this route at all | `beforeLoad` + `throw redirect()` |
| Route is fine, but the specific resource is missing | `throw notFound()` in `loader` |
| Loader failed (network, server error) | `errorComponent` |
| Loader is still running | `pendingComponent` |
| Need to pass a verified value to children | `beforeLoad` returns partial context |

## Common mistakes

- **Guarding in the component with `if (!user) return <Redirect/>`.** The
  component already mounted — protected content flashes first. Guard in
  `beforeLoad`.
- **Putting the auth check in `loader`.** `loader` runs after every `beforeLoad`
  and exists for data, not access decisions. Guards belong in `beforeLoad` so
  they run first — before any loader, parent or child, starts fetching.
- **Repeating the same guard on every page.** Hoist it to a pathless layout.
- **`return`ing a redirect/notFound.** They must be `throw`n.
- **Rendering "not found" with a component `if`** instead of `throw notFound()`
  — you lose the status code and the framework boundary.
- **Debugging a 403 by only inspecting the leaf route.** Parent `beforeLoad`
  runs first; check the whole ancestor chain.
