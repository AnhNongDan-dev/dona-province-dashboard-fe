# Creating a List/Search repo (paginated)

For endpoints that return a **paginated list** with filters and sorting — the backbone of every TanStack Table page. The **Variant** section at the end covers parent-scoped lists that aren't URL-driven.

**References**: none in this repo yet — the first repo of this type becomes the reference. (The skeleton only has `-factory.ts` + `-paging.ts`.)

## When to use

- Endpoint returns a paginated list (any envelope shape — see normalization below).
- The page is driven by URL search params (filters, page number, sort).
- Results feed a data table or a search dropdown.

## Template

```typescript
import { formatObject } from '@repo/shared/src/common/object.helper';
import type { xContract } from '@repo/zod-schemas/src/api-contract/x.contract';
import type { ExtractApiContract } from '@/@type/helper';
import { clientAPI } from '@/config/clientAPI.config';
import { queryClient } from '@/config/query-client.config';
import { createQueryRepository } from '@/repositories/-factory';
import { defaultPagedResult, mapPaging } from '@/repositories/-paging';

type ApiContract = ExtractApiContract<typeof xContract.searchXs>;
export type SearchXsQuery = ApiContract['query'];        // exported for routes/forms
// `{ data }` envelope — see SKILL.md → Porting.
type ResponseData = ApiContract['responseData']['data'];

// mapPaging maps a normalized envelope → PagedResult — only write the per-item transform.
// This project's backend returns { data: items[], paging: { page, size, totalElements } };
// rename those fields to the canonical names at the call site.
const mapToDTO = (data: ResponseData) =>
  mapPaging(
    {
      pageIndex: data.paging.page,
      pageSize: data.paging.size,
      total: data.paging.totalElements,
      items: data.data,
    },
    (item) => ({ ...item /* per-item transforms */ }),
  );
export type SearchXsResult = ReturnType<typeof mapToDTO>;

const defaultData: SearchXsResult = defaultPagedResult();

export const searchXsRepository = createQueryRepository<SearchXsResult, SearchXsQuery>({
  queryKey: (query) => ['x', ...Object.values(formatObject(query))],
  queryFn: async (query) => {
    const res = await clientAPI.X.searchXs({ query });
    if (res.success) return mapToDTO(res.data);
    throw Error('Cannot load list x!', { cause: res });
  },
  searchMode: true,                                      // ← enables keepPreviousData
  defaultData,
});

// ALWAYS export this alongside a search repo
export const invalidateAllSearchXsQueries = () =>
  queryClient.invalidateQueries({ queryKey: ['x'] });
```

## Why each rule exists

| Rule | Reason |
|------|--------|
| `searchMode: true` | Sets `placeholderData: keepPreviousData` so the table doesn't flash empty between page changes. |
| `formatObject(query)` in key | Normalizes the query object (drops `undefined`, sorts keys) so `{ q: 'foo', page: 0 }` and `{ page: 0, q: 'foo' }` map to the same cache entry. |
| Spread `Object.values(...)` into the key | Each filter combo gets its own cache slot — paginating back to a previous page is instant. |
| `throw Error(..., { cause: res })` | User-initiated search; surface the failure as a normal error rather than redirecting away from their work. The `cause` carries the original `errorCode` for debugging. |
| `defaultData: defaultPagedResult()` | Supplies every required field of `PagedResult` — including `hasNext`, which a hand-written `{ pageIndex, pageSize, total, items }` literal would omit (a compile error). |
| Export `invalidateAllSearchXsQueries` | One canonical helper. CRUD callers shouldn't need to know the queryKey shape — see [invalidation.md](invalidation.md). |

## The `mapPaging` util

[`-paging.ts`](../../../../apps/frontend/src/repositories/-paging.ts) is a shared util next to the factory. **All search repos use it** — write the per-item transform only, never re-implement the envelope mapping.

```typescript
// signature — `hasNext` is OPTIONAL on input (defaults to (pageIndex+1)*pageSize < total)
mapPaging<TRaw, TItem>(
  data: { pageIndex: number; pageSize: number; total: number; hasNext?: boolean; items: TRaw[] },
  mapItem: (item: TRaw) => TItem,
): PagedResult<TItem>
```

`PagedResult<TItem>` is the canonical type: `{ pageIndex, pageSize, total, hasNext, items: TItem[] }` — `hasNext` is **required** on the output. `defaultPagedResult<T>()` returns a typed empty `PagedResult`. Import either when you need to type a prop or variable:

