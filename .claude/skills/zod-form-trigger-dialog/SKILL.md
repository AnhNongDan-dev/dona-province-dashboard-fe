---
name: zod-form-trigger-dialog
description: |
  Build the `<XxxCreateDialog>` / `<XxxEditDialog>` trigger components that wrap a button (or `DropdownMenuItem`) and open a ZodForm dialog in place — replacing standalone `.../new` and `.../edit/$id` route pages and `<Link>`-based navigation. Keeps the user where they were (no scroll/filter/tab loss). Covers the file layout (`-<entity>-create.dialog.tsx` colocated next to the route), entity-first naming (`DistrictCreateDialog`, `DistrictEditDialog`), `Slot` from `@radix-ui/react-slot` to avoid wrapper DOM, `<PermissionCheck>` as a built-in gate so the trigger auto-hides, the `children: ReactElement` constraint that forces TypeScript to require exactly one element, and why a `DropdownMenuItem` trigger stays plain (no `onSelect={preventDefault}`) — the imperative `openZodFormDialog` mounts at the app root, so the menu can close immediately. **Use whenever the user wants to add a "Tạo X" / "Cập nhật X" button, replace a `/new` or `/edit` page with an in-place dialog, refactor a `<Link to=".../new">` button into a dialog trigger, build a row-action edit menu item that opens a form, gate a create/edit action by permission, or wrap any trigger element so a click opens a ZodForm — even if they don't say "trigger component" explicitly.**
---

# ZodForm Trigger Dialog

> Companion to the **zod-form** skill. This skill is the **wrapper component** that opens a create/edit form. The zod-form skill is the **form's contents** (schema, displayOptions, contractAPI, field detection, validation). Read zod-form first if you haven't.

> **Not ported yet.** Needs the zod-form runtime (see the note in the **zod-form** skill) plus `<PermissionCheck>` (`ELP-fe/apps/frontend/src/components/permission-check.tsx`), the permission model (`ELP-fe/packages/zod-schemas/src/permission/`), `use-page-name.ts` (`ELP-fe/apps/frontend/src/hooks/use-page-name.ts`) and `Slot` (add `@radix-ui/react-slot`, or use `Slot` from the already-installed `radix-ui` package). Port those first.

## Why this pattern exists

Old approach: a list page links to `/widgets/new`; an edit row-action links to `/widgets/$id/edit`. Both navigate to a separate page — the user loses scroll position, list filters, the active detail tab, and pagination, and pays a route load + skeleton flash.

New approach: a `<WidgetCreateDialog>` / `<WidgetEditDialog>` component wraps the trigger button. A click opens a ZodForm dialog in place. The user stays put. The standalone `/new` and `/edit/$id` routes are deleted.

This is the **default** for every entity create/edit action in this codebase.

## Reusing this pattern in another project

The pattern (a permission-gated `Slot` wrapper that imperatively opens a form dialog) is project-agnostic. The bindings it depends on — `openZodFormDialog`, `<PermissionCheck>`, `clientAPI`, the repositories — are the same set the zod-form skill lists; remap them per [zod-form `references/project-setup.md`](../zod-form/references/project-setup.md). Two extras specific to this skill:

- **`Slot`** comes from the `@radix-ui/react-slot` package — a separate dependency the target project must install (or substitute a `cloneElement`-based equivalent).
- **`use-page-name.ts`** (referenced in rule 6 / the refactor checklist) is a project-specific breadcrumb/title hook. Another project may name it differently or not have one — substitute or drop that step.

## Worked example — the `indicator-group` trio

[`examples/`](examples/) holds a complete, copy-ready create + edit + call-site trio (the cleanest, no-special-case implementation, adapted from ELP-fe). Start there:

