# Using repos in TanStack Router

Repositories integrate with TanStack Router via `.loader()`. This file covers the route-side pattern; the component side ([using-in-table.md](using-in-table.md)) explains how the same data flows into a table.

## Mental model

A route loader's jobs:

1. **Decide redirects** (auth, 403, 404) before the page renders.
2. **Prime the cache** for *detail* repos, so the page paints immediately with real data.
3. Optionally **prime fixed-query list repos** that a dashboard/home page needs up front.

It does **not** hand search/table data to the component. The component reads via `.useQuery()` and stays subscribed for invalidations.

## Two scoped rules (and why)

> **Don't put a URL-driven *table-search* repo in a route loader.**

A search **DataTable** renders its own `isLoading` skeleton. If you `await searchXRepository(search).loader()` in the loader, TanStack Router blocks navigation until the request finishes — defeating the skeleton and making transitions feel slow. A search/table route's loader should hold **permission gates only**.

This rule is about *table* pages. Priming a **fixed-query** list repo in a loader is fine and common — e.g. a home/dashboard page that needs `findMyReportsRepository().loader()` or `searchPendingReportsRepository({ page: 0, size: 50 }).loader()` resolved before first paint. There's no URL-driven search box there, so there's no skeleton to defeat.

> **Never use `Route.useLoaderData()` to read *repo* data.**

If you read repo data via `useLoaderData`, you bypass React Query — so `invalidate()` won't refresh the view, `keepPreviousData` won't smooth pagination, and the loader's `defaultData` fallback can freeze on screen. Repo data is always read with `.useQuery()`.

`useLoaderData` is fine for a **derived plain value** the loader computed and returned — e.g. a loader that parses a param and looks up a link, then `return { childUserId, link }`. That's not repo data; reading it back is correct.

```typescript
// ❌ WRONG — blocks navigation until table-search data loads
export const Route = createFileRoute('/app/resources/')({
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => searchResourcesRepository(deps).loader(),
});

// ✅ RIGHT — loader only gates permissions; the DataTable handles its own loading
export const Route = createFileRoute('/app/resources/')({
  validateSearch: resourceContract.searchResources.query,
  loader: () => requirePermission('view:resource'),
  component: ResourcesPage,
});

function ResourcesPage() {
  const search = Route.useSearch();
  const { data } = searchResourcesRepository(search).useQuery(); // skeleton until this resolves
}
```

## Patterns by repo type

### Search/table route — loader gates permissions only

```typescript
import { resourceContract } from '@repo/zod-schemas/src/api-contract/resource.contract';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/app/resources/')({
  validateSearch: resourceContract.searchResources.query,  // Zod v4 schema validates URL params
  loader: () => requirePermission('view:resource'),        // permission gate only, no search repo
  component: ResourcesPage,
});
```

`validateSearch` ties the URL directly to your `SearchResourcesQuery` type — one Zod v4 schema, two guarantees: URL parse + hook param.

### Detail route — loader primes the cache

```typescript
export const Route = createFileRoute('/app/districts/$districtId/')({
  loader: ({ params }) => districtDetailRepository(Number(params.districtId)).loader(),
  component: DistrictDetailPage,
});

function DistrictDetailPage() {
  const { districtId } = Route.useParams();
  const { data: district } = districtDetailRepository(Number(districtId)).useQuery();
  return <h1>{cls.name}</h1>;
}
```

### Dashboard/home route — prime fixed-query lists

```typescript
export const Route = createFileRoute('/app/home')({
  loader: () =>
    Promise.all([
      findMyReportsRepository().loader(),
      findKeyIndicatorsRepository().loader(),
    ]),
  component: HomePage,
});
```

Each component still reads via `.useQuery()` — don't store the resolved values.

### Permission/auth guard (single repo)

```typescript
export const Route = createFileRoute('/app/_layout')({
  beforeLoad: () => requirePermission('view:user'),
});
```

`requirePermission` itself uses `currentUserRepository().loader()` internally — see [creating-single.md](creating-single.md).

## Multiple loaders on one route

Loaders compose with `Promise.all`:

```typescript
loader: ({ params }) =>
  Promise.all([
    districtDetailRepository(Number(params.districtId)).loader(),
    findDistrictIndicatorsRepository(Number(params.districtId)).loader(),
  ]),
```

Don't store the resolved values — each component still reads via `.useQuery()`.

## Error behavior in loaders

The factory's `loader()` swallows non-redirect errors and returns `defaultData` (see [-factory.ts](../../../../apps/frontend/src/repositories/-factory.ts)). This is intentional:

- **Redirects** (`throw redirect(...)`) propagate — the router catches and navigates.
- **404/403 redirects** from `throw404Error()` and the explicit 403 redirect propagate the same way.
- **Plain errors** (search failures) resolve to `defaultData` so the page still renders an empty table; the error surfaces through the UI's own retry path.

If you need a hard error boundary at the route level, attach an `errorComponent` on the route — don't rethrow inside the loader.

> **Project-specific paths** — relocate when porting (see SKILL.md → Porting)
>
> | Symbol | This project's location |
> |--------|-------------------------|
> | `requirePermission` | `@/repositories/currentUser.repository` (not ported yet — from ELP-fe) |
> | `throw404Error` | `@/routes/error/404` |
> | Route prefixes | `/app/...` is the authenticated app layout (not created yet) |
