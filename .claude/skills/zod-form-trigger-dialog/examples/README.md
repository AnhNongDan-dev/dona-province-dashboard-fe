# zod-form-trigger-dialog — examples

These are working trigger-dialog components adapted from the ELP-fe codebase to an
illustrative `indicator-group` domain (a tree of indicator groups — this repo has no
entities yet). They are the canonical, no-special-cases shape — start here
when building a new `<XxxCreateDialog>` / `<XxxEditDialog>`.

| File | Demonstrates |
|------|--------------|
| `indicator-group-create.dialog.example.tsx` | The minimal **create** trigger: `children: ReactElement`, `<PermissionCheck>` gate, `Slot` from `@radix-ui/react-slot`, an async opener that pre-fetches dropdown options via a repository `.loader()` before `openZodFormDialog`, and `onSuccess` = toast + invalidate only. |
| `indicator-group-edit.dialog.example.tsx` | The **edit** trigger: entity passed in via a **typed, narrowed prop** (`Pick<IndicatorGroup, ...>`), `defaultValues` filled from it, and a `contractAPI` that merges form output with a derived field (`clearParent`) before the PUT. Shows excluding self from the parent options. |
| `indicator-group-row-actions.example.tsx` | The **call site**: a `DropdownMenu` row-action menu where the edit trigger wraps a plain `<DropdownMenuItem>` — no `onSelect={(e) => e.preventDefault()}` needed, because the imperative `openZodFormDialog` mounts at the app root, so the menu may close immediately. |

## Porting notes

The imports are project-specific — relocate them when reusing in another project:

| Symbol | This project's location | What it is |
|--------|-------------------------|------------|
| `openZodFormDialog` | `@/components/global/zod-form.dialog` | imperative opener that mounts a ZodForm in a dialog at app root |
| `PermissionCheck` | `@/components/permission-check` | gate that renders children only if the user holds the permission |
| `clientAPI` | `@/config/clientAPI.config` | typed ts-rest client |
| `listIndicatorGroupsRepository` / `invalidateAll...` | `@/repositories/...` | TanStack-Query repository (see the **repository-pattern** skill) |
| `indicatorGroupContract` | `@repo/zod-schemas/.../indicator-group.contract` | ts-rest contract; `.createIndicatorGroup.body` / `.updateIndicatorGroup.body` are the form schemas |

The structural pieces — `Slot`, the `children: ReactElement` prop, the `<PermissionCheck>`
wrapper, and the async opener calling an imperative `openZodFormDialog` — are the parts to keep.
