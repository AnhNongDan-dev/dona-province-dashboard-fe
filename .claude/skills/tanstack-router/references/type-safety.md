# Type Safety

**Use this file when:** the Register augmentation is missing or wrong, you need
typed router hooks from a non-route file, or you are typing a helper/component
that accepts route paths, search, params, or navigation options.

TanStack Router's type safety is not automatic — it hangs on **one**
registration step. Get that right and `to`, `params`, `search`, loader data,
and context are all inferred from the actual route tree. Miss it and everything
silently degrades to `AnyRouter` (every `to` accepts any string).

## 1. Register the router — the keystone

```tsx
// where createRouter is called (e.g. src/main.tsx)
const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
```

This makes `RegisteredRouter` resolve to *your* router everywhere. Do it once.
If autocomplete on `<Link to="...">` shows nothing, this is almost always why.

> Always import router types/values from `@tanstack/react-router`, never from
> `@tanstack/router-core`. The React package re-exports everything and ensures
> the augmentation is applied.

## 2. Typed hooks inside a route file

In the route file, `Route` is the typed accessor — no generics needed:

```tsx
const { postId } = Route.useParams()      // typed path params
const { page } = Route.useSearch()        // typed from validateSearch
const data = Route.useLoaderData()         // typed from the loader return
const { auth } = Route.useRouteContext()   // typed router context
const navigate = Route.useNavigate()
```

## 3. Typed hooks outside the route file — `getRouteApi`

A split-out component (e.g. in a `-components/` folder) doesn't import `Route`.
Use `getRouteApi(routeId)` for the same typed hooks without the import:

```tsx
import { getRouteApi } from '@tanstack/react-router'

const route = getRouteApi('/posts/$postId')

function PostHeader() {
  const { postId } = route.useParams()       // typed
  const post = route.useLoaderData()          // typed
}
```

Equivalently, the standalone hooks accept a `from` (the route id):

```tsx
import { useSearch, useParams } from '@tanstack/react-router'
const { page } = useSearch({ from: '/posts' })
const { postId } = useParams({ from: '/posts/$postId' })
```

Use `from` when the component is always rendered under one known route. For a
component rendered under *many* routes, pass `strict: false` and the hook
returns a widened, partial shape instead.

## 4. Typing helpers that take route info

When a util or shared component accepts navigation targets, derive the type
from `RegisteredRouter` so it stays correct as routes change — never hardcode a
string-literal union.

| Type | Purpose |
|---|---|
| `RegisteredRouter` | Your registered router — the generic argument for the rest |
| `NavigateOptions<RegisteredRouter>` | Full options object for `navigate()` / `<Navigate>` |
| `LinkOptions<RegisteredRouter>` | Typed link config — what `linkOptions()` returns; spreadable into `<Link>` |
| `ToPathOption<RegisteredRouter, string>` | Union of every valid `to` path |
| `RouteIds<RegisteredRouter>` | Union of every route id |
| `UseNavigateResult<string>` | Return type of `useNavigate()` |

```tsx
import type { NavigateOptions, RegisteredRouter } from '@tanstack/react-router'

// A helper that forwards navigation — typed against the real route tree
function goTo(options: NavigateOptions<RegisteredRouter>) {
  router.navigate(options)
}
goTo({ to: '/posts/$postId', params: { postId: '1' } })  // autocompleted & checked
```

For reusable, typed link configs, `linkOptions()` validates an options object
up front so it can be spread into multiple `<Link>`s:

```tsx
import { linkOptions } from '@tanstack/react-router'
const postsLink = linkOptions({ to: '/posts', search: { page: 1 } })
<Link {...postsLink}>Posts</Link>
```

### Two applied patterns worth copying

**Typed nav config** — give a nav-item type a `LinkOptions<RegisteredRouter>` field so
every destination in a nav array is checked against the real route tree (a renamed route
breaks the build at the config, not at runtime):

```ts
import type { LinkOptions, RegisteredRouter } from '@tanstack/react-router'

export type NavItem = {
  label: string
  link: LinkOptions<RegisteredRouter>   // { to, params, search, ... } — all type-checked
  permission?: Permission
}

const items: NavItem[] = [
  { label: 'Chỉ tiêu', link: { to: '/app/indicators' } },               // ✅
  { label: 'Sai',      link: { to: '/app/indicatorz' } },               // ❌ compile error
]
```

**A stable `RouteId` alias** — when you need the route-id union as a map key (page titles,
permission maps, analytics), alias it once from the generated tree rather than hand-writing
it. It then tracks the route tree automatically:

```ts
// src/@type/tanstack-route.d.ts
import type { FileRouteTypes } from '@/routeTree.gen'
export type RouteId = FileRouteTypes['id']   // every route id, kept in sync by codegen
```

(`FileRouteTypes['to']` is the generated path union — equivalent to
`ToPathOption<RegisteredRouter, string>`; either is fine as a project-local alias.)

## Common mistakes

- **Missing the `declare module` Register block.** Everything degrades to
  `AnyRouter`; `to` accepts any string and nothing autocompletes.
- **Importing from `@tanstack/router-core`.** Use `@tanstack/react-router`.
- **Hardcoding route unions** like `type Path = '/a' | '/b'`. Use
  `ToPathOption<RegisteredRouter>` so renamed/removed routes break the build.
- **Dropping the `<RegisteredRouter>` generic** on `NavigateOptions` /
  `LinkProps`. Without it the type widens to `AnyRouter` and you lose
  route-specific checking.
- **Using a standalone hook without `from`** in a component tied to one route —
  pass `from` for the precise type (or `strict: false` if it is shared).
