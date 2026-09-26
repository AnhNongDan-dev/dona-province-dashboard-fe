# Row Actions

Row actions are a **separate component** — `xxx-row-actions.tsx` — that takes the row entity as a prop. The data-table's `actions` column is just:

```tsx
{ id: 'actions', enableHiding: false,
  cell: ({ row }) => <ReportRowActions report={row.original} /> }
```

There is **no** row-callback augmentation: no `tableData`, no `RowData = Item & { onDelete }`, no `onUpdate`/`onDelete`/`canEdit` passed through the row. The data-table hands `items` straight to `useDataTable`. **Every action's logic — handlers, the `invalidate()` helper, confirmation dialogs — lives inside the `XRowActions` component body.**

## The component shape

```tsx
interface Props {
  report: ReportItem | ReportDetail;   // accept the list type AND the detail type
}

export function ReportRowActions({ report }: Props) {
  const isActive = report.status === 'ACTIVE';

  // The invalidate helper — refresh this row's detail cache AND every search page.
  async function invalidate() {
    await Promise.all([
      reportDetailRepository(report.id).invalidate(),
      invalidateAllSearchReportsQueries(),
    ]);
  }

  async function toggleStatus() {
    const res = await clientAPI.Report.updateReportStatus({
      params: { reportId: report.id },
      body: { status: isActive ? 'INACTIVE' : 'ACTIVE' },
    });
    if (res.success) {
      toast.success(isActive ? 'Đã vô hiệu hóa báo cáo' : 'Đã kích hoạt báo cáo');
      await invalidate();
    } else toast.error(res.message, { id: res.errorCode });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon"
          className="size-8 text-muted-foreground data-[state=open]:bg-muted">
          <IconDots />
          <span className="sr-only">Mở menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {/* navigate / edit / destructive items… */}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- Type the prop as `XItem | XDetail` — the same `<XRowActions>` is reused from the detail page's header.
- `data-[state=open]:bg-muted` gives feedback while the menu is open.
- Always include `<span className="sr-only">Mở menu</span>` — icon-only buttons need an accessible name.
- Define every handler as a plain `async function` in the component body. No `useCallback` — the component re-renders only when its `report` prop changes anyway.

## Navigation items → `<DropdownMenuLinkItem>`

`<DropdownMenuLinkItem>` (`@/components/common/dropdown-menu-link-item`) is the dropdown counterpart of `<Link>` — same `to`/`params`/`search` props, and the menu closes naturally on click.

```tsx
<DropdownMenuLinkItem
  to="/app/indicators/$id"
  params={{ id: String(indicator.id) }}
  search={{ tab: 'levels' }}
>
  <Layers /> Xem cấp độ
</DropdownMenuLinkItem>
```

This is the **recommended** pattern (as in `examples/row-actions.example.tsx`). Some older ELP-fe files use an imperative `onClick={() => navigate({ to, params })}` instead — that is an **accepted variant**, not an anti-pattern; don't "fix" working code. The one genuine anti-pattern: never `<DropdownMenuItem asChild><Link>` — it fights Radix's auto-close and leaves the menu hanging open after navigation.

## Edit items → `<XEditDialog>`

Form-opening actions (edit, clone) wrap the `<DropdownMenuItem>` in a trigger-dialog component:

```tsx
<IndicatorEditDialog indicator={indicator}>
  <DropdownMenuItem>
    <Pencil /> Cập nhật
  </DropdownMenuItem>
</IndicatorEditDialog>
```

The dialog owns the form schema, defaults, API call, and success handling — written once per entity, not per row. Leave the `DropdownMenuItem` plain (no `onSelect={preventDefault}`): the imperative dialog mounts at the app root, so the menu can close. Full pattern: the **zod-form-trigger-dialog** skill.

## Destructive & status-toggle actions → `showAlert` + `AsyncButton`

Never call a mutating API straight from a menu item. Always confirm first.

```tsx
<DropdownMenuItem
  variant={isActive ? 'destructive' : 'default'}
  onClick={() =>
    showAlert({
      title: isActive ? 'Vô hiệu hóa chỉ tiêu?' : 'Kích hoạt chỉ tiêu?',
      description: isActive
        ? 'Chỉ tiêu sẽ không xuất hiện trong danh sách chỉ tiêu đang hoạt động.'
        : 'Chỉ tiêu sẽ có thể được sử dụng trở lại.',
      footer: (setOpen) => (
        <AsyncButton
          variant={isActive ? 'destructive' : 'default'}
          onClick={async () => {
            await toggleStatus();
            setOpen(false);
          }}
        >
          Xác nhận
        </AsyncButton>
      ),
    })
  }
>
  {isActive ? <Ban /> : <CircleCheck />}
  {isActive ? 'Vô hiệu hóa' : 'Kích hoạt'}
