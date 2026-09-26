# Column Definitions

`columns` is an inline `useMemo<ColumnDef<XItem>[]>` inside the data-table component — **not** a standalone `buildColumns()` factory. It is built between `useSortState` and `useDataTable`, because cells need `search` (for STT paging math) and `SortableHeader` needs `sortState`/`handleSort`.

```tsx
const { sortState, handleSort } = useSortState({ search, updateSearch });

const columns = useMemo<ColumnDef<XItem>[]>(
  () => [ /* stt, fields…, actions */ ],
  [search.page, search.size, sortState, handleSort],
);
```

The dependency array is `[search.page, search.size, sortState, handleSort]` plus anything else a cell reads (e.g. `currentUser.id`). Missing deps → sort arrows or STT numbers go stale.

## `COLUMN_MAP` — the label & visibility source of truth

A module-level constant above the component. Every column appears here.

```tsx
import type { ColumnMeta } from '@/components/common/column-visibility-toggle';

const COLUMN_MAP: Record<string, ColumnMeta> = {
  stt:        { header: 'STT',      enableHiding: false },
  name:       { header: 'Tên báo cáo', enableHiding: false },
  feeType:    { header: 'Loại phí' },
  status:     { header: 'Trạng thái' },
  createdAt:  { header: 'Tạo lúc',  defaultVisible: false },
  updatedAt:  { header: 'Cập nhật lúc', defaultVisible: false },
};
```

- `header` — **required** — the label shown in the "Ẩn/hiện cột" dropdown. It must be set even when the column's `ColumnDef.header` is a `() => <SortableHeader />` function, because `ColumnVisibilityToggle` reads labels from `COLUMN_MAP`, not from the render function.
- `enableHiding: false` — the column can never be hidden (STT, identity name, actions).
- `defaultVisible: false` — hidden on first load; the user can re-show it via the toggle.
- The map key matches the column's `accessorKey` or `id`.

There is **no** `HEADER_LABEL` constant and **no** `xxx-field-config.ts` file. Labels live in two places only: `COLUMN_MAP` (for the toggle) and inline in each `ColumnDef.header`. See [`column-visibility-persistence.md`](column-visibility-persistence.md).

## Column order

```
1. stt                  always first, never hidable
2. identity fields      name / code — "who is this row"
3. categorical / enum   status, type, role
4. related entity names province name, unit name
5. numeric              fee, count, year
6. metadata dates       createdAt, updatedAt — defaultVisible: false
7. actions              always last, never hidable
```

## 1. STT (ordinal row number)

```tsx
{
  id: 'stt',
  header: 'STT',
  enableHiding: false,
  cell: ({ row }) => search.page * search.size + row.index + 1,
}
```

The math uses `search` (the URL value), so the number matches the page the server actually returned. Use `page`/`size` — never `pageIndex`/`pageSize`.

## 2. Sortable text columns

**Verify the backend actually sorts the field before wiring a `SortableHeader`.** The header is only a client affordance; the ordering happens server-side. A header wired to a field the backend ignores cycles its arrows while the rows never move — broken UX shipped silently.

A `searchXxx` contract that *accepts* a `sort` param is not proof: ts-rest validates the *shape* of `sort`, not the *whitelist* of sortable fields. Before wiring:

1. Find the backend handler for the endpoint; confirm it consumes the sort input (in Java/Spring, a `Pageable` reaching the JPA/Querydsl call).
2. Confirm the field maps to a real DB/JPA entity column — not a computed DTO-only field, which will 400 or be silently ignored.
3. Spot-check in the browser: click the header, confirm the request sends `sort=<field>,<asc|desc>` **and** the row order actually changes.

Only then:

```tsx
{
  accessorKey: 'name',
  header: () => (
    <SortableHeader label="Tên báo cáo" field="name" sortState={sortState} onSort={handleSort} />
  ),
  cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
}
```

Fields the backend doesn't sort get a **plain string header** (`header: 'Loại phí'`). Half-wired sort is worse than no sort.

### Sort state & the `SortQuery` brand

`useSortState` parses `search.sort` and returns `{ sortState, handleSort }`. `handleSort(field)` cycles unsorted → asc → desc → unsorted and resets `page: 0` on each click. Only one column sorts at a time — the contract is single-sort.

`search.sort` is a **branded** `SortQuery` (`"<field>,<asc|desc>"`, `sortZod` from `@repo/zod-schemas/src/custom-type`). The brand makes it nominal:

- **Do not** cast with `as SortQuery` or `` as `${string},asc` `` — casts bypass validation and the brand.
- **Do not** hand-split it (`value.split(',')`). Decomposition lives in `parseSortQuery(value)`.
- Inside a data-table page you never construct one — `useSortState` / `useDataTable` thread branded values through `updateSearch` for you. If you extend the kit, accept `SortQuery`, produce it only via `sortZod.parse`.