- [`indicator-group-create.dialog.example.tsx`](examples/indicator-group-create.dialog.example.tsx) — the minimal create trigger (gate, `Slot`, async opener that pre-fetches options).
- [`indicator-group-edit.dialog.example.tsx`](examples/indicator-group-edit.dialog.example.tsx) — the edit trigger (typed `Pick<>` prop, `defaultValues` from the entity, derived field in `contractAPI`).
- [`indicator-group-row-actions.example.tsx`](examples/indicator-group-row-actions.example.tsx) — the call site (plain `<DropdownMenuItem>`, no `onSelect` preventDefault).

---

## File layout

Colocate the dialog component beside the route, prefix `-` so TanStack Router ignores it:

```
routes/.../widgets/
├── -components/
│   ├── widget-create.dialog.tsx       # exports <WidgetCreateDialog>
│   ├── widget-edit.dialog.tsx         # exports <WidgetEditDialog>
│   └── widgets-data-table.tsx
├── index.tsx                          # list page (no route to /new anymore)
└── $id/index.tsx                      # detail page (no edit.tsx sibling)
```

Naming: **entity-first** — `WidgetCreateDialog`, `WidgetEditDialog`. Groups every action for an entity in IDE autocomplete (`Widget…` → `WidgetCreateDialog`, `WidgetEditDialog`, `WidgetDeleteConfirm`, …).

File suffix `.dialog.tsx` matches the codebase convention (`zod-form.dialog.tsx`, `global-alert.dialog.tsx`).

---

## Skeleton — create

```tsx
// -components/widget-create.dialog.tsx
import { Slot } from '@radix-ui/react-slot';
import { widgetContract } from '@repo/zod-schemas/src/api-contract/widget.contract';
import type { ReactElement } from 'react';
import { toast } from 'sonner';
import { openZodFormDialog } from '@/components/global/zod-form.dialog';
import PermissionCheck from '@/components/permission-check';
import { clientAPI } from '@/config/clientAPI.config';
import { invalidateAllSearchWidgetsQueries } from '@/repositories/searchWidgets.repository';

const formSchema = widgetContract.createWidget.body;

interface WidgetCreateDialogProps {
  children: ReactElement;     // ⚠ ReactElement — see rule 1
}

export function WidgetCreateDialog({ children }: WidgetCreateDialogProps) {
  return (
    <PermissionCheck permission="create:widget">
      <Slot onClick={openWidgetCreateDialog}>{children}</Slot>
    </PermissionCheck>
  );
}

function openWidgetCreateDialog() {
  openZodFormDialog({
    title: 'Tạo widget',
    schema: formSchema,
    defaultValues: { name: '', description: null },
    displayOptions: {
      name: { label: 'Tên', colSpan: 6 },
      description: { label: 'Mô tả', colSpan: 6 },
    },
    contractAPI: (body) => clientAPI.Widget.createWidget({ body }),
    onSuccess: async () => {
      toast.success('Đã tạo widget');
      await invalidateAllSearchWidgetsQueries();
      // No close() — ZodForm closes the dialog itself on success. See rule 7.
    },
    submitBtn: { text: 'Tạo' },   // dialog right-aligns the button automatically
  });
}
```

## Skeleton — edit

Edit takes the entity through a typed prop (not via `children`):

```tsx
// -components/widget-edit.dialog.tsx
interface WidgetEditDialogProps {
  children: ReactElement;
  widget: Pick<WidgetDetailDTO, 'id' | 'name' | 'description' | 'version'>;  // narrow to what defaultValues reads
}

export function WidgetEditDialog({ children, widget }: WidgetEditDialogProps) {
  return (
    <PermissionCheck permission="edit:widget">
      <Slot onClick={() => openWidgetEditDialog(widget)}>{children}</Slot>
    </PermissionCheck>
  );
}

function openWidgetEditDialog(widget: WidgetEditDialogProps['widget']) {
  openZodFormDialog({
    title: 'Cập nhật widget',
    schema: widgetContract.updateWidget.body,
    defaultValues: {
      id: widget.id,
      name: widget.name,
      description: widget.description,
      version: widget.version,
    },
    displayOptions: {
      id: { hidden: true },
      version: { hidden: true },
      name: { label: 'Tên', colSpan: 6 },
      description: { label: 'Mô tả', colSpan: 6 },
    },
    contractAPI: (body) =>
      clientAPI.Widget.updateWidget({ params: { widgetId: widget.id }, body }),
    onSuccess: async () => {
      toast.success('Đã cập nhật');
      await Promise.all([
        widgetDetailRepository(widget.id).invalidate(),
        invalidateAllSearchWidgetsQueries(),
      ]);
    },
    submitBtn: { text: 'Lưu thay đổi' },
  });
}
```