```typescript
import { type PagedResult, defaultPagedResult } from '@/repositories/-paging';
```

## Envelope normalization (when backend field names differ)

Rename backend field names **before** passing to `mapPaging` — keep the `mapPaging` call clean. This is also the recipe to follow when porting to a backend with different names:

```typescript
// Backend returns: { page, limit, count, results }
const mapToDTO = (res: ResponseData) =>
  mapPaging(
    { pageIndex: res.page, pageSize: res.limit, total: res.count, items: res.results },
    (item) => ({ ...item }),
  );
```

Never spread the envelope (`{ items, ...rest } => ({ ...rest, items })`) — that leaks the backend field names into the DTO type, breaking the type contract silently whenever a field is renamed on the server.

## Per-item transformation

Only write the item transform — `mapPaging` handles the rest. Example: flatten `roles[]` to a single `role`:

```typescript
const mapToDTO = (data: ResponseData) =>
  mapPaging(
    { pageIndex: data.paging.page, pageSize: data.paging.size, total: data.paging.totalElements, items: data.data },
    ({ roles: [role], ...item }) => ({ ...item, role }),
  );
```

See [map-dto.md](map-dto.md) for more per-item patterns.

## Variant: parameterized list (no URL sync)

A large family of repos (`find*` files) returns a list **scoped to a parent ID or the current user** — not driven by URL search params. Examples: districts of a province, indicator values of a district, "my reports", "my assigned indicators".

They use the same `createQueryRepository` but differ in three ways:

**1. Params combine a scope ID with the (optional) query.** Export the combined type:

```typescript
// findProvinceDistricts.repository.ts
type ApiContract = ExtractApiContract<typeof provinceContract.findProvinceDistricts>;
export type FindProvinceDistrictsQuery = ApiContract['query'] & { provinceId: number };
```

**2. QueryKey is `[root, sub-scope, ...scopeIds, ...Object.values(formatObject(query))]`** — the sub-scope segment keeps these entries distinct from the entity's main search:

```typescript
queryKey: ({ provinceId, ...query }) => ['province', 'districts', provinceId, ...Object.values(formatObject(query))],
queryFn: async ({ provinceId, ...query }) => {
  const res = await clientAPI.Province.findProvinceDistricts({ params: { provinceId }, query });
  if (res.success) return mapToDTO(res.data);
  throw Error('Cannot load province districts!', { cause: res });
},
```

**3. The `invalidateAll*` helper takes an optional scope param** so a caller can invalidate just one parent's list or all of them:

```typescript
export const invalidateAllFindProvinceDistrictsQueries = (provinceId?: number) =>
  queryClient.invalidateQueries({
    queryKey: provinceId ? ['province', 'districts', provinceId] : ['province', 'districts'],
  });
```

A multi-ID scope follows the same shape — `findDistrictIndicatorValues.repository.ts` keys as `['district', 'indicator', 'values', districtId, indicatorId]` and its helper takes `(districtId?, indicatorId?)`.

**Paginated vs. plain-array parameterized lists.** If the endpoint paginates, use `mapPaging` + `defaultPagedResult()` + `searchMode: true` exactly as above (`findProvinceDistricts`). If it returns a **bare array** (`findDistrictIndicatorValues`), `mapToDTO` is `(data) => data.map(item => ({ ...item }))`, `defaultData` is `[]`, and there's no `searchMode`. Either way the queryKey sub-scope rule and the scoped `invalidateAll*` helper still apply.

## Usage

- **Route loader** + table component: see [using-in-router.md](using-in-router.md) and [using-in-table.md](using-in-table.md).
- **Async-search dropdown** wrapping this repo: see [async-search-options.md](async-search-options.md).
- **After CRUD**: see [invalidation.md](invalidation.md).

> **Project-specific paths** — relocate when porting (see SKILL.md → Porting)
>
> | Symbol | This project's location |
> |--------|-------------------------|
> | `formatObject` | `@repo/shared/src/common/object.helper` |
> | `ExtractApiContract` | `@/@type/helper` |
> | `clientAPI`, `queryClient` | `@/config/clientAPI.config`, `@/config/query-client.config` |
> | `createQueryRepository` | `@/repositories/-factory` |
> | `mapPaging`, `defaultPagedResult`, `PagedResult` | `@/repositories/-paging` |
> | Backend page-envelope field names | `{ data, paging: { page, size, totalElements } }` |