## 3. Enum columns → `<AppBadge />`

```tsx
{
  accessorKey: 'status',
  header: 'Trạng thái',
  cell: ({ row }) => <AppBadge value={row.original.status} />,
}
```

Never render an enum as raw text — users recognize statuses by colour across the whole app. To centre a status column, wrap both header and cell: `header: () => <span className="w-full text-center block">Trạng thái</span>` and `cell: ({ row }) => <div className="text-center"><AppBadge value={row.original.status} /></div>`.

## 4. Date columns → `<DateDisplay />` or `<DateOnlyDisplay />`

| Zod type | Component | Use for |
|---|---|---|
| `commonZod.datetime` (ISO-8601 timestamp) | `<DateDisplay date={…} />` | `createdAt`, `updatedAt`, any full timestamp |
| `DateOnly` (branded `YYYY-MM-DD`) | `<DateOnlyDisplay dateOnly={…} />` | `startDate`, `endDate`, `dateOfBirth`, any calendar-day field |

```tsx
{ accessorKey: 'createdAt', header: () => (
    <SortableHeader label="Tạo lúc" field="createdAt" sortState={sortState} onSort={handleSort} />
  ),
  cell: ({ row }) => <DateDisplay date={row.original.createdAt} /> }

{ accessorKey: 'startDate', header: 'Ngày khai giảng',
  cell: ({ row }) => <DateOnlyDisplay dateOnly={row.original.startDate} /> }
```

- The two are **not** interchangeable — `DateDisplay` expects a timestamp, `DateOnlyDisplay` a bare date.
- Never `toLocaleDateString` or hand-formatted `date-fns` in a cell.
- `DateDisplay` is itself clickable — don't wrap it in another `<button>`/`<Link>`.
- For a nullable date, guard it: `row.original.dateOfBirth ? <DateOnlyDisplay dateOnly={row.original.dateOfBirth} /> : <span className="text-muted-foreground">—</span>`.

## 5. Entity columns with a detail page → `<Link>`

If a column shows an entity that has its own detail page, link to it:

```tsx
cell: ({ row }) => (
  <Link
    to="/app/reports/$id"
    params={{ id: String(row.original.id) }}
    className="font-medium hover:underline"
  >
    {row.original.name}
  </Link>
)
```

- Link the column to **the detail page of the entity it shows** — a related-entity column (e.g. province name on a report row) links to *that* entity's page.
- If the same entity ever gets more than one detail page (e.g. an admin view and a public view), link to the one the table's audience can open — linking to the wrong one ships a 403.
- No detail page → plain text. Don't fake a link.

## 6. Conditional row styling → `rowClassName`

The `<TableRow>` is rendered **inside** the shared `<DataTable>` — you cannot style it directly. Pass a `rowClassName` function:

```tsx
<DataTable
  table={table}
  columns={columns}
  isFetching={isFetching}
  isLoading={isLoading}
  rowClassName={(row) => cn(row.isUrgent && 'bg-warning/10', row.isDone && 'bg-success/10')}
  toolbar={…}
/>
```

Keep the palette tiny — `bg-warning/10` for attention, `bg-success/10` for done. The condition reads the row's own data; if it depends on props/role, compute it in the component and the `rowClassName` closure captures it.

## 7. Actions column

Always last, never hidable. The cell is just the row-actions component — no inline `DropdownMenu`, no `onUpdate`/`onDelete` callbacks:

```tsx
{
  id: 'actions',
  enableHiding: false,
  cell: ({ row }) => <XRowActions xItem={row.original} />,
}
```

The full menu anatomy lives in [`row-actions.md`](row-actions.md).

## Anti-patterns

- ❌ STT with `row.index + 1` and no paging math — page 2 restarts at 1.
- ❌ `pageIndex`/`pageSize` in STT math — the codebase uses `page`/`size`.
- ❌ Raw enum strings in cells — use `AppBadge`.
- ❌ `toLocaleDateString` / manual date format — use `DateDisplay` / `DateOnlyDisplay`.
- ❌ `DateDisplay` for a `DateOnly` field, or vice versa — they are not interchangeable.
- ❌ A `HEADER_LABEL` constant or `xxx-field-config.ts` — labels live in `COLUMN_MAP` + inline `header`.
- ❌ Styling `<TableRow>` directly for conditional backgrounds — use `<DataTable rowClassName={…}>`.
- ❌ An inline `<DropdownMenu>` in the actions cell — render `<XRowActions xItem={row.original} />`.
- ❌ `columns` as a module-level constant — sort arrows then never re-render. Use `useMemo`.
- ❌ Wiring `SortableHeader` just because the contract has a `sort` field — verify the backend sorts that field.
