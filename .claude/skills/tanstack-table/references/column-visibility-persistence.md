# Column Visibility Persistence

The "Ẩn/hiện cột" menu lets users hide columns. Choices are persisted to `localStorage` per-table automatically via `useDataTable` — no manual `useState` or `useEffect` needed.

## How it works

`useDataTable` (in `apps/frontend/src/components/common/data-table.tsx`) calls `useColumnVisibility(tableName, defaultVisibility)` internally. Default hidden columns are declared in `COLUMN_MAP` via `defaultVisible: false`.

## COLUMN_MAP — the source of truth

Define a `COLUMN_MAP` at the top of the data-table file. Every hideable column must appear here with a `header` label. The `header` value is what the "Ẩn/hiện cột" dropdown shows — even for columns whose `ColumnDef.header` is a function (e.g. `SortableHeader`).

```tsx
import type { ColumnMeta } from "@/components/common/column-visibility-toggle";

const COLUMN_MAP: Record<string, ColumnMeta> = {
  stt:        { header: "STT",           enableHiding: false },
  fullName:   { header: "Họ và tên",     enableHiding: false },
  phoneNumber:{ header: "Số điện thoại" },
  userStatus: { header: "Trạng thái" },
  createdAt:  { header: "Ngày tạo",      defaultVisible: false },
  updatedAt:  { header: "Cập nhật",      defaultVisible: false },
};
```

- `enableHiding: false` — column is never hideable (STT, name, actions).
- `defaultVisible: false` — hidden on first load; user can re-show via toggle.
- `header` — **required** — the label shown in the dropdown. This must be set even if the `ColumnDef` uses a `() => <SortableHeader />` function, because `ColumnVisibilityToggle` reads from `COLUMN_MAP`, not from the render function.

## Wiring

`COLUMN_MAP` is passed to `useDataTable` as `columnMap`, and `useDataTable` returns the same object back — `useColumnVisibility(tableName, …)` runs inside the hook. The full `useDataTable` call signature lives in [`table-kit.md`](table-kit.md); this file only covers the visibility-specific part of it.

Destructure `columnMap` from the hook result and pass it, with `table`, to the toggle:

```tsx
<ColumnVisibilityToggle table={table} columnMap={columnMap} />
```

`<ColumnVisibilityToggle>` needs **both** props — `table` for the live column state, `columnMap` for the labels. `useDataTable` returns the very object you handed in, so the dropdown labels can never disconnect from the column map.

## Why `columnMap` and not `column.columnDef.header`

Columns with sortable headers define `header` as a render function:

```tsx
{
  accessorKey: "createdAt",
  header: () => <SortableHeader label="Ngày tạo" field="createdAt" ... />,
}
```

`typeof header === "function"` — so reading `column.columnDef.header` gives you a function, not a string. Without `columnMap`, the dropdown falls back to the raw `accessorKey` (`"createdAt"` instead of `"Ngày tạo"`). The `COLUMN_MAP` is the single place where string labels live, separate from render concerns.

## Storage key

The storage key is derived from `tableName`: `table-column-visibility:<tableName>`. Pick a stable, unique name per table (e.g. `"admin-users"`, `"my-reports"`). Renaming it clears saved preferences for that table.

## What NOT to persist

- **Pagination / filters / sort** — live in the URL.
- **Row selection** — ephemeral under `manualPagination`.

Only `columnVisibility` belongs in localStorage; it is a view preference, not part of the shareable URL state.
