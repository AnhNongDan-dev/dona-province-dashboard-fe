# Examples — Portable Seeds

These `.example.tsx` files are **seeds**: minimal, faithful templates of the data-table architecture for a fictional `widget` entity. Find-and-replace `widget`/`Widget` with your entity to start a new table.

For the actual control-component sources (CommitSelect, AsyncSearchCombobox, MultiSelectPopover, DateRangeFilter, SearchInput, plus their internal helpers) — drop-in ready for another project — see [`components/`](components/README.md). The filter bar in `table-search.example.tsx` imports them by their canonical paths (`@/components/common/...`), so copying the `components/` folder into a new project is enough to make the seed compile.

## Seeds vs. the source of truth

| | Seeds (this folder) | Real in-tree files |
|---|---|---|
| Compiled / linted | **No** — `.example.tsx` is excluded from `tsc` and Biome | Yes — lint guards them, they cannot silently rot |
| Role | Portable starting point, incl. for other projects | The authoritative pattern |

This repo has **no in-tree tables yet**, so each seed header points at the closest lint-checked ELP-fe file instead. Once the first real table exists here, it becomes the authoritative twin: when a seed and an in-tree file disagree, the in-tree file wins — it's the one the compiler checks.

## Files

| Seed | Templates | Closest lint-checked source (ELP-fe, until this repo has its own) |
|---|---|---|
| [`route.example.tsx`](route.example.tsx) | `index.tsx` (route) | `routes/admin/users/index.tsx` |
| [`data-table.example.tsx`](data-table.example.tsx) | `<entity>-data-table.tsx` | `routes/admin/users/-components/user-data-table.tsx` |
| [`table-search.example.tsx`](table-search.example.tsx) | `<entity>-table-search.tsx` — covers **all 6 controls** + 2 prop-shape variants | `routes/admin/users/-components/users-table-search.tsx`, `routes/admin/categories/-components/categories-table-search.tsx` |
| [`row-actions.example.tsx`](row-actions.example.tsx) | `<entity>-row-actions.tsx` | `routes/admin/users/-components/user-row-actions.tsx` |
| [`local-debounced-search.example.tsx`](local-debounced-search.example.tsx) | component-local debounce (not a table filter) | `components/common/async-search-combobox.tsx` |

## Assumed external surface

The table seeds assume these already exist (create them with the **repository-pattern**, **ts-rest-contract**, and **zod-form-trigger-dialog** skills):

- `widgetContract.searchWidgets.query` — the Zod search query schema.
- `searchWidgetsRepository` + `invalidateAllSearchWidgetsQueries` — the list/search repo.
- `widgetDetailRepository` — the detail repo (used by row-actions' `invalidate()`).
- `widgetOwnerSearchOptionsFn` + `generateWidgetOwnerKey` — the async-search-options helper.
- `WIDGET_STATUS_OPTIONS` + `WidgetStatus` — exported from the entity schema, with `AppBadge` entries.
- `<WidgetCreateDialog>` / `<WidgetEditDialog>` — the trigger-dialog components.

## What these seeds reinforce

- The 4-file layout: thin route → `data-table` → `table-search` (one file) → `row-actions` (own component).
- The kit: `useUrlSearch` / `useSortState` / `useDataTable` / `<DataTable>` — never `useReactTable` directly.
- `page`/`size` everywhere — never `pageIndex`/`pageSize`.
- `COLUMN_MAP` for labels + visibility; STT `search.page * search.size + row.index + 1`.
- Enums via `<AppBadge>`, dates via `<DateDisplay>`/`<DateOnlyDisplay>`.
- Filter bar: inline controls, `ring` when active, debounced text vs immediate commits, `page: 0` on every change.
- Row actions: `showAlert` + `<AsyncButton>`, `<DropdownMenuLinkItem>` navigation, `<XEditDialog>` edit, per-item `<PermissionCheck>`.
