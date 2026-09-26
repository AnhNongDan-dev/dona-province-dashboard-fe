# Creating an Infinite repo (load-more / infinite scroll)

For a list rendered as an **infinite-scroll grid** — the user loads more by scrolling, there are no page numbers. Used by public-facing card grids.

**References**:
- None in this repo yet, and `-infinite-factory.ts` does not exist yet — write it (and the first infinite repo) when the first load-more list is needed.
- Factory: [-infinite-factory.ts](../../../../apps/frontend/src/repositories/-infinite-factory.ts)

## When to use vs. a search repo

| | List/Search repo | Infinite repo |
|---|---|---|
| UI | Table with pagination controls | Card grid, "load more" / scroll sentinel |
| Factory | `createQueryRepository` (`searchMode: true`) | `createInfiniteQueryRepository` |
| Page param | In the query object | Owned internally by the factory |
| Hook returns | `{ data: PagedResult, ... }` | `{ items, fetchNextPage, hasNextPage, ... }` |

Pick infinite **only** for a genuine load-more UI. A normal table is always a search repo.

## What the factory does differently

`createInfiniteQueryRepository` wraps `useInfiniteQuery`. It is a **different and smaller** API than `createQueryRepository` — do not use the standard 5-step recipe:

- `queryFn` receives **`(params, page)`** — the second arg is the page index, supplied by the factory.
- **`queryKey` must NOT include the page** — the factory tracks the page internally; including it would split every page into its own cache root.
- **No `defaultData`.** The factory has no `defaultData` option; the hook returns an empty `items` array before the first page resolves.
- The hook returns a **flattened `items` array** (all loaded pages concatenated) plus infinite-query flags — consumers never touch `data.pages`.
- `getNextPageParam` reads `lastPage.hasNext` — so `queryFn` must return a `PagedResult` with an **authoritative `hasNext`** from the backend (don't rely on the `mapPaging` fallback here).

## Template

```typescript
import { formatObject } from '@repo/shared/src/common/object.helper';
import { xContract } from '@repo/zod-schemas/src/api-contract/x.contract';
import type { z } from 'zod';
import { clientAPI } from '@/config/clientAPI.config';
import { queryClient } from '@/config/query-client.config';
import { createInfiniteQueryRepository } from '@/repositories/-infinite-factory';
import { mapPaging } from '@/repositories/-paging';
// Reuse the item DTO from the matching search repo so both stay identical:
import type { XItemDTO } from '@/repositories/searchXs.repository';

export type { XItemDTO };

const PAGE_SIZE = 12;

// The query type is the search query MINUS page/size (the factory owns the page).
const infiniteQuerySchema = xContract.searchXs.query.omit({ page: true, size: true });
export type SearchXsInfiniteQuery = z.infer<typeof infiniteQuerySchema>;

export const searchXsInfiniteRepository = createInfiniteQueryRepository<
  XItemDTO,
  SearchXsInfiniteQuery
>({
  queryKey: (query) => ['xInfinite', ...Object.values(formatObject(query))],   // NO page here
  queryFn: async (query, page) => {
    const res = await clientAPI.X.searchXs({ query: { ...query, page, size: PAGE_SIZE } });
    if (res.success)
      return mapPaging(
        {
          pageIndex: res.data.paging.page,
          pageSize: res.data.paging.size,
          total: res.data.paging.totalElements,
          hasNext: res.data.paging.hasNext,   // authoritative — required for getNextPageParam
          items: res.data.data,
        },
        (item) => ({ ...item }),
      );
    throw Error('Cannot load list x!', { cause: res });
  },
});

export const invalidateAllSearchXsInfiniteQueries = () =>
  queryClient.invalidateQueries({ queryKey: ['xInfinite'] });
```

> Give an infinite repo its **own queryKey root** (`'xInfinite'`, not `'x'`) — its cache entries are page-collections, structurally different from a search repo's single-page entries, so they should not collide.

## Consuming in a component

The hook returns the flattened list directly:

```tsx
const { items, total, hasNextPage, isFetchingNextPage, isLoading, fetchNextPage } =
  searchXsInfiniteRepository(search).useQuery();

// Trigger fetchNextPage from a scroll sentinel (e.g. react-intersection-observer):
const { ref } = useInView({
  skip: !hasNextPage || isFetchingNextPage,
  onChange: (inView) => {
    if (inView && hasNextPage && !isFetchingNextPage) fetchNextPage();
  },
});
```

The factory hook also exposes `isFetching`, `isError`, `error`, and `refetch`. There is **no** `loader`, `get`, or `updateCache` — only `useQuery`, `invalidate`, and `queryKey`.

## Checklist (infinite repos)

- [ ] Used `createInfiniteQueryRepository` (not `createQueryRepository`).
- [ ] Query type is the search query with `page`/`size` omitted.
- [ ] `queryKey` does **not** include the page; has its own root (`'xInfinite'`).
- [ ] `queryFn` signature is `(query, page)`; `page` + a fixed `size` are merged into the API query.
- [ ] `mapPaging` receives an **explicit `hasNext`** from the backend's paging envelope.
- [ ] No `defaultData` (the factory has no such option).
- [ ] Exported an `invalidateAll…InfiniteQueries` helper.

> **Project-specific paths** — relocate when porting (see SKILL.md → Porting)
>
> | Symbol | This project's location |
> |--------|-------------------------|
> | `formatObject` | `@repo/shared/src/common/object.helper` |
> | `clientAPI`, `queryClient` | `@/config/clientAPI.config`, `@/config/query-client.config` |
> | `createInfiniteQueryRepository` | `@/repositories/-infinite-factory` |
> | `mapPaging` | `@/repositories/-paging` |
> | Backend page-envelope field names | `{ data, paging: { page, size, totalElements, hasNext } }` |
