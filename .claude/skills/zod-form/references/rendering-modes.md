# ZodForm — Rendering Modes

Three ways to mount a ZodForm. Pick by information density and where the submit lives.

| Mode | When | Submit button alignment |
|---|---|---|
| **Inline** | Full-page create/edit, complex multi-field forms, auth pages | **You set it** — `'w-full'` or `'ml-auto'` |
| **Dialog** | Short confirm-with-reason, simple create, destructive actions | **Automatic** — `ml-auto` is prepended |
| **Drawer** | Side-panel create/edit from a list page, medium density | **Automatic** — defaults to `w-full` |

## Submit-button alignment — who sets it

This is worth stating once, clearly, because an older version of this skill got it backwards:

- `openZodFormDialog` wraps your form and forces `className: cn('ml-auto', yourClassName)`. The button is **always** right-aligned. Passing `ml-auto` yourself just yields `ml-auto ml-auto` — harmless but pointless.
- `openZodFormDrawer` defaults `submitBtn.className` to `'w-full'` when you don't pass one.
- Inline `<ZodForm>` has **no default**. Its submit wrapper is `<div className='w-full flex'>`, so a bare button hugs the left edge. **Inline forms must set `submitBtn.className`.**

For a destructive **dialog** action, pass only the variant — the dialog adds `ml-auto` on top:

```ts
submitBtn: { text: 'Xoá', className: buttonVariants({ variant: 'destructive' }) }
```

| Context | What you pass for `submitBtn.className` |
|---|---|
| Dialog (standard) | nothing — `ml-auto` is automatic |
| Dialog (destructive) | `buttonVariants({ variant: 'destructive' })` only |
| Drawer | nothing — `w-full` is the default |
| Inline (long form / wide page) | `'w-full'` |
| Inline (narrow standalone page — sign-in, change-password) | `'w-full mt-4'` |

## Closing — automatic on success

None of the three modes needs a manual close. `ZodForm` calls `ZodFormDialogEvent.close()` and `ZodFormDrawerEvent.close()` itself after a successful submit (see [architecture.md](architecture.md) → "Auto-close"). On error the overlay stays open so the user sees the error banner. So `onSuccess` never calls `.close()`.

## Mode 1 — Inline

Render `<ZodForm {...props} />` directly on the page.

```tsx
import ZodForm, { createZodFormProps } from '@/components/zod-form/zod-form';

function CreateWidgetPage() {
  const navigate = useNavigate();
  const formProps = createZodFormProps({
    schema: widgetContract.create.body,
    defaultValues: { name: '', ownerId: 0 },
    displayOptions: {
      name:    { label: 'Tên', colSpan: 6 },
      ownerId: { label: 'Chủ sở hữu', colSpan: 6, selectOptions: ownerOptions },
    },
    contractAPI: (body) => clientAPI.Widget.create({ body }),
    onSuccess: (data) => {
      toast.success('Đã tạo!');
      navigate({ to: '/app/widgets/$id', params: { id: String(data.id) } });
    },
    submitBtn: { text: 'Tạo', className: 'w-full' },   // inline → you set alignment
  });

  return <Card><CardContent><ZodForm {...formProps} /></CardContent></Card>;
}
```

`createZodFormProps` is an identity helper — it just narrows the generics so `displayOptions` keys autocomplete. Use it even when inlining.

### `@container/main` check

The 6-column grid uses `@4xl/main:grid-cols-6` — a **container** query, not a viewport breakpoint. A `@container/main` ancestor must exist for the breakpoint to fire. The `/app` and `/auth` layouts already provide it. If an inline form stays 1-column on a wide screen, an ancestor is missing `@container/main`.

## Mode 2 — Dialog

```tsx
import { openZodFormDialog } from '@/components/global/zod-form.dialog';

openZodFormDialog({
  title: 'Từ chối hồ sơ',
  description: 'Vui lòng nhập lý do từ chối',   // optional subtitle
  body: <AlertBanner />,                         // optional ReactNode above the form
  schema: dossierContract.reject.body,
  defaultValues: { version, comment: '' },
  displayOptions: {
    version: { hidden: true },
    comment: { label: 'Lý do', colSpan: 6 },
  },
  contractAPI: (body) => clientAPI.Dossier.reject({ params: { dossierId }, body }),
  onSuccess: () => {
    toast.success('Đã từ chối!');
    dossierDetailRepository(dossierId).invalidate();
    // no close() — the dialog closes itself
  },
  submitBtn: { text: 'Từ chối', className: buttonVariants({ variant: 'destructive' }) },
  dialogOptions: { blockOutsideClick: true },
});
```

