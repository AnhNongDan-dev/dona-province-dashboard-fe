# Extending an Existing Table

This file answers "I already have a table — how do I change one thing?" Each recipe is a **localized edit**: what to add, which file, which in-tree file to copy from, and which deep reference has the full rules.

For building a table from scratch, use the 5-step recipe in [`SKILL.md`](../SKILL.md) instead — that is a different task.

## Add a column

**File:** `xxx-data-table.tsx`. **Anchor:** `examples/data-table.example.tsx` (or the first real `*-data-table.tsx` once one exists).

1. Add an entry to `COLUMN_MAP` — `key: { header: 'Label' }`. Add `defaultVisible: false` if it's metadata, `enableHiding: false` if it must never be hidden.
2. Add one `ColumnDef` object to the `columns` `useMemo`, in the right slot of the column order (identity → enum → related → numeric → metadata).
3. Render the cell with the right primitive: `<AppBadge>` for an enum, `<DateDisplay>`/`<DateOnlyDisplay>` for a date, `<Link>` for a linkable entity, plain text otherwise.
4. If the field is backend-sortable, use a `SortableHeader` (see "Make a column sortable" below); otherwise a plain string header.

That's the whole change — no `useDataTable` edit needed. Full rules: [`column-definitions.md`](column-definitions.md).

## Add a filter

**Files:** `xxx-table-search.tsx` + the contract. **Anchor:** `examples/table-search.example.tsx`.

1. Add the field to the contract's search query schema (`searchXxx.query` in `packages/zod-schemas/src/api-contract/`). This makes it valid in the URL and typed on `SearchXQuery`.
2. Add the control inline in `xxx-table-search.tsx` — `SearchInput` (free text), `CommitSelect` (enum), or `AsyncSearchCombobox` (entity picker).
3. Wire the writer: text → `updateSearchDebounced`; discrete commit → `updateSearch`. Both commit **and** clear pass `page: 0`.
4. `className={cn('<fixed-width>', search.field && 'ring')}` so the control glows when active.
5. Enum select → option `label` is `<AppBadge value={value} />`; add the `key={...}` remount line.

The repository picks the new field up automatically (it reads the whole `search`). Full rules: [`table-search.md`](table-search.md).

## Add a row action

**File:** `xxx-row-actions.tsx`. **Anchors:** `examples/row-actions.example.tsx`, ELP-fe `user-row-actions.tsx`.

1. Add one `<DropdownMenuItem>` (action) or `<DropdownMenuLinkItem>` (navigation) inside the menu.
2. Define the handler as an `async function` in the `XRowActions` component body — never as a row callback.
3. A destructive/state-changing action: `onClick` opens `showAlert({ … footer: <AsyncButton> })`; the handler checks `res.success`, then `toast.success` + `invalidate()`.
4. **Gating decision:** if the new action needs a permission **distinct** from the menu's other actions, wrap *that item* in `<PermissionCheck permission="…">` (as `row-actions.example.tsx` does). If one check governs the whole menu — a shared permission, or an ownership check like `if (isSelf) return null` (as `user-row-actions.tsx` does) — that gate already covers it; don't add a per-item check.

Full rules: [`row-actions.md`](row-actions.md).

## Make a column sortable

**File:** `xxx-data-table.tsx`. **Do the backend check first** — a header wired to a field the backend can't sort cycles its arrows while the rows never move.

1. **Find the backend handler** for the `searchXxx` endpoint and confirm it consumes the sort input (in Java/Spring: a `Pageable` reaching the JPA/Querydsl query).
2. **Confirm the field maps to a real DB/JPA entity column** — not a computed DTO-only field. A computed field will 400 or be silently ignored.
3. **Spot-check in the browser:** click the header — the request must send `sort=<field>,<asc|desc>` **and** the visible row order must actually change.

Only if all three hold, swap the column's plain string header for:

```tsx
header: () => (
  <SortableHeader label="Tên" field="name" sortState={sortState} onSort={handleSort} />
),
```

If the backend doesn't sort the field, keep the plain string header. Full rules: [`column-definitions.md`](column-definitions.md).

## Add bulk selection

A whole feature, not a one-line change — follow the full recipe in [`bulk-selection.md`](bulk-selection.md): `buildSelectColumn` unshifted into `columns`, `useState<RowSelectionState>` passed into `useDataTable`, and a conditional bulk-action toolbar.

## Change the default page size

The page size lives in **two** layers — pick deliberately:

- **One table only** → the route file `index.tsx`. It passes `search={{ ...search, page: search.page ?? 0, size: search.size ?? 20 }}` to the data-table. The `?? 20` is the fallback used when the URL omits `size`. Change `20` here to change just this table's default.
- **Every table** → the contract. `searchOptionsSchema` in `packages/zod-schemas/src/common.ts` defines the `size` field with a `.default(...)`. Changing it shifts the repo-wide default. Only do this if every table should change.

The per-page-size *options* in the footer dropdown come from `<TableFooter pageSizeOptions={...}>` — pass the prop if a table needs a non-standard list.
