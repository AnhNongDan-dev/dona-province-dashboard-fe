# The Table Kit — Contract & Portability

The table kit is the set of shared primitives every data table is built on. A page component never touches TanStack Table's `useReactTable` directly — it composes the kit. This file documents each piece as a **behavioral contract**: its signature, the portable *principle* it implements, and the invariants a caller (or a re-implementation in another project) must honour.

> **In this codebase**, the kit already exists — import it and follow the contract.
> **In another project**, recreate equivalents that satisfy the contracts and acceptance tests below; then the rest of the skill applies unchanged.

## Why a kit at all

A data table has two layers of concern that must not be tangled:

1. **Mechanics** — server pagination, server sorting, stable row identity, column-visibility persistence, the loading shell. Identical for every table.
2. **Content** — which columns, which filters, which row actions. Unique per entity.

The kit owns layer 1 so every page is pure layer 2. The principle is portable; the class names below are this codebase's implementation of it.

## `useUrlSearch` — URL is the single source of truth

`@/hooks/use-url-search`

```ts
useUrlSearch<T>(route: { useSearch: () => T })
  → { search: T; updateSearch(part: Partial<T>): void; updateSearchDebounced(part: Partial<T>): void }
```

**Principle.** A list view's state (filters, page, sort) belongs in the URL — so reload, deep-link, and browser Back all just work. There is no second copy of that state in React.

**Contract.**
- `search` *is* the route's validated search params — never mirrored into `useState`.
- `updateSearch` writes the URL immediately; `updateSearchDebounced` writes 300 ms after the last call. Both merge `part` into the current URL and `navigate({ replace: true })`.
- Both dedupe via `isSearchEqual` — writing the current value is a no-op, which makes the design loop-proof.
- The debounced writer reads the **latest** URL at fire time, not the URL when the timer was set.
- The caller must NOT: add a URL-sync `useEffect`, keep a local mirror of `search`, or call `navigate` for filter state itself.

## `useDataTable` — the mechanics hook

`@/components/common/data-table`

```ts
useDataTable<T>({
  data: T[];
  columns: ColumnDef<T>[];
  columnMap: Record<string, ColumnMeta>;
  tableName: string;                       // localStorage key for column visibility
  search: { page: number; size: number; sort?: string };
  total: number;
  isFetching: boolean;
  updateSearch: (part: Partial<{ page; size; sort }>) => void;
  getRowId?; rowSelection?; onRowSelectionChange?; enableRowSelection?;  // optional — bulk selection
}) → { table, columnMap, sortState, handleSort }
```

**Principle.** One hook absorbs all the table mechanics so a page never configures `useReactTable` itself.

**Contract — what the hook owns (the caller must NOT re-do any of these):**
- Maps `search.page`/`search.size` → TanStack's internal `pageIndex`/`pageSize`. **Page code uses `page`/`size` only**; `pageIndex`/`pageSize` exist only inside the kit.
- Sets `manualPagination: true` and `manualSorting: true` — the server paginates and sorts.
- Computes `pageCount` from `total / size`.
- Default `getRowId` returns `String(row.id)` — stable identity for selection and reconciliation. Override only if rows have no `id`.
- Runs the "current page emptied → jump to the new last page" effect.
- Persists column visibility to `localStorage` via `tableName` (see [`column-visibility-persistence.md`](column-visibility-persistence.md)).
- `onPaginationChange` routes back through `updateSearch` — pagination is URL state like every filter.
- **`columnMap` is passed straight through** to the return value — the same object you handed in. `<ColumnVisibilityToggle>` reads its labels from there, not from `ColumnDef.header`.

## `useSortState` — sort cycle, callable before the table

`@/components/common/data-table`

```ts
useSortState({ search: { sort?: string }, updateSearch }) → { sortState, handleSort }
```

**Principle.** Sort is just another URL filter; the header UI is a thin affordance over it.

**Contract.**
- `handleSort(field)` cycles unsorted → asc → desc → unsorted and resets `page: 0` on every click.
- `sort` is a branded `SortQuery` (`"<field>,<asc|desc>"`) — constructed and parsed only through the kit; never hand-split. See [`column-definitions.md`](column-definitions.md).
- **Call order matters.** `useSortState` must be called **before** `useDataTable`, because the `columns` `useMemo` (built between them) needs `handleSort` to wire `SortableHeader`. `useDataTable` *also* returns `sortState`/`handleSort` (the identical values) for convenience — but you cannot use those to build columns, since `columns` is an argument *to* `useDataTable`. Always build columns from `useSortState`'s pair.

## `SortableHeader` / `DataTable` / `buildSelectColumn` / `applyColumnMap`

`@/components/common/data-table`

