---
name: repository-pattern
description: Use when creating a repository module (the data-fetching layer), adding a route loader, invalidating a query after a mutation, mapping an API response with mapToDTO, or using createQueryRepository / createInfiniteQueryRepository. Applies to all repo types (single, detail, list-search, infinite, parameterized-list) plus AsyncSearchCombobox option sources. Not for table columns/row actions (use tanstack-table) or form fields (use zod-form).
---

# Repository Pattern

All API communication goes through **repositories** — factory-built objects that wrap React Query + ts-rest + Zod v4, with optional DTO transformation. A repository is the single layer where a network call, its cache wiring, and its response shape are defined; components never call `clientAPI` directly.

> **Portable skill.** This pattern works in any React + TanStack Router + ts-rest + React Query app. Code blocks use *this* project (DONA Province Dashboard) as the worked example. When porting to another project, the **[Porting to a new project](#porting-to-a-new-project)** section at the bottom lists the handful of project-specific things to relocate first.
>
> **Not ported yet:** `-factory.ts` and `-paging.ts` exist, but `throw404Error` / the `routes/error/*` pages, `repositories/async-search-options/`, and `AsyncSearchCombobox` still live in ELP-fe. Port `ELP-fe/apps/frontend/src/routes/error/`, `ELP-fe/apps/frontend/src/repositories/async-search-options/` (as a pattern) and `ELP-fe/apps/frontend/src/components/common/async-search-combobox.tsx` before using the parts that need them. There is no `-infinite-factory.ts` in either repo yet — write it when the first infinite list is needed.

A standard repo is created with `createQueryRepository` ([apps/frontend/src/repositories/-factory.ts](../../../apps/frontend/src/repositories/-factory.ts)) and exposes:

| Method | Purpose |
|--------|---------|
| `useQuery(overrideOptions?)` | React hook for components; accepts a partial `UseQueryOptions` (e.g. `{ enabled }`, `{ refetchInterval }`) merged over the repo's static options per call |
| `loader()` | For TanStack Router route loaders (or one-off fetches) |
| `invalidate()` | Mark this query stale → refetch |
| `updateCache(updater)` | Optimistic / partial cache write |
| `refetch()` | Force refetch and return data |
| `get()` | Read current cache value (no fetch) |
| `queryKey` | Resolved key (for advanced use) |

Infinite repos use a **different factory** (`createInfiniteQueryRepository`) with a smaller surface — see [creating-infinite.md](references/creating-infinite.md).

## When to use which repo type

Pick the type **before** writing code. The shape of `queryKey`, `defaultData`, and error handling all depend on it.

```
Need to call an API?
├── Single global value (current user, app config)?        → SINGLE         → references/creating-single.md
├── One resource by ID (detail page)?                      → DETAIL         → references/creating-detail.md
├── Paginated list / table / URL-driven search?            → LIST/SEARCH    → references/creating-list-search.md
├── List scoped to a parent ID or current user (no URL)?   → PARAMETERIZED  → references/creating-list-search.md  (Variant section)
├── Infinite scroll / load-more grid (no page numbers)?    → INFINITE       → references/creating-infinite.md
└── Options for an AsyncSearchCombobox dropdown?           → SEARCH-OPTIONS → references/async-search-options.md
                                                             (wraps a LIST repo)
```

| Type | Factory | `queryKey` shape | Params | Error behavior |
|------|---------|------------------|--------|----------------|
| Single | `createQueryRepository` | `['user']` (static) | none | `throw redirect(...)` to sign-out |
| Detail | `createQueryRepository` | `['district', 'detail', id]` | one ID or `{ id }` | `throw404Error()` (or 403 redirect, or `throw Error`) |
| List/Search | `createQueryRepository`, `searchMode: true` | `['resource', ...Object.values(formatObject(query))]` | full query object | `throw Error('...', { cause: res })` |
| Parameterized | `createQueryRepository` | `['province', 'districts', provinceId, ...Object.values(formatObject(query))]` | `{ parentId, ...query }` | `throw Error('...', { cause: res })` |
| Infinite | `createInfiniteQueryRepository` | `['publicResourceInfinite', ...Object.values(formatObject(query))]` | query object (no page) | `throw Error('...', { cause: res })` |

## Naming & file layout

All repos live in [apps/frontend/src/repositories/](../../../apps/frontend/src/repositories/). One file per repo.

| Repo type | File name | Export name | Result type |
|-----------|-----------|-------------|-------------|
| Single | `currentUser.repository.ts` | `currentUserRepository` | `CurrentUserDTO` |
| Detail | `districtDetail.repository.ts` | `districtDetailRepository` | `DistrictDetailDTO` |
| List/Search | `searchResources.repository.ts` | `searchResourcesRepository` | `SearchResourcesResult` + `SearchResourcesQuery` |
| Parameterized | `findProvinceDistricts.repository.ts` | `findProvinceDistrictsRepository` | `FindProvinceDistrictsResult` + `FindProvinceDistrictsQuery` |
| Infinite | `searchPublicResourcesInfinite.repository.ts` | `searchPublicResourcesInfiniteRepository` | reuses the list repo's item DTO |
| Async-search options | `async-search-options/resource-search-options.ts` | `resourceSearchOptionsFn` + `generateResourceKey` | — |

Conventions (preferred — **check the existing directory before creating**, naming is not 100% uniform):
- camelCase for files; PascalCase for exported types.
- `search*` for URL/table-driven lists; `find*` for parent-scoped or "my…" lists; `list*` for small fixed lists.
- List, parameterized, and infinite repos export an `invalidateAll{Verb}{Resource}Queries` helper (see [invalidation.md](references/invalidation.md)).
- A detail repo and its matching list repo should share the **same root segment** (`'district'`, `'resource'`, …) — see invalidation.md for when that lets one helper cover both.

## The universal recipe

Every **`createQueryRepository`** repo follows the same skeleton — only the call and the DTO change. (Infinite repos use a different factory — see [creating-infinite.md](references/creating-infinite.md), do **not** use this recipe for them.)

```typescript
// 1. Extract types from the ts-rest contract.
//    `responseData` is the FULL 200 response. This project's backend wraps the
//    payload in a `{ data }` envelope, so the payload is at ['responseData']['data'].
//    A backend without that envelope: use ['responseData'] directly. (See Porting.)
type ApiContract = ExtractApiContract<typeof xContract.endpoint>;
type ResponseData = ApiContract['responseData']['data'];
// (search/parameterized repos also: export type SearchXQuery = ApiContract['query'];)

// 2. mapToDTO — the single source of truth for transformations.
const mapToDTO = (data: ResponseData) => ({ ...data /* + computed fields */ });
export type XDTO = ReturnType<typeof mapToDTO>;

// 3. defaultData — fallback for loader-catch + initial render.
//    Search/parameterized repos: use defaultPagedResult<XDTO>() (it includes `hasNext`).
const defaultData: XDTO = { /* sensible empties — compiler-checked */ };

// 4. createQueryRepository
export const xRepository = createQueryRepository<XDTO, ParamType>({
  queryKey: (params) => [...],
  queryFn: async (params) => {
    const res = await clientAPI.X.endpoint({ /* params/body/query */ });
    // `res.data` here is ts-rest's response body = ['responseData'] above.
    // This project's body is `{ data: payload }`, so pass `res.data` to a
    // mapToDTO typed on ['data']. Always branch on `res.success`, never `res.status`.
    if (res.success) return mapToDTO(res.data);
    /* type-specific error handling — see the per-type reference */
  },
  defaultData,
  // searchMode: true,  // for list/search/parameterized only — enables keepPreviousData
});

// 5. (list/parameterized only) Export an invalidate-all helper
export const invalidateAllSearchXQueries = () =>
  queryClient.invalidateQueries({ queryKey: ['x'] });
```

## Critical rules

- **Always branch on `res.success`**, never `res.status`. ([api-response-handling.md](references/api-response-handling.md))
- **Unwrap the response envelope in the type, once.** `ResponseData = ApiContract['responseData']['data']` in *this* project (Java `{ data }` envelope). The DTO type then flows from `mapToDTO` to every consumer.
- **`mapToDTO` is the only transformation point.** Don't reshape data in components — push it into `mapToDTO`. ([map-dto.md](references/map-dto.md))
- **Never use `Route.useLoaderData()` to read repo data** — it bypasses React Query, so `invalidate()` won't refresh the view and `keepPreviousData` won't smooth pagination. The loader primes the cache / decides redirects; the component reads with `.useQuery()`. (Reading a *derived plain value* the loader returns — e.g. `{ childId, link }` — is fine.) See [using-in-router.md](references/using-in-router.md).
- **Don't put a URL-driven table-search repo in a route loader** — the DataTable renders its own skeleton; blocking navigation on it defeats that. (Priming a *fixed-query* dashboard/home repo in a loader is fine.) See using-in-router.md.
- **Detail repos**: guard a falsy ID with `if (!id) return defaultData`; use `throw404Error()` (not a bare `throw Error()`) when the resource is missing.
- **List/Search repos**: set `searchMode: true`; spread `Object.values(formatObject(query))` into the key so each filter combo gets its own cache entry.
- **List/Search `mapToDTO` must use `mapPaging`** ([-paging.ts](../../../apps/frontend/src/repositories/-paging.ts)) — never spread the backend envelope (`{ items, ...rest }`). Rename backend fields (`page → pageIndex`, `totalElements → total`, …) at the `mapPaging` call site so the DTO shape is identical regardless of the API.
- **`defaultData` for search/parameterized repos is `defaultPagedResult<XDTO>()`** — it supplies the required `hasNext` field that a hand-written `{ pageIndex, pageSize, total, items }` object would miss (a compile error).
- **Nullable fields**: if the backend returns `null`, the Zod v4 schema must use `.nullable()` — match the contract exactly.

## Per-call query options — `useQuery(overrideOptions?)`

`useQuery()` accepts a partial `UseQueryOptions` that the factory merges **over** the repo's static `queryOptions`, per call. This is the seam for the two things a component knows but the repo definition can't: whether to fetch at all, and how often to re-fetch. Reach for `queryOptions` (at repo-creation time) only for options that are the same for every consumer (`staleTime`, …); reach for the per-call override for anything that varies by where the hook is mounted.

### Conditional fetching — `{ enabled }`

When `enabled` is `false` the query never runs and `data` falls back to `defaultData` — no request, no error. Use it to skip a call that is guaranteed to fail or be pointless — a missing parent ID, or an endpoint the current user has no business hitting (e.g. an owner-based "my…" route, re-issued by an always-mounted shell component on every navigation). **Gate on real state or permissions**, not on `currentUser.roles` (roles are display-only — see [.claude/rules/permission-check.md](../../rules/permission-check.md)).

```tsx
const { data } = findProvinceDistrictsRepository({ provinceId, page: 0, size: 50 })
  .useQuery({ enabled: provinceId != null });
```

### Polling — `{ refetchInterval }`

When a list mirrors server state that changes on its own (a job queue, a report-generation pipeline, a live feed), poll with a **functional** `refetchInterval` so the decision reads the freshest data each cycle. The invariant that keeps this cheap and correct: **poll only while there is unfinished work, and return `false` the moment everything settles** — an always-on interval is a battery/quota leak and the most common way this goes wrong.

```tsx
const { data } = searchJobsRepository(search).useQuery({
  // re-runs with live query state every cycle; stops itself when nothing is pending
  refetchInterval: (query) =>
    query.state.data?.items?.some((j) => j.status === 'RUNNING') ? 3000 : false,
});
```

A functional interval is the clean way to express "poll until done" because it stays correct without a `useEffect`/`setInterval` (which would close over stale data and need a ref to stop). For how a polling list should *render* without flickering on each cycle, see the background-fetch note in [tanstack-table → table-kit.md](../tanstack-table/references/table-kit.md).

## Reference index

Pick the references that match your task. Most tasks need 2–3.

- [creating-single.md](references/creating-single.md) — Static-key repos (currentUser-style).
- [creating-detail.md](references/creating-detail.md) — One-ID repos with 404/403 handling.
- [creating-list-search.md](references/creating-list-search.md) — Paginated search repos + the parameterized-list variant.
- [creating-infinite.md](references/creating-infinite.md) — Infinite-scroll repos via `createInfiniteQueryRepository`.
- [map-dto.md](references/map-dto.md) — DTO patterns: computed fields, sorting, derived sets, flattening.
- [using-in-router.md](references/using-in-router.md) — Route loaders, `validateSearch`, redirect rules.
- [using-in-table.md](references/using-in-table.md) — Wiring a search repo to TanStack Table.
- [async-search-options.md](references/async-search-options.md) — Wrapping a search repo for `AsyncSearchCombobox`.
- [invalidation.md](references/invalidation.md) — `invalidate()` vs `invalidateAll*Queries()`, queryKey hierarchy.
- [api-response-handling.md](references/api-response-handling.md) — `res.success`, error shape, envelope.
- **[Porting to a new project](#porting-to-a-new-project)** (below) — the project-specific symbols to relocate when reusing this skill elsewhere.

## Checklist

For a standard **`createQueryRepository`** repo (single / detail / list-search / parameterized). For **infinite** repos use the checklist in [creating-infinite.md](references/creating-infinite.md) instead.

- [ ] Picked the right type and used the matching reference's template.
- [ ] Types come from `ExtractApiContract<typeof xContract.endpoint>` — no hand-typed shapes.
- [ ] `ResponseData` unwraps the envelope (`['responseData']['data']` in this project).
- [ ] `mapToDTO` defined; DTO type exported via `ReturnType<typeof mapToDTO>`.
- [ ] `defaultData` matches the DTO shape exactly (compiler-checked).
- [ ] Branched on `res.success` (not `res.status`).
- [ ] Detail: guard `if (!id) return defaultData`; use `throw404Error()` for a missing resource.
- [ ] List/Search/Parameterized: `searchMode: true`; `Object.values(formatObject(query))` spread into the key.
- [ ] List/Search/Parameterized `mapToDTO` uses `mapPaging` — no manual envelope mapping, no spread.
- [ ] `defaultData` for search/parameterized is `defaultPagedResult<XDTO>()`.
- [ ] List/Search/Parameterized exports `invalidateAll{Verb}{Resource}Queries` (a parameterized repo may take an optional scope param).
- [ ] Route uses `loader: ({ params }) => repo(...).loader()` for *detail* repos only; a search/table route's loader holds permission gates, not the search repo. Components read with `.useQuery()` — never `Route.useLoaderData()`.
- [ ] After CRUD success → call `invalidateAll{Verb}{Resource}Queries()` (and the detail repo's `invalidate()` if its key root differs).

## Porting to a new project

This skill is reusable in any React + TanStack Router + ts-rest + React Query project. Before copying templates into a new project, locate that project's equivalent of each symbol below — the *pattern* is identical, only these bindings change.

| Project-specific symbol | This project (DONA Province Dashboard) | What it is / how to relocate |
|-------------------------|----------------------------|------------------------------|
| Response envelope depth | `ApiContract['responseData']['data']` | The Java backend wraps every payload in `{ data }`. Inspect what `ExtractApiContract<…>['responseData']` resolves to: if it's already the payload, drop `['data']`. |
| API client | `clientAPI` from `@/config/clientAPI.config` | The ts-rest client instance. |
| `ExtractApiContract` | `@/@type/helper` | Helper that extracts `responseData` / `query` / `body` / `pathParams` from a ts-rest route. |
| Repo factories | `createQueryRepository`, `createInfiniteQueryRepository` from `@/repositories/-factory` & `-infinite-factory` | Copy these two files; they are project-agnostic. (`-infinite-factory.ts` does not exist yet.) |
| Paging normalizer | `mapPaging`, `defaultPagedResult`, `PagedResult` from `@/repositories/-paging` | Maps a raw page envelope → a canonical `{ pageIndex, pageSize, total, hasNext, items }`. Copy the file or write the equivalent. |
| Error-route handlers | `throw404Error` (`@/routes/error/404`), `throw503Error`, `throwLockedError`, plus redirects to `/error/403` and `/auth/sign-out` (not ported yet — see note at top) | Each throws a `redirect` to that project's error/auth route. Replace the route paths with your own. |
| Query-key normalizer | `formatObject` from `@repo/shared/src/common/object.helper` | Drops `undefined` and sorts keys so equivalent queries share a cache entry. |
| Async dropdown component | `AsyncSearchCombobox` from `@/components/common/async-search-combobox` | The standard async-select; its `onSearch` is what `*-search-options.ts` files feed. |

The portable core that does **not** change: the 5-step recipe, the repo-type taxonomy, `mapToDTO` as the single transform point, the queryKey-prefix invalidation model, and the loader-vs-component reading rule.
