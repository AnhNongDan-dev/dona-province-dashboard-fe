---
name: tanstack-table
description: Use whenever building, editing, or debugging a data-table page in this codebase — paginated lists, CRUD tables, search/filter bars, sortable headers, row actions, bulk selection, or URL-synced list views. Covers the `xxx-data-table.tsx` + `xxx-table-search.tsx` + `xxx-row-actions.tsx` file split, the shared table kit (`useUrlSearch` / `useDataTable` / `useSortState` / `<DataTable>` / `COLUMN_MAP` / `<ColumnVisibilityToggle>`), STT + sortable headers + `DateDisplay`/`DateOnlyDisplay` + `AppBadge` enums + clickable entity links, the inline filter bar (SearchInput / CommitSelect / AsyncSearchCombobox with AppBadge labels + ring active style), row actions (showAlert + AsyncButton + toast + invalidate, navigate via `<DropdownMenuLinkItem>`, edit via `<XEditDialog>`), bulk selection, column-visibility persistence, and URL sync. Use even when the user does not say "data table" — any paginated/searchable list page in `/app/...` is one.
---

# TanStack Table — Data Tables

> **Not ported yet.** The table kit lives in ELP-fe. Before building a table, port from `ELP-fe/apps/frontend/src/`: `hooks/use-url-search.ts`, `components/common/data-table.tsx`, `column-visibility-toggle.tsx`, `table-footer.tsx`, `app-badge.tsx`, `date-display.tsx`, `dropdown-menu-link-item.tsx`, `search-input.tsx`, `commit-select.tsx`, `async-search-combobox.tsx`, `clear-input-button.tsx`, `select-trigger.tsx`, `date-picker-time.tsx`, plus `components/async-button.tsx`, `components/global/global-alert.dialog..tsx` (`showAlert`) and `components/permission-check.tsx`. `MultiSelectPopover` / `DateRangeFilter` exist only as sources in [`examples/components/`](examples/components/README.md).

Every list page in this app is a **data table**: a paginated, searchable, URL-synced view backed by a `searchXxxRepository`. They all follow one shape, built on a shared **table kit** that owns the TanStack Table mechanics. Once you know the shape, a new table is copy-and-edit work.

## When to read what

Two distinct tasks, two distinct homes — see them clearly before you start:

| You are… | Start here |
|---|---|
| **Building a new table page from scratch** | This file (SKILL.md), top to bottom — the 5-step recipe |
| **Making one incremental change** to an existing table (add a column / filter / action, etc.) | [`references/extending.md`](references/extending.md) |
| Defining columns (STT, sort, dates, badges, entity links, COLUMN_MAP) | [`references/column-definitions.md`](references/column-definitions.md) |
| Building the filter bar | [`references/table-search.md`](references/table-search.md) |
| Building the row-action menu | [`references/row-actions.md`](references/row-actions.md) |
| Wiring URL ↔ state (validateSearch, debounce) | [`references/url-sync-debounce.md`](references/url-sync-debounce.md) |
| Persisting column visibility | [`references/column-visibility-persistence.md`](references/column-visibility-persistence.md) |
| Adding bulk select + bulk-action toolbar | [`references/bulk-selection.md`](references/bulk-selection.md) |
| Understanding the kit, or porting this skill to another project | [`references/table-kit.md`](references/table-kit.md) |
| Adding a "Tạo X" / "Cập nhật X" button or a form-opening row action | the **zod-form-trigger-dialog** skill — wrap in `<XCreateDialog>` / `<XEditDialog>` |

When you need the search repository first, read [`../repository-pattern/SKILL.md`](../repository-pattern/SKILL.md).

## Reference implementations in-tree

None yet — this repo has no table pages. The first real table (e.g. `apps/frontend/src/routes/app/districts/-components/`) becomes the **lint-checked source of truth**; until then use the `examples/` seeds plus these ELP-fe files as the reference:

- `ELP-fe/apps/frontend/src/routes/admin/users/-components/` — `user-data-table.tsx`, `users-table-search.tsx`, `user-row-actions.tsx`
- `ELP-fe/apps/frontend/src/routes/admin/categories/-components/` — `categories-data-table.tsx`, `categories-table-search.tsx`, row actions

## The table kit

