# Navigation

**Use this file when:** linking somewhere, navigating in code, redirecting,
blocking navigation, or configuring preloading.

All navigation in TanStack Router is **type-checked**: `to` must be a real
route, `params` must satisfy that route's dynamic segments, `search` must
satisfy its `validateSearch`. A wrong link is a compile error, not a 404.

## `<Link>` — declarative navigation

```tsx
import { Link } from '@tanstack/react-router'

<Link to="/about">About</Link>

// Dynamic params — required by the route, enforced by types
<Link to="/posts/$postId" params={{ postId: '123' }}>Post 123</Link>

// Search params — validated against the target route's schema
<Link to="/posts" search={{ page: 2, filter: 'react' }}>Page 2</Link>

// Merge into existing search instead of replacing it
<Link to="." search={(prev) => ({ ...prev, page: prev.page + 1 })}>Next</Link>

// Active styling — props applied only when the link matches the current URL
<Link to="/posts" activeProps={{ className: 'font-bold' }} activeOptions={{ exact: true }}>
  Posts
</Link>

// Hash, and replace-instead-of-push
<Link to="/docs" hash="install">Install</Link>
<Link to="/posts" replace>Posts</Link>
```

Key props: `to`, `params`, `search`, `hash`, `replace`, `activeProps` /
`inactiveProps`, `activeOptions`, `preload`, `mask`, `disabled`.

## `useNavigate` — imperative navigation

For navigation triggered by logic (after a submit, in an event handler):

```tsx
import { useNavigate } from '@tanstack/react-router'

const navigate = useNavigate()
navigate({ to: '/posts/$postId', params: { postId: id } })
navigate({ to: '/posts', search: { page: 1 }, replace: true })
navigate({ to: '.', search: (prev) => ({ ...prev, page: 2 }) })  // stay, change search
```

Prefer `<Link>` for anything a user clicks — it renders a real `<a>` (right-click,
open-in-new-tab, accessibility) and participates in preloading. Reserve
`useNavigate` for navigation that is not a click target.

## `<Navigate>` — redirect during render

For a redirect decided as a component renders (e.g. an index route that should
always forward to a child), render the `<Navigate>` component:

```tsx
import { Navigate } from '@tanstack/react-router'

function DashboardIndex() {
  return <Navigate to="/dashboard/overview" replace />
}
```

`<Navigate>` is the render-time counterpart to `redirect()`. Prefer `throw
redirect(...)` in `beforeLoad`/`loader` when the decision can be made before
render — it runs earlier and avoids a flash. Reach for `<Navigate>` only when
the target depends on something known only at render time.

## Reading the router: location & state

`useLocation()` returns the current location and re-renders on every navigation:

```tsx
import { useLocation } from '@tanstack/react-router'
const { pathname, search, hash } = useLocation()
```

`useRouterState()` subscribes to the whole router state. Pass `select` to read
just the slice you need, so the component re-renders only when that slice
changes:

```tsx
import { useRouterState } from '@tanstack/react-router'
const isNavigating = useRouterState({ select: (s) => s.isLoading })
```

`useRouter()` returns the router instance for imperative calls —
`router.invalidate()`, `router.history.back()` / `.forward()`.

## `redirect` — navigate from a guard or loader

Inside `beforeLoad` or `loader`, **throw** a `redirect` — it short-circuits the
lifecycle instead of rendering:

```tsx
import { redirect } from '@tanstack/react-router'

throw redirect({
  to: '/login',
  search: { redirect: location.href },  // so you can return the user afterward
  replace: true,                        // don't leave the protected URL in history
})
```

`statusCode` controls the HTTP status under SSR (e.g. `301`). Redirect usage in
guards is covered in route-guards.md.

## Preloading — load before the click

Preloading runs a route's `loader` ahead of navigation so the page is instant.

```tsx
// Router default — applies to every Link
createRouter({ routeTree, defaultPreload: 'intent', defaultPreloadStaleTime: 0 })

// Per-link override
<Link to="/posts" preload="intent" preloadDelay={50}>Posts</Link>
<Link to="/dashboard" preload="viewport">Dashboard</Link>
<Link to="/heavy" preload={false}>Heavy</Link>
```

| Mode | Preloads when |
|---|---|
| `'intent'` | Pointer hovers / focuses the link (the usual choice) |
| `'viewport'` | The link scrolls into view |
| `'render'` | The link mounts |
| `false` | Never |

`defaultPreloadStaleTime` decides how long preloaded data stays usable before a
real visit refetches it.

## Route masking — show a different URL

Masking renders one route while the address bar shows another — e.g. a photo in
a modal at `/photos/$id`, but the URL reads `/feed`. On reload, the real route
loads.

```tsx
<Link
  to="/photos/$photoId"
  params={{ photoId: photo.id }}
  mask={{ to: '/feed' }}
>
  Open
</Link>
```

## Navigation blocking — guard unsaved work

`useBlocker` intercepts navigation away from a dirty form. `shouldBlockFn`
returns `true` to block, `false` to allow — and may be async, receiving
`{ current, next, action }` so you can block only for specific destinations.
There is **no built-in confirm dialog**; you choose how to ask the user.

```tsx
import { useBlocker } from '@tanstack/react-router'

// Simplest: shouldBlockFn itself asks — block only if the user cancels confirm()
useBlocker({
  shouldBlockFn: () => isDirty && !window.confirm('Discard unsaved changes?'),
})
```

For a custom dialog instead of `window.confirm`, pass `withResolver: true`. The
hook then returns a resolver — `status` plus `proceed`/`reset` — and your
component renders the UI:

```tsx
const { status, proceed, reset } = useBlocker({
  shouldBlockFn: () => isDirty,
  withResolver: true,
})

if (status === 'blocked') {
  return <ConfirmLeaveDialog onConfirm={proceed} onCancel={reset} />
}
```

Without `withResolver: true` the hook returns `void` — `status`/`proceed`/`reset`
do not exist, so the `confirm()` form above is the only option there.

## Common mistakes

- **`useNavigate` for a clickable element.** Use `<Link>` — a real anchor gives
  accessibility, middle-click/open-in-new-tab, and preloading.
- **Hardcoding a path string the types can't check.** `to` is type-checked
  against the route tree; let it catch typos and route renames.
- **Returning `redirect(...)` instead of throwing it.** It must be `throw`n to
  short-circuit the lifecycle.
- **Replacing search params by passing an object** when you meant to merge —
  use a `(prev) => ({ ...prev })` updater. See search-params.md.
- **Leaving a protected URL in history.** Use `replace: true` on auth redirects
  so Back doesn't return to the gated page.