---

## Call sites

```tsx
// 1. List-page toolbar
<WidgetCreateDialog>
  <Button size="sm"><Plus /> Tạo widget</Button>
</WidgetCreateDialog>

// 2. Row-action dropdown — plain DropdownMenuItem, let Radix close the menu
<DropdownMenuContent>
  <WidgetEditDialog widget={row.original}>
    <DropdownMenuItem>
      <Pencil /> Cập nhật
    </DropdownMenuItem>
  </WidgetEditDialog>
</DropdownMenuContent>

// 3. Detail-page header (replaces an old "Edit" Link button)
<WidgetEditDialog widget={widget}>
  <Button size="sm" variant="outline"><Pencil /> Cập nhật</Button>
</WidgetEditDialog>
```

---

## Hard rules — easy to break

### 1. `children: ReactElement`, not `ReactNode`

The point of `Slot` is to forward `onClick` (and refs) onto exactly one element. `ReactNode` would let callers pass nothing, a string, or multiple children — `Slot` can't handle any of those.

```tsx
interface Props { children: ReactElement; }   // ✅ TS rejects empty / string / multiple children
```

### 2. Always wrap in `<PermissionCheck permission="...">`

The component **is** the permission gate — callers shouldn't add it themselves. Lacking the permission, the trigger renders nothing.

