# Bulk Selection + Bulk Actions

Optional. Add only when a page genuinely acts on multiple rows at once — mass export, bulk approve, bulk delete. Most tables don't need it.

> **No table in the codebase currently uses bulk selection.** The kit *exports* the pieces (`buildSelectColumn`, the `rowSelection` props on `useDataTable`) — this file documents the intended wiring for when a page needs it. There is no in-tree reference table to copy.

## The per-page caveat

Under `manualPagination: true`, **selection is per-page only** — navigating pages clears it. This is correct, not a limitation:

- Selected IDs come from the rows currently in `items`. Cross-page selection would mean caching IDs outside the table and hoping filters don't change underneath them.
- Bulk operations almost always apply to "what fits on one screen". If a user needs to act on hundreds of rows, the right API is "apply to all rows matching this filter", not a giant client-side selection.

## 1. The selection column

Use the **exported** `buildSelectColumn` — don't hand-write a checkbox column:

```tsx
import { buildSelectColumn } from '@/components/common/data-table';
```

`buildSelectColumn<XItem>()` returns a `ColumnDef` with a header "select all (this page)" checkbox and a per-row checkbox; it is `enableHiding: false`. `unshift` it into the `columns` `useMemo` so it sits before `stt`:

```tsx
const columns = useMemo<ColumnDef<XItem>[]>(() => {
  const cols: ColumnDef<XItem>[] = [
    { id: 'stt', /* … */ },
    // …field columns…
    { id: 'actions', /* … */ },
  ];
  if (enableSelection) cols.unshift(buildSelectColumn<XItem>());
  return cols;
}, [search.page, search.size, sortState, handleSort, enableSelection]);
```

## 2. Enable selection through `useDataTable`

Selection state is local React state — it is **not** URL state (it's ephemeral, per-page). Hold it in `useState` and pass it, plus its setter, plus `enableRowSelection`, into the same `useDataTable` call every table makes:

```tsx
import { useState } from 'react';
import type { RowSelectionState } from '@tanstack/react-table';

const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

const { table, columnMap } = useDataTable<XItem>({
  data: items,
  columns,
  columnMap: COLUMN_MAP,
  tableName: 'admin-x',
  search: { page: search.page, size: search.size, sort: search.sort },
  total,
  isFetching,
  updateSearch,
  rowSelection,
  onRowSelectionChange: setRowSelection,
  enableRowSelection: true,
});
```

The kit's default `getRowId` (`String(row.id)`) is what keeps `rowSelection` keyed by entity id — so a React Query refetch doesn't drop the selection of rows that still exist.

## 3. The bulk-action toolbar

Read the selected ids straight off the table; render the toolbar **only** when something is selected, in the toolbar's right group next to `<ColumnVisibilityToggle>`:

```tsx
const selectedIds = table.getSelectedRowModel().rows.map((r) => Number(r.original.id));

// inside the toolbar's right group:
{selectedIds.length > 0 && (
  <div className="flex items-center gap-3">
    <span className="text-muted-foreground text-sm">Đã chọn {selectedIds.length}</span>
    <Button variant="destructive" size="sm" onClick={() => bulkDelete(selectedIds)}>
      <Trash2 /> Xóa đã chọn
    </Button>
  </div>
)}
```

If the same table component is reused with and without selection, gate it behind an `enableSelection?: boolean` prop (plus a `bulkActions?` prop) so only the callers that need it turn it on.

## 4. Destructive bulk actions

Same contract as [`row-actions.md`](row-actions.md): confirm via `showAlert`, count in the title, `<AsyncButton variant='destructive'>` in the footer.

```tsx
async function bulkDelete(ids: number[]) {
  showAlert({
    title: <span>Xóa {ids.length} mục đã chọn?</span>,
    description: <span>Thao tác này không thể hoàn tác.</span>,
    footer: (setOpen) => (
      <AsyncButton
        variant="destructive"
        onClick={async () => {
          const res = await clientAPI.X.bulkDelete({ body: { ids } });
          if (res.success) {
            toast.success(`Đã xóa ${ids.length} mục.`);
            await invalidateAllSearchXQueries();
            setRowSelection({});          // ← clear selection explicitly
            setOpen(false);
          } else toast.error(res.message, { id: res.errorCode });
        }}
      >
        Xóa
      </AsyncButton>
    ),
  });
}
```

**Clear the selection with `setRowSelection({})` after a successful bulk mutation.** The refetch won't do it — deleted rows that *had* the same id leave stale selection state behind.

## Anti-patterns

- ❌ Hand-writing a checkbox `ColumnDef` — use the exported `buildSelectColumn`.
- ❌ Calling `useReactTable` directly to add `rowSelection` — pass it through `useDataTable`.
- ❌ Putting `rowSelection` in the URL — it is ephemeral, per-page; keep it in `useState`.
- ❌ Trying to persist selection across pages under `manualPagination`.
- ❌ The checkbox column anywhere but first.
- ❌ Forgetting `setRowSelection({})` after a successful bulk mutation.
- ❌ Showing the bulk toolbar when nothing is selected — render it only when `selectedIds.length > 0`.
- ❌ A bulk destructive action with no confirm dialog.