- **`SortableHeader`** `{ label, field, sortState, onSort }` — a header button that shows the sort arrow and cycles on click. Use as a `header` render fn; pair `field` with a backend-sortable column.
- **`DataTable`** `{ table, columns, isFetching, isLoading, toolbar?, emptyMessage?, rowClassName?, hideFooter?, isBackgroundFetching? }` — the shell JSX: toolbar slot, sticky header, `animate-pulse` while `isFetching`, spinner overlay, empty state, `<TableFooter>`. **The `<TableRow>` lives inside here** — conditional row styling goes through `rowClassName`, never a hand-written row. Pass `isBackgroundFetching: true` to suppress the dim/pulse + overlay + input-lock during a *silent* refetch (see "Polling a list" below) — the busy treatment then shows only for a user-driven fetch.
- **`buildSelectColumn<T>()`** → a checkbox `ColumnDef` for bulk selection; `unshift` it into `columns`. See [`bulk-selection.md`](bulk-selection.md).
- **`applyColumnMap(columns, columnMap)`** — optional helper to merge `COLUMN_MAP` header labels / `enableHiding` into column defs.

## Polling a list (auto-refresh)

When a table mirrors server state that changes on its own — a job queue, a report-generation pipeline, a moderation backlog — it should refresh itself instead of making the user click "refresh." Two pieces cooperate:

1. **The fetch.** Drive it from the repository with a functional `refetchInterval` so the poll reads live data each cycle and *stops itself* when the work is done. The full pattern (and the "poll only while there's unfinished work, else `false`" invariant that keeps it cheap) lives in [repository-pattern → "Polling — `{ refetchInterval }`"](../../repository-pattern/SKILL.md). Don't hand-roll a `useEffect` + `setInterval` — it closes over stale rows and needs a ref to stop.

2. **The render.** A background poll must not make the table flicker. By default `<DataTable>` dims + pulses + locks input while `isFetching` — correct for a user-initiated fetch, but jarring and click-swallowing when it fires silently every few seconds. Pass `isBackgroundFetching` so the busy treatment is reserved for user-driven fetches:

```tsx
// keep a ref that's true only for the brief window after the user clicks refresh
const userRefreshingRef = useRef(false);
// any fetch that isn't the user's refresh is a background poll
const isBackgroundFetching = isFetching && !userRefreshingRef.current;

<DataTable table={table} columns={columns} isFetching={isFetching}
  isLoading={isLoading} isBackgroundFetching={isBackgroundFetching} ... />
```

`keepPreviousData` (already set by `searchMode` repos) is what makes this safe — rows stay mounted across a poll, so only changed cells repaint; scroll, page, and filter (URL state) are untouched. Consider a small "auto-updating" affordance near the toolbar while polling so the silent refresh is explained rather than mysterious.

## Column-visibility primitives & `TableFooter`

- `ColumnMeta` (`@/components/common/column-visibility-toggle`) — `{ header: string; enableHiding?: boolean; defaultVisible?: boolean }`. The shape of each `COLUMN_MAP` entry.
- `ColumnVisibilityToggle` `{ table, columnMap }` — the "Ẩn/hiện cột" dropdown. Needs **both** props.
- `useColumnVisibility` / `deriveDefaultVisibility` — used internally by `useDataTable`; a page never calls them directly.
- `TableFooter` (`@/components/common/table-footer`) `{ table, pageSizeOptions? }` — rendered inside `DataTable`; page-size select + pager.

## Porting checklist — re-creating the kit in another project

A new project needs equivalents of these four files before this skill's recipe applies:

| File | Provides |
|---|---|
| `hooks/use-url-search.ts` | `useUrlSearch` |
| `components/common/data-table.tsx` | `useDataTable`, `useSortState`, `SortableHeader`, `DataTable`, `buildSelectColumn` |
| `components/common/column-visibility-toggle.tsx` | `ColumnMeta`, `useColumnVisibility`, `ColumnVisibilityToggle` |
| `components/common/table-footer.tsx` | `TableFooter` |

A re-implementation is correct when it passes these acceptance tests:

1. **Pagination mapping.** Render a table with `search = { page: 2, size: 20 }`. The footer shows page **3** of N, and the server query receives `page=2, size=20`.
2. **Auto-last-page.** On the last page, delete the last remaining row. After the refetch, the table auto-navigates to the new last page (never strands the user on an empty page).
3. **URL round-trip.** Change a filter → the URL updates; reload the page → the same filtered view renders with no flicker of unfiltered data; click browser Back → the previous filter state returns.
4. **Sort cycle.** Click a `SortableHeader` three times → `sort` goes `field,asc` → `field,desc` → absent; each click resets `page` to 0.
5. **Visibility persistence.** Hide a column, reload → it stays hidden. `defaultVisible: false` columns start hidden on first ever load.
6. **Sort-state ordering.** Columns built with `handleSort` from `useSortState` (called before the table) respond correctly to clicks. If a re-implementation only exposes sort state *from* the table hook, column building becomes a chicken-and-egg problem — the standalone `useSortState` is what breaks the cycle.