The TanStack Table mechanics are extracted into a shared kit — **you never call `useReactTable` directly**. The kit is:

- `useUrlSearch` (`@/hooks/use-url-search`) — URL ↔ state.
- `useSortState`, `useDataTable`, `SortableHeader`, `DataTable`, `buildSelectColumn` (`@/components/common/data-table`).
- `ColumnMeta`, `useColumnVisibility`, `ColumnVisibilityToggle` (`@/components/common/column-visibility-toggle`).
- `TableFooter` (`@/components/common/table-footer`).

`useDataTable` wraps `useReactTable` and **owns** manual pagination/sorting, the string `getRowId`, the auto-jump-to-last-page effect, and column-visibility persistence — don't re-implement any of them. Full API contract: [`references/table-kit.md`](references/table-kit.md).

## File layout for a new table

```
src/routes/app/<entity>/
├── index.tsx                          # Route: validateSearch + useUrlSearch + <XDataTable />
└── -components/
    ├── <entity>-data-table.tsx        # COLUMN_MAP + columns + useDataTable + <DataTable> + toolbar
    ├── <entity>-table-search.tsx      # The filter bar — ONE file, all controls inline
    └── <entity>-row-actions.tsx       # The row-action menu — its own component, takes the entity as a prop
```

Four files, all co-located in `-components/`. There is **no** per-filter-control split — the whole filter bar is one file.

## The 5-step recipe

### 1. Create the repository

You need `searchXRepository` + `invalidateAllSearchXQueries`. See [`../repository-pattern/SKILL.md`](../repository-pattern/SKILL.md). The query type (`SearchXQuery`) drives columns, filters, and the URL schema.

### 2. Wire the route (URL sync)

```tsx
// src/routes/app/<entity>/index.tsx
export const Route = createFileRoute('/app/<entity>/')({
  component: RouteComponent,
  validateSearch: xContract.searchX.query,        // Zod from the contract
  loader: async () => { await requirePermission('view:x'); }, // permission gate ONLY
});

function RouteComponent() {
  const { search, updateSearch, updateSearchDebounced } = useUrlSearch(Route);
  return (
    <XDataTable
      search={{ ...search, page: search.page ?? 0, size: search.size ?? 20 }}
      updateSearch={updateSearch}
      updateSearchDebounced={updateSearchDebounced}
    />
  );
}
```

The URL is the single source of truth. **No `useEffect`, no `useNavigate`, no local mirror state.** `useUrlSearch` gives two writers:

- **`updateSearch(part)`** → writes the URL immediately. Pagination, sort, every dropdown commit, toggle buttons.
- **`updateSearchDebounced(part)`** → writes 300 ms after the last call. Free-text inputs only (`SearchInput`).

Drop the `updateSearchDebounced` prop on pages whose filter bar has no `SearchInput`. The route `loader` gates permissions only — **never** call the search repository in it. Full mechanics: [`references/url-sync-debounce.md`](references/url-sync-debounce.md).

### 3. Build `COLUMN_MAP` + the `columns` array

`COLUMN_MAP` is a module-level constant — it labels columns for the "Ẩn/hiện cột" menu and declares which are hidable / default-hidden. `columns` is an inline `useMemo<ColumnDef<XItem>[]>` — **not** a `buildColumns()` factory.

```tsx
const COLUMN_MAP: Record<string, ColumnMeta> = {
  stt:       { header: 'STT',       enableHiding: false },
  name:      { header: 'Tên báo cáo', enableHiding: false },
  status:    { header: 'Trạng thái' },
  createdAt: { header: 'Tạo lúc',   defaultVisible: false }, // hidden until the user shows it
};
```

Always start columns with `stt`, end with `actions`. Between them: `SortableHeader` for sortable fields, `AppBadge` for enums, `DateDisplay`/`DateOnlyDisplay` for dates, `<Link>` for entity code/name with a detail page. Details: [`references/column-definitions.md`](references/column-definitions.md).

### 4. Assemble the data-table component