</DropdownMenuItem>
```

The contract:

1. `DropdownMenuItem variant='destructive'` for a destructive item (red text).
2. `onClick` opens `showAlert({ title, description, footer })`.
3. The footer is an `<AsyncButton>` — it disables + pulses while the click promise is pending, so a double-click can't double-fire.
4. The handler checks `res.success`, then `toast.success` + `invalidate()`; on failure `toast.error(res.message, { id: res.errorCode })`.

**Name the subject in a delete confirmation.** "Xác nhận xóa?" is weak — users click through. "Bạn có chắc chắn muốn xóa người dùng `Nguyễn Văn A` không?" makes the consequence concrete.

### The confirm-button `variant` matches the action, not the dialog

Not every confirmed action is destructive. Locking is — **un**locking isn't. Rejecting is — approving isn't. The `variant` is the user's last semantic cue: a red button on a restorative action miscommunicates and desensitizes users to red. Rule of thumb: the menu item's `variant` and the confirm button's `variant` match. Destructive/restorative pairs to watch: lock ↔ unlock, revoke ↔ restore, reject ↔ approve, soft-delete ↔ revive, ban ↔ unban, disable ↔ enable.

A shared `confirmAsync` helper takes the variant as a parameter — see `user-row-actions.tsx`:

```tsx
function confirmAsync(title, description, fn, variant: ButtonVariant = 'default') {
  showAlert({
    title, description,
    footer: (setOpen) => (
      <AsyncButton variant={variant} onClick={async () => { await fn(); setOpen(false); }}>
        Xác nhận
      </AsyncButton>
    ),
  });
}
```

## Invalidation after a mutation

Every successful mutation reconciles the cache. The standard helper:

```tsx
await Promise.all([
  xDetailRepository(id).invalidate(),       // refresh this row's detail cache
  invalidateAllSearchXQueries(),            // refresh EVERY search page — a mutation can move rows across pages
]);
```

Invalidating only the current page's query key leaves other filter combinations stale. See `.claude/rules/mutation-invalidation.md`.

For a **create/edit** that produced a row the user will want to find, the success toast can carry an action button that navigates to it — `toast.success(msg, { action: { label: 'Kiểm tra', onClick: () => navigate({ to: '/app/x', search: { query: data.code, page: 0, size: search.size }, reloadDocument: true }) } })`. This belongs in the `<XEditDialog>`'s `onSuccess` (the zod-form-trigger-dialog skill), not in the row-actions file. Plain status toggles and deletes just use `toast.success('Đã …')` — there is no row to navigate to.

## Permission gating — per-item vs whole-cell

Two styles; pick per guard, and they can coexist in one component:

- **Whole-cell gate** — `return null` before the `<DropdownMenu>` — when a single check decides whether the user may touch this row *at all*. Example (`user-row-actions.tsx`): `if (isSelf) return null` — you can't act on your own account, so the whole menu disappears.
- **Per-item `<PermissionCheck>`** — wrap an individual `<DropdownMenuItem>` — when different actions need **different** permissions. Example (`report-row-actions.tsx`): `publish:report` gates the publish/unpublish item; `change_status:report` gates the activate/deactivate item — independently.

```tsx
<PermissionCheck permission="change_status:report">
  <DropdownMenuItem variant={isActive ? 'destructive' : 'default'} onClick={…}>
    {isActive ? 'Vô hiệu hóa' : 'Kích hoạt'}
  </DropdownMenuItem>
</PermissionCheck>
```

`user-row-actions.tsx` uses both at once: a whole-cell `if (isSelf) return null`, a `canManageRoles` inline conditional, and a per-item `<PermissionCheck permission="lock:user">`. The choice is per-guard, not per-file. Decide by the question: *does one check govern the whole menu* (whole-cell) *or do actions need distinct permissions* (per-item)?

## Error handling

```tsx
if (!res.success) toast.error(res.message, { id: res.errorCode });
```

- `{ id: res.errorCode }` coalesces repeated errors of the same code into one toast.
- `res.message` is user-facing (server contracts return Vietnamese). Don't toast raw error strings or stack traces.
- On a failed destructive action, leave the alert dialog open so the user can retry — only `setOpen(false)` after success (or after the handler that toasts the error has run, as `report-row-actions.tsx` would — both are acceptable).

## Anti-patterns

- ❌ Augmenting rows with `onUpdate`/`onDelete` callbacks / a `tableData` map — put logic inside `<XRowActions>`.
- ❌ An inline `<DropdownMenu>` in the data-table's `actions` cell — render `<XRowActions>`.
- ❌ `<DropdownMenuItem asChild><Link to=".../$id/edit">` — loses table state; use `<XEditDialog>`.
- ❌ `<DropdownMenuItem asChild><Link>` for plain navigation — menu hangs open; use `<DropdownMenuLinkItem>`.
- ❌ Calling `clientAPI.X.delete(...)` straight from `onClick` with no `showAlert`.
- ❌ A plain `<Button>` in the alert footer — double-click races; use `<AsyncButton>`.
- ❌ Generic "Xác nhận xóa?" — name the subject.
- ❌ A hardcoded `variant='destructive'` in a shared confirm helper — restorative actions end up red; pass the variant per call.
- ❌ `invalidateXxx` for only the current filter's key — use `invalidateAllSearchXQueries()`.
- ❌ A toast action button on a delete — there's nothing left to navigate to.