Permission codes follow `<verb>:<entity>` (`create:district`, `edit:district`). Find the exact code in `packages/zod-schemas/src/permission/<entity>-permission.ts`. If the entity has no permission yet, add it there first (per the project's `permission-check.md` rule), then reference it.

### 3. Use `Slot` from `@radix-ui/react-slot` — never `<span onClick>` / `<div onClick>`

`Slot` clones `children` and merges its props (`onClick`, `ref`) into the existing element — no extra DOM wrapper. This matters in two places:

- **Inside a Radix menu**: `DropdownMenuItem` must be a direct child of `DropdownMenuContent` for keyboard nav and focus to work. A `<span>` wrapper breaks that.
- **Around a `Button`**: a wrapper changes the click hitbox and can disrupt parent flex/grid alignment.

### 4. `DropdownMenuItem` children stay plain — do **not** add `onSelect={(e) => e.preventDefault()}`

`Slot`'s merged `onClick` runs synchronously, so `openZodFormDialog(...)` finishes pushing the dialog onto the global event store **before** Radix closes the menu. The dialog mounts at the app root, not inside the dropdown's React subtree, so it survives the menu — and the menu item — unmounting.

`e.preventDefault()` here would only suppress the menu's auto-close, leaving it visibly open behind the dialog. Let the menu close. Use `preventDefault()` only when the dialog is *controlled and rendered inside the trigger's subtree* — which the imperative `openZodFormDialog` is not.

### 5. Edit dialog: pass the entity via a typed prop

Use the **narrowest** type that covers what `defaultValues` reads — usually `Pick<XxxDetailDTO, ...>`. That makes the dialog reusable across list rows (a lighter `XxxItem` type) and detail pages (full `XxxDetail`), as long as both include the picked fields. Don't pass the entity via context, a store, or a global — it's dialog-specific input; keep it explicit on the prop.

### 6. Delete the old `new.tsx` and `$id/edit.tsx` routes

Once the trigger components replace every call site, delete the standalone route files, and remove their entries from `apps/frontend/src/hooks/use-page-name.ts` (otherwise breadcrumbs reference dead routes). Run `pnpm lint` to catch leftover `<Link to="…/new">` references.

### 7. `onSuccess` does toast + invalidate — **not** `close()`

`ZodForm` closes the dialog itself after a successful submit (it fires `ZodFormDialogEvent.close()` / `ZodFormDrawerEvent.close()` internally — see the zod-form skill's `architecture.md` → "Auto-close"). So `onSuccess` should only do its real work:

```tsx
onSuccess: async () => {
  toast.success('Đã tạo');
  await invalidateAllSearchWidgetsQueries();
  // nothing else — the dialog is already on its way out
},
```

A trailing `ZodFormDialogEvent.close()` is redundant; older call sites still have it (cargo-culted) — don't copy them. On **error**, the dialog stays open so the user sees the error banner — also automatic.

### 8. Widen a dense form with `dialogOptions.size` — never a className

Create/edit forms with many fields need a wider dialog. Pass the shared size token, not a `max-w-*` className:

```tsx
openZodFormDialog({ title: 'Tạo widget', schema: formSchema, /* … */, dialogOptions: { size: 'lg' } });
```

`size` (`'sm' | 'md' | 'lg' | 'xl'`) is the only sanctioned width control — see the zod-form skill, `rendering-modes.md` → "Width". A raw className (or an invented `contentClassName` prop) is the wrong pattern.

---

## When NOT to use a wrapper component

Trigger components are for **entity create/edit actions where the trigger is a button or menu item rendered inline in JSX**. When the trigger isn't a JSX element, skip the wrapper and export a plain opener function that calls `openZodFormDialog(...)` directly:

```tsx
// -widget-form.dialog.tsx — no wrapper component, just the opener
export function openWidgetCreateDialog() { openZodFormDialog({ /* … */ }); }
```

This is the right shape when:

- The dialog isn't a CRUD action (a one-off filter dialog, a settings dialog, an action-confirm with one input).
- The trigger isn't a JSX element (a toast action callback, a keyboard shortcut, a post-mutation follow-up).
- The form depends on runtime values not known until click time (a row id picked via checkbox, then a "Bulk edit" button).
- The caller already gates the action (e.g. the row-action button is itself inside a `<PermissionCheck>`), so a second gate inside the dialog would be redundant.

Some entities (in ELP-fe, e.g. resource, resource-category) use this plain-opener form because their callers aren't simple JSX triggers — that's a legitimate variant, not a violation. For everything that fits "a button/menu item that creates or edits entity X", default to the wrapper component.

---

## Refactoring an existing `<Link>`-based flow — checklist

- [ ] Read the old `new.tsx` / `edit.tsx` to grab the schema, displayOptions, defaultValues, contractAPI, onSuccess
- [ ] Find the permission code in `packages/zod-schemas/src/permission/<entity>-permission.ts`
- [ ] Create `-<entity>-create.dialog.tsx` — `<XxxCreateDialog>`, gated by `PermissionCheck`, opening the dialog via `Slot onClick`
- [ ] Create `-<entity>-edit.dialog.tsx` — `<XxxEditDialog>` taking the entity through a typed prop
- [ ] Replace every `<Link to=".../new">` with `<XxxCreateDialog>{trigger}</XxxCreateDialog>`
- [ ] Replace every `<Link to=".../edit">` with `<XxxEditDialog widget={...}>{trigger}</XxxEditDialog>`. If the trigger is a `DropdownMenuItem`, drop `asChild` and leave it plain
- [ ] Confirm no `onSuccess` calls `.close()` — the form closes itself (rule 7)
- [ ] Delete `new.tsx` and `$id/edit.tsx`; remove their entries from `use-page-name.ts`
- [ ] Run `pnpm lint` — fix leftover broken `<Link>` references
- [ ] Smoke test: create + edit from list toolbar, edit from row dropdown, edit from detail header. Confirm filter / scroll / active tab survive closing the dialog