```tsx
interface Props {
  search: Required<Pick<SearchXQuery, 'page' | 'size'>> & SearchXQuery;
  updateSearch: (part: Partial<SearchXQuery>) => void;
  updateSearchDebounced: (part: Partial<SearchXQuery>) => void;
}

export function XDataTable({ search, updateSearch, updateSearchDebounced }: Props) {
  const { data: { items, total }, isFetching, isLoading } = searchXRepository(search).useQuery();

  // useSortState MUST come before useDataTable — the columns useMemo needs handleSort.
  const { sortState, handleSort } = useSortState({ search, updateSearch });

  const columns = useMemo<ColumnDef<XItem>[]>(
    () => [
      { id: 'stt', header: 'STT', enableHiding: false,
        cell: ({ row }) => search.page * search.size + row.index + 1 },
      // …field columns…
      { id: 'actions', enableHiding: false,
        cell: ({ row }) => <XRowActions xItem={row.original} /> },
    ],
    [search.page, search.size, sortState, handleSort],
  );

  const { table, columnMap } = useDataTable<XItem>({
    data: items,
    columns,
    columnMap: COLUMN_MAP,
    tableName: 'admin-x',                                   // localStorage key for column visibility
    search: { page: search.page, size: search.size, sort: search.sort },
    total,
    isFetching,
    updateSearch,
  });

  return (
    <DataTable
      table={table}
      columns={columns}
      isFetching={isFetching}
      isLoading={isLoading}
      toolbar={/* see Toolbar layout */}
    />
  );
}
```

`<DataTable>` is the **root element** the component returns — never wrap it in a card / panel with its own background + padding (no `<Card className="p-4">`, no `<div className="rounded-lg border bg-card p-5">`). `<DataTable>` already renders its own table border (`overflow-hidden rounded-lg border` around the `<UITable>`); an outer card just double-frames the list and adds dead padding. The page/route provides outer spacing (see `.claude/rules/layout.md` — "Parent provides padding"). This applies to every list page, including raw-`<Table>` pages that don't use `<DataTable>` (e.g. an indicator-by-district pivot matrix) — frame them with `overflow-hidden rounded-lg border` only, never a filled card.

`data` is `items` straight from the query — **no `tableData` augmentation, no per-row `onUpdate`/`onDelete` callbacks**. Row actions are a self-contained `<XRowActions>` component (step 5). `useDataTable` already owns `manualPagination`, `manualSorting`, `getRowId`, `pageCount`, and the auto-jump-to-last-page-on-empty effect — see [`references/table-kit.md`](references/table-kit.md).

### 5. Build the filter bar and the row-action menu

- `xxx-table-search.tsx` — one file, all filter controls inline → [`references/table-search.md`](references/table-search.md).
- `xxx-row-actions.tsx` — its own component taking the entity as a prop → [`references/row-actions.md`](references/row-actions.md).

## Toolbar layout

Two groups: filters left, actions right. They stay on one row until the viewport genuinely can't fit both — **the filter group wraps its own children and never pushes the action group down**.

```tsx
toolbar={
  <div className="flex flex-wrap items-start gap-2">
    {/* Left: filters wrap among themselves */}
    <div className="flex flex-1 flex-wrap gap-2 items-center min-w-0">
      <XTableSearch
        search={search}
        updateSearch={updateSearch}
        updateSearchDebounced={updateSearchDebounced}
      />
    </div>
    {/* Right: pinned right, never wraps with filters */}
    <div className="flex shrink-0 gap-2 items-center ml-auto">
      <ColumnVisibilityToggle table={table} columnMap={columnMap} />
      <XCreateDialog>
        <Button size="sm">
          <Plus />
          <span className="hidden sm:inline">Tạo X</span>
        </Button>
      </XCreateDialog>
    </div>
  </div>
}
```

- `flex-1 min-w-0` on the filter group; `shrink-0 ml-auto` on the action group.
- `<ColumnVisibilityToggle>` needs **both** `table` and `columnMap` — `columnMap` comes destructured from `useDataTable(...)`.
- The "Tạo X" button is **always** wrapped in a `<XCreateDialog>` trigger — never `<Link to=".../new">` or `navigate(...)`, both lose the user's filter/scroll state. The trigger also handles permission gating internally (no `<PermissionCheck>` at the call site). Build it per the **zod-form-trigger-dialog** skill if it doesn't exist yet.
- Button text uses `hidden sm:inline` — icon-only below `sm`.
- No filter bar (e.g. a nested tab table)? Use `<div className="flex justify-end gap-2">`.

