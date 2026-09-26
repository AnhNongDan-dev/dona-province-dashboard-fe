# Data Loading

**Use this file when:** writing a route `loader`, priming a cache, integrating
TanStack Query, deferring slow data, or controlling when a loader re-runs.

A `loader` runs **before** the route's component renders. That is the point: the
page paints with data already in hand, navigation is cancellable, and the result
feeds preloading. Fetching in a `useEffect` instead gives up all of that.

## A basic loader

```tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    return fetchPost(params.postId)   // whatever this returns IS the loader data
  },
  component: PostComponent,
})

function PostComponent() {
  const post = Route.useLoaderData()  // typed to the loader's return
  return <h1>{post.title}</h1>
}
```

The loader receives `{ params, deps, context, abortController, location,
route }`. Loaders run **parent → child**; sibling routes' loaders run in
parallel.

## `loaderDeps` — when the loader depends on search params

`params` are always available to a loader. **Search params are not** — a loader
only re-runs for search changes you explicitly declare in `loaderDeps`. This is
the single most common loader bug: read a search value without declaring it, and
the loader serves stale data when only the search changes.

```tsx
export const Route = createFileRoute('/posts')({
  validateSearch: z.object({ page: z.number().default(1) }),
  loaderDeps: ({ search }) => ({ page: search.page }),   // declare the dependency
  loader: async ({ deps }) => fetchPosts({ page: deps.page }),
})
```

Rule: **every search field the loader reads must be returned from `loaderDeps`.**
Conversely, search fields the loader ignores (e.g. a UI-only `tab`) should stay
*out* of `loaderDeps` so they don't trigger needless refetches.

## Router context — dependency injection

`context` is a typed object threaded into every `beforeLoad` and `loader`. It is
how you inject shared dependencies (a query client, an auth object) instead of
importing singletons.

```tsx
// root route declares the context shape
export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({ component: RootLayout })

// provided at createRouter / RouterProvider
const router = createRouter({ routeTree, context: { queryClient } })

// any route reads it, fully typed
export const Route = createFileRoute('/posts')({
  loader: ({ context }) => context.queryClient.ensureQueryData(postsQuery),
})
```

`beforeLoad` can also *extend* context for descendants by returning a partial
object — see route-guards.md. (Many projects skip router context and import
their query client / data layer directly; both work — match the project.)

## Integrating with a query cache (e.g. TanStack Query)

*Optional — applies only if the project uses a query-caching library. Without
one, the plain loader above is the whole story: it returns data, the component
reads it with `useLoaderData()`.*

When a project pairs the router with a query cache (TanStack Query is the
common choice), the loader's job shifts: it **primes the cache** rather than
returning the data, and the component reads through the query hook. The loader
and the component must then share **one** query definition so they don't fetch
twice or diverge.

```tsx
import { queryOptions } from '@tanstack/react-query'

const postsQuery = queryOptions({ queryKey: ['posts'], queryFn: fetchPosts })

export const Route = createFileRoute('/posts')({
  // ensureQueryData: fetch only if not already cached/fresh
  loader: ({ context }) => context.queryClient.ensureQueryData(postsQuery),
  component: PostsComponent,
})

function PostsComponent() {
  const { data } = useSuspenseQuery(postsQuery)  // same options → reads the primed cache
  return <PostList posts={data} />
}
```

`ensureQueryData` respects the query's `staleTime` and won't refetch fresh data.
The component reads through `useQuery`/`useSuspenseQuery` so it stays subscribed
to cache updates and invalidations.

**Do not read primed-only data via `useLoaderData()`.** If the loader's job is
just to prime the query cache, the component must read it back through the query
hook — otherwise it bypasses the query cache and won't react to invalidation.
Use `useLoaderData()` only when the loader's *return value* is the data you want.

## Deferred data — stream slow data without blocking

Await critical data; **return the slow promise un-awaited**. The route renders
as soon as the awaited data resolves; the component resolves the rest with
`<Await>`.

```tsx
import { Await, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    const slowComments = fetchComments(params.postId)  // NOT awaited
    const post = await fetchPost(params.postId)        // awaited — critical
    return { post, slowComments }
  },
  component: PostComponent,
})

function PostComponent() {
  const { post, slowComments } = Route.useLoaderData()
  return (
    <>
      <h1>{post.title}</h1>
      <Await promise={slowComments} fallback={<CommentsSkeleton />}>
        {(comments) => <CommentList comments={comments} />}
      </Await>
    </>
  )
}
```

`<Await>` suspends until the promise settles, then calls its render-prop child
with the resolved value. Two things to know:

- **It always renders inside a Suspense boundary.** Pass `<Await>` a `fallback`
  prop and it wraps itself in its own `<Suspense fallback={…}>` — the example
  above is self-sufficient, no outer `<Suspense>` needed. Omit `fallback` and it
  renders bare, so a `<Suspense>` ancestor is then required, or it throws.
- **On rejection it throws the error**, caught by the nearest error boundary /
  `errorComponent`.

Returning a raw un-awaited promise is the current pattern; the older `defer()`
wrapper still works but is no longer required.

## Freshness & re-running

| Option | Effect |
|---|---|
| `staleTime` | How long loader data is considered fresh — re-navigating within it skips the loader |
| `preloadStaleTime` | Same, for preloaded (not yet visited) data |
| `gcTime` | How long unused loader data is kept before garbage collection |
| `shouldReload` | Function/boolean for fine-grained "should the loader re-run" control |

To force a reload imperatively: `router.invalidate()` re-runs loaders for the
matched routes (e.g. after a mutation that the loader's data depends on).

## Common mistakes

- **Reading a search value in the loader without adding it to `loaderDeps`.**
  The loader keeps stale data when only that search value changes.
- **Fetching in `useEffect` instead of the loader.** Loses cancellation,
  preloading, and the pre-render guarantee.
- **Loader and component using different query keys / fetch calls.** Causes a
  double fetch and lets the two views drift apart.
- **Reading query-primed data with `useLoaderData()`.** It bypasses the query
  cache — invalidation won't update the view. Read it via the query hook.
- **Awaiting a slow, non-critical request.** It blocks the whole render. Defer
  it with an un-awaited promise + `<Await>`.
