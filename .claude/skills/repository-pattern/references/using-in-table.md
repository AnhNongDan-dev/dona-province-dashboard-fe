# Using a search repo in a TanStack Table

This is the most common consumption pattern. The repo provides paginated data; the route owns the URL state; the table component reads from `.useQuery()` and dispatches changes back through `navigate({ search })`.

> Toast strings below are neutral English placeholders — write them in your app's UI language.

## The data flow

```
URL search params  ──validateSearch──▶  Route.useSearch()
                                              │
                                              ▼
                                    repo(search).useQuery()
                                              │
                                              ▼
                              queryClient[ ['x', ...query] ]   ◀─── table renders
                                              │
        ┌─── pagination/sort change ──────────┤
        ▼
   navigate({ search: nextQuery })  ──▶  URL updates ──▶ new useQuery() result
```

The route loader does **not** prime the search cache. The DataTable component handles `isLoading` with its own skeleton — no need to block navigation for a data fetch.

## Skeleton

```typescript
import { searchResourcesRepository, type SearchResourcesQuery } from '@/repositories/searchResources.repository';

function ResourcesPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const { data, isLoading, isFetching } = searchResourcesRepository(search).useQuery();

  return (
    <DataTable
      data={data.items}
      total={data.total}
      pageIndex={data.pageIndex}
      pageSize={data.pageSize}
      isLoading={isLoading}
      isRefetching={isFetching}
      onPaginationChange={(next) =>
        navigate({ search: { ...search, page: next.pageIndex, size: next.pageSize } })
      }
    />
  );
}
```

`isFetching` covers background refetches (e.g. after invalidation) without blocking the previous page — `searchMode: true` keeps the old rows on screen via `keepPreviousData`.

> The DTO exposes `pageIndex`/`pageSize` (canonical `PagedResult` field names). The URL search params use the **contract's** field names — in this project `page`/`size`. The `navigate` call writes contract names; `.useQuery()` reads DTO names. Keep the two straight.

## Filters

Each filter is a search param. Update the URL — the repo will re-key automatically:

```typescript
const updateSearch = (part: Partial<SearchResourcesQuery>) =>
  navigate({ search: { ...search, ...part, page: 0 } }); // reset to page 0 on filter change
```

For async-search filter dropdowns (e.g. "filter by user"), see [async-search-options.md](async-search-options.md).

## After CRUD: refresh the table

The table re-renders automatically once its query is invalidated. In the `onSuccess` of your form/mutation:

```typescript
import { invalidateAllSearchResourcesQueries } from '@/repositories/searchResources.repository';

onSuccess() {
  toast.success('Created successfully');
  invalidateAllSearchResourcesQueries();
  ZodFormDrawerEvent.close();
}
```

See [invalidation.md](invalidation.md) for the full picture (and when to invalidate detail too).

## Show toast → navigate to the new row

After create, you often want to land the user on the new item inside the table. Use a toast action that navigates with the new item's name as the search query:

```typescript
onSuccess(data) {
  toast.success('Created successfully', {
    action: {
      label: 'View',
      onClick: () =>
        navigate({
          to: '/app/users',
          search: { query: data.fullName, size: search.size, page: 0 },
        }),
    },
  });
  invalidateAllSearchUsersQueries();
}
```

## Date display

Always render dates in cells with the `DateDisplay` component, never `toLocaleDateString()`. Keep the raw `Date` in the DTO; format at the leaf.

> **Project-specific paths** — relocate when porting (see SKILL.md → Porting)
>
> | Symbol | This project's location |
> |--------|-------------------------|
> | `DataTable`, `DateDisplay` | `@/components/common/...` table + date components |
> | `ZodFormDrawerEvent` / `openZodFormDrawer` | the project's imperative ZodForm dialog API |
> | Search-param field names | the ts-rest contract's `query` schema (here `page`/`size`) |