## Header & row conventions

- **Sortable headers** use `<SortableHeader field='name' label='Tên' sortState={sortState} onSort={handleSort} />`. Only wire it for fields the **backend actually sorts** — see [`references/column-definitions.md`](references/column-definitions.md). Non-sortable headers are plain strings.
- **STT** (ordinal): always first, never hidable — `search.page * search.size + row.index + 1`.
- **Timestamps** (`commonZod.datetime`): `<DateDisplay date={row.original.createdAt} />`. **Date-only** fields (`DateOnly`): `<DateOnlyDisplay dateOnly={row.original.startDate} />`. Never `toLocaleDateString`; never mix the two.
- **Enums**: `<AppBadge value={row.original.status} />` — never raw text.
- **Entity with a detail page**: make the code/name a `<Link>` to it (the entity's own detail page).
- **Conditional row backgrounds**: pass `rowClassName` to `<DataTable>` — `<DataTable rowClassName={(row) => cn(row.isUrgent && 'bg-warning/10')} />`. The `<TableRow>` lives inside `DataTable`; you cannot style it directly.
- Metadata columns (`createdAt`, `updatedAt`) are `defaultVisible: false` in `COLUMN_MAP`.

## Row actions

Row actions are a separate `xxx-row-actions.tsx` component, rendered from the `actions` column as `<XRowActions xItem={row.original} />`. It owns its own handlers, confirms, and invalidation. Standard shape: a `<DropdownMenu>` with an `<IconDots />` trigger; navigation via `<DropdownMenuLinkItem>`; edit via `<XEditDialog>`; destructive actions via `showAlert` + `AsyncButton`. Full anatomy: [`references/row-actions.md`](references/row-actions.md).

## Visual language: the filter bar

Every control in `<XTableSearch>` follows one rule set so an active filter is obvious:

- **Idle**: default shadcn styling.
- **Active (a value is set)**: add `ring` via `cn('w-44', search.field && 'ring')`. The ring is the *only* universal "this filter is on" signal — don't invent per-filter colors. For arrays use `field && field.length > 0`; for date ranges use `from || to`.
- **Pending (async commit)**: `CommitSelect` shows `animate-pulse cursor-wait` internally.
- Enum selects: option `label` must be `<AppBadge value={value} />`, never a plain string.

## The 6 filter controls

The filter bar is assembled from a fixed set of reusable controls. The full snippets, props, and pitfalls for each live in [`references/table-search.md`](references/table-search.md); the complete inline-commented template is at [`examples/table-search.example.tsx`](examples/table-search.example.tsx). Quick map:

| Control | Use for | Writer | State |
|---|---|---|---|
| `SearchInput` | Free text | `updateSearchDebounced` | Uncontrolled (`defaultValue`) |
| `CommitSelect` | Enum / status | `updateSearch` | Uncontrolled — re-key on its own value to survive external URL changes |
| `AsyncSearchCombobox` | Entity picker | `updateSearch` | Uncontrolled — hydrate from `defaultKeyOption`, never key on own value |
| `MultiSelectPopover` | Array filter | `updateSearch` | Controlled (`value=`) |
| `DateRangeFilter` | Date / datetime range | `updateSearch` | Controlled (`from`/`to` ISO strings or `null`) |
| Shared user picker | "By user" filters | `updateSearch` | `AsyncSearchCombobox` + `searchUsersForCombobox` + `renderUserComboboxOption` |

Always pair every commit/clear with `page: 0` (URL-synced shape) and convert empty values to `undefined` (never `''`, `null`, or `[]`) so the URL stays clean.

## Two filter-bar prop shapes

| Shape | Used when | Props |
|---|---|---|
| **URL-synced** (default) | The route owns the table via `useUrlSearch(Route)` — every `/app/...` table | `{ search, updateSearch, updateSearchDebounced }`; every commit passes `page: 0` |
| **Local-state** | The filter lives inside a tab/section whose parent owns pagination (e.g. `my-reports`, `assigned-reports`, `my-drafts`) | `{ filters, onChange }`; **no `page: 0`** — the parent resets it |

When in doubt, copy URL-synced — local-state is only correct when the parent isn't a route.

## Common pitfalls

- **Wrapping `<DataTable>` in a card with background + padding.** `<Card className="p-4">` or `<div className="rounded-lg border bg-card p-5">` around the table double-frames it (`<DataTable>` already draws its own border) and adds dead padding. Return `<DataTable>` as the root; let the page own outer spacing. Same for raw-`<Table>` list pages — frame with `overflow-hidden rounded-lg border` only, never a filled card.
- **Calling `useReactTable` directly.** Use `useDataTable` — it owns the mechanics.
- **Using `pageIndex`/`pageSize`.** The schema and the codebase use `page`/`size`. `useDataTable` maps them to TanStack's `pageIndex`/`pageSize` internally; your code never touches those names.
- **Augmenting rows with `onUpdate`/`onDelete` callbacks.** Pass `items` straight to `useDataTable`; put action logic inside `<XRowActions>`.
- **Splitting the filter bar into per-control files.** One `xxx-table-search.tsx`, all controls inline.
- **Forgetting `page: 0` on a filter change.** A user on page 4 of the old filter sees an empty page 4 of the new one.
- **Calling the search repository in the route `loader`.** It blocks navigation; the loader gates permissions only. Don't use `Route.useLoaderData()` either — fetch with `searchXRepository(search).useQuery()` in the component.
- **`updateSearch` from a free-text input** — fires a navigation per keystroke. Use `updateSearchDebounced` for text, `updateSearch` for discrete commits.
- **Re-creating columns every render.** Wrap in `useMemo` with `[search.page, search.size, sortState, handleSort]` (plus anything else a cell reads).
- **Invalidating one query key after a mutation.** Use `invalidateAllSearchXQueries()` — the search key includes every filter.

## Quick checklist before merging a table

- [ ] `validateSearch` is the Zod contract query; route `loader` gates permissions only — no repository call, no `loaderDeps`
- [ ] Route uses `useUrlSearch(Route)`; no manual `useEffect` / `useNavigate`
- [ ] `COLUMN_MAP` declared; `columns` is a `useMemo`; STT first & not hidable; `actions` last & not hidable
- [ ] STT cell is `search.page * search.size + row.index + 1`
- [ ] `SortableHeader` only on backend-sortable fields; others plain strings
- [ ] Timestamps → `DateDisplay`; date-only → `DateOnlyDisplay`; enums → `AppBadge`
- [ ] Entity code/name links to its detail page
- [ ] Every filter passes `page: 0` on commit/clear and shows `ring` when active
- [ ] Row actions live in `<XRowActions>`; destructive actions use `showAlert` + `AsyncButton variant='destructive'`
- [ ] Every successful mutation: `toast.success` + `invalidateAllSearchXQueries()`
- [ ] `useDataTable` is the only table hook; no direct `useReactTable`; no `pageIndex`/`pageSize` in page code
- [ ] `<ColumnVisibilityToggle>` gets both `table` and `columnMap`
- [ ] Toolbar: filter group `flex-1 flex-wrap min-w-0`, action group `shrink-0 ml-auto`; create button wrapped in `<XCreateDialog>`
- [ ] `<DataTable>` is returned as the root — NOT wrapped in a card/panel with background + padding (`<Card className="p-4">`, `bg-card p-5`, etc.)

## Porting this skill to another project

The skill is portable: each reference separates the **principle** from this codebase's **implementation**.

**Filter-bar controls** ship as real source code in [`examples/components/`](examples/components/README.md) — copy the 8 files in there + 2 hooks into a new project's `components/common/` and `hooks/`, install the shadcn primitives listed in that README, and the filter-bar recipe works as-is. The 5 controls (`SearchInput`, `CommitSelect`, `AsyncSearchCombobox`, `MultiSelectPopover`, `DateRangeFilter`) come with their internal helpers (`ClearInputButton`, `SelectTrigger` wrapper, `DatePickerTime`, `useDebouncedValue`, `useIsMobile`).

**Table kit** still needs to be recreated per project — the four files (`use-url-search.ts`, `data-table.tsx`, `column-visibility-toggle.tsx`, `table-footer.tsx`) satisfy the contract in [`references/table-kit.md`](references/table-kit.md). Then this recipe applies unchanged.
