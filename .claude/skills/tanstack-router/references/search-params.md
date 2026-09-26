# Search Params

**Use this file when:** validating `?query` params, reading search state in a
component, or updating the URL's search params.

TanStack Router treats search params as **typed, validated state** — not loose
strings. The URL is the source of truth for things like the current page,
filters, sort, and tab. `validateSearch` is the gate every search param passes
through; everything downstream (`useSearch`, `<Link search>`, `loaderDeps`) is
typed from it.

## Validate with a schema

`validateSearch` takes the raw search object and returns the typed, validated
one. A Zod schema is the cleanest form — it parses, defaults, and rejects junk
in one place:

```tsx
import { z } from 'zod'

const postsSearch = z.object({
  // z.coerce — the URL gives strings; coerce "2" → 2. See the note below.
  page: z.coerce.number().int().min(1).catch(1),
  filter: z.string().default(''),
  sort: z.enum(['date', 'title']).default('date'),
})

export const Route = createFileRoute('/posts')({
  validateSearch: postsSearch,
  component: PostsComponent,
})
```

A plain function works too — `validateSearch: (raw) => ({ page: Number(raw.page ?? 1) })`
— but a schema gives you defaults and error handling for free.

**Coerce, because the URL is strings.** `?page=2` arrives as `"2"`. Either use
`z.coerce.number()`, or accept that a number schema will reject the string.
`.catch(...)` is useful to fall back instead of throwing on a malformed param:
`z.coerce.number().int().min(1).catch(1)`.

## Read search params

```tsx
function PostsComponent() {
  const { page, filter, sort } = Route.useSearch()  // typed from validateSearch
}
```

From a component that does not import `Route`, use the standalone hook with a
`from` (the route id) — see type-safety.md:

```tsx
import { useSearch } from '@tanstack/react-router'
const { page } = useSearch({ from: '/posts' })
```

## Update search params

Search params are URL state — never mutate them directly. Change them by
navigating, via `<Link>` or `navigate()`. Pass a **function updater** to keep
the other params intact:

```tsx
// Link — declarative
<Link to="/posts" search={(prev) => ({ ...prev, page: prev.page + 1 })}>
  Next
</Link>

// navigate — imperative
const navigate = useNavigate()
navigate({ to: '.', search: (prev) => ({ ...prev, sort: 'title' }) })
```

- `to: '.'` navigates within the current route — handy for "update one filter".
- Use `replace: true` for changes that should not stack browser history (typing
  in a filter, paging) so the back button doesn't replay every keystroke.
- An **object** for `search` *replaces* all params; a **function** *merges*.
  Prefer the function when you mean to change a subset.

## Couple search to the loader

If a route's `loader` reads a search value, that value must be returned from
`loaderDeps` or the loader won't re-run when it changes. This is the seam
between this file and data-loading.md — see "loaderDeps" there.

```tsx
export const Route = createFileRoute('/posts')({
  validateSearch: postsSearch,
  loaderDeps: ({ search }) => ({ page: search.page, filter: search.filter }),
  loader: ({ deps }) => fetchPosts(deps),
})
```

## Search middlewares — cross-route param behavior

`search.middlewares` shape the search object on every navigation *into* a route.
Two built-ins cover the common needs:

```tsx
import { retainSearchParams, stripSearchParams } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({
  validateSearch: postsSearch,
  search: {
    middlewares: [
      retainSearchParams(['filter']),      // keep `filter` across navigations
      stripSearchParams({ page: 1 }),      // drop `page` from the URL when it equals its default
    ],
  },
})
```

`retainSearchParams` carries a param forward so a link that omits it doesn't
lose it; `stripSearchParams` keeps the URL clean by removing params sitting at
their default value.

## Common mistakes

- **No `validateSearch`.** Search params are then untyped `unknown`; `useSearch`
  and `<Link search>` lose all type safety.
- **Forgetting to coerce.** Numbers and booleans arrive as strings — validate
  with `z.coerce.*` or the schema rejects valid-looking URLs.
- **Replacing search with an object when you meant to merge.** An object form
  drops every param you didn't list. Use `(prev) => ({ ...prev, ... })`.
- **Mutating search outside navigation.** Search lives in the URL — change it
  only through `<Link>` / `navigate()`.
- **Reading search in a loader without `loaderDeps`.** See data-loading.md.