### Dialog rules

1. Submit alignment is automatic (`ml-auto`) — see above. For destructive actions pass only the variant class.
2. Closing is automatic — no `ZodFormDialogEvent.close()` in `onSuccess`.
3. Keep dialog forms short — 1–4 fields. Denser forms belong in a drawer or inline.
4. Optimistic-locking / identity fields → `hidden: true` + provide in `defaultValues` (`version`, `id`).
5. `blockOutsideClick` works for **dialogs only** (see below).

### `blockOutsideClick`

`dialogOptions: { blockOutsideClick: true }` makes `<DialogContent onInteractOutside>` call `preventDefault()`, so a click on the backdrop won't dismiss the dialog. Use it when losing typed input would hurt (long textarea, file selection).

**Drawers ignore it.** The drawer's `onInteractOutside` handler is currently a no-op (the body is commented out in `zod-form.drawer.tsx`). A drawer can always be dismissed by clicking outside. If you genuinely need a non-dismissable drawer, that's an implementation change — see [extending.md](extending.md).

## Mode 3 — Drawer

```tsx
import { openZodFormDrawer } from '@/components/global/zod-form.drawer';

openZodFormDrawer({
  title: 'Chỉnh sửa đơn vị',
  schema: unitContract.update.body,
  defaultValues: { id: unit.id, name: unit.name, version: unit.version },
  displayOptions: {
    id:      { hidden: true },
    version: { hidden: true },
    name:    { label: 'Tên đơn vị', colSpan: 6 },
  },
  contractAPI: (body) => clientAPI.Unit.update({ body }),
  onSuccess: () => {
    toast.success('Đã cập nhật!');
    invalidateAllSearchUnitsQueries();
  },
  submitBtn: { text: 'Lưu' },   // drawer → w-full by default; nothing to pass
});
```

- Desktop: slides in from the right. Mobile (`useIsMobile()`): slides up from the bottom.
- Submit button defaults to `w-full` — fits the vertical layout. Override only if you have a reason.

## Width — the `size` token (every overlay)

**Never widen an overlay with a `max-w-*` className.** Dialog, drawer, and `showAlert` all take one shared token: `'sm' | 'md' | 'lg' | 'xl'` (`OverlaySize` in `@/lib/overlay-size`). Default is `'sm'`.

```ts
openZodFormDialog({ ..., dialogOptions: { size: 'lg' } });
openZodFormDrawer({ ..., dialogOptions: { size: 'lg' } });
showAlert({ ..., size: 'lg' });
```

The token is shared; what it resolves to differs per overlay (a dialog needs room for the 6-col grid; a drawer is a vertical panel; an alert is narrow). Each overlay owns one `*_SIZE_CLASS` record:

| Overlay | Record / file | `sm` → `md` → `lg` → `xl` |
|---|---|---|
| Dialog | `DIALOG_SIZE_CLASS` — `zod-form.dialog.tsx` | `max-w-125` · `2xl` · `5xl` · `7xl` |
| Drawer | `DRAWER_SIZE_CLASS` — `zod-form.drawer.tsx` | `sm` · `md` · `xl` · `3xl` (right-direction only) |
| Alert | `ALERT_SIZE_CLASS` — `ui/alert-dialog.tsx` | `md` · `lg` · `2xl` · `4xl` |

To change a width, edit the relevant `*_SIZE_CLASS` record — never inline a className at the call site. To add a *new* token, see [extending.md](extending.md). On mobile, dialog/drawer go full-screen regardless of `size`. (The `max-w-*` values above are this project's design-system choices — a project reusing this skill should retune the `*_SIZE_CLASS` maps to its own scale.)

A dense create/edit form usually wants `size: 'lg'`.

## `body` vs `children`

Both `openZodFormDialog` and `openZodFormDrawer` accept a `body` prop. It is **not** the same as `children`:

| Prop | Position | Use for |
|---|---|---|
| `body` | Above the form, **outside** `<form>` (between title and fields) | Info banner, read-only summary, context |
| `children` | **Inside** `<form>`, between fields and the error banner | Extra inputs managed outside the schema, legal checkbox, live preview |

## Mounting the singletons

`<ZodFormDialog />` and `<ZodFormDrawer />` must each be rendered **once** at the app root:

```tsx
function App() {
  return (
    <>
      <RouterProvider ... />
      <ZodFormDialog />
      <ZodFormDrawer />
      <Toaster />
    </>
  );
}
```

If `openZodFormDialog(...)` does nothing, the singleton isn't mounted.
