# ZodForm — Extending the System

This file is for changing **ZodForm itself** — not for building a form. Read it when you want to add a field renderer, a `commonZod` helper, a `displayOption`, or an overlay size. Each task below lists the exact files to touch, in order.

## The design contract — keep each piece doing one job

ZodForm stays easy to extend only because the responsibilities are split and never merged. Honour the split when you add to it:

| Piece | Sole job | File |
|---|---|---|
| `SCHEMA_DESCRIPTION` | Name a field *kind* | `common.ts` |
| `commonZod` helper | A reusable schema that carries that marker | `common.ts` |
| `getFinalTypeName` / `getSchemaDescription` | Unwrap Zod wrappers to find type/description | `zod.utils.ts` |
| `analyzeSchema` | Map schema shape → `FieldInfo[]` | `zod-form.tsx` |
| `getFieldType` | **Classify** one field → a special-type string | `zod-field.tsx` |
| `ZodField` | **Dispatch** — pick the renderer, pass props | `zod-field.tsx` |
| `fields/*.field.tsx` | **Render** one input, bound to `formField` | `fields/` |

The smell to avoid: putting *detection* logic inside `ZodField`'s JSX, or *rendering* logic inside `getFieldType`. Detection answers "what is this field?" and lives in `getFieldType`; `ZodField` only maps an answer to a component; the component only renders. A new field type touches each layer once — never one layer five times.

## Task 1 — Add a new field renderer (e.g. a colour picker)

Five steps, one per layer. Example: a `COLOR` field rendered by a `ColorField`.

**1. Add the marker** — `packages/zod-schemas/src/common.ts`, in `SCHEMA_DESCRIPTION`:

```ts
export const SCHEMA_DESCRIPTION = {
  // ...existing...
  COLOR: "COLOR",
} as const;
```

**2. Add a `commonZod` helper** that attaches the marker:

```ts
// in commonZod
color: z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Mã màu không hợp lệ")
  .describe(SCHEMA_DESCRIPTION.COLOR),
```

The underlying type is `string`, which is already in `analyzeSchema`'s allowlist — so **no change to `getFinalTypeName`**. (You'd only touch `getFinalTypeName` if the new field's *final* Zod type is something `analyzeSchema` rejects — that's why `DATETIME` has a special case there: a `z.date()` would otherwise resolve to `"date"`. Build new types on `string` / `number` to skip this.)

> **Keep `.describe()` reachable.** Detection (`getFieldType`) reads `schema.description` directly and only recurses through `ZodOptional / ZodCatch / ZodNullable` — not `ZodDefault / ZodPipe / ZodReadonly`. So put `.describe(SCHEMA_DESCRIPTION.COLOR)` **outermost** (as above), or at most behind `.optional()` / `.catch()` / `.nullable()`. A helper written `…describe(MARKER).default(x)` puts the description below a `ZodDefault` that `getFieldType` won't unwrap — the field would silently fall through to `unknown`. See [field-types.md](field-types.md) → "How `getFieldType` reads the description".

**3. Classify it** — `zod-field.tsx`, `getFieldType`, alongside the other `description ===` checks:

```ts
if (description === SCHEMA_DESCRIPTION.COLOR) return "color" as const;
```

Placement matters only relative to other rules that could also match — see "Where to place a new rule" below. Note that `getFieldType`'s *classification* order is independent of `ZodField`'s *render* order: `TEXTAREA`, for instance, is classified early here but rendered late (step 5's render chain decides priority). Where you put this `description ===` line does not change render priority.

**4. Build the field component** — `fields/color.field.tsx`. Mirror an existing simple field (`email.field.tsx` is the smallest). The contract: it receives the RHF `formField` and renders an input bound to it.

```tsx
import type { ComponentProps } from "react";
import type { ControllerRenderProps, FieldValues } from "react-hook-form";

const ColorField = ({
  formField,
  ...props
}: {
  formField: ControllerRenderProps<FieldValues, string>;
} & ComponentProps<"input">) => {
  return (
    <input
      {...props}
      type="color"
      value={formField.value ?? "#000000"}
      onChange={(e) => formField.onChange(e.target.value)}
    />
  );
};

export default ColorField;
```

- Always pass `ControllerRenderProps` its **second generic argument** (`<FieldValues, string>`). That argument is the field *path-name* type — always `string` in this codebase — and `FieldPath<FieldValues>` resolves to `string`, so `string` is always correct. Omitting it defaults the argument to `any`, which the project's no-`any` rule forbids. (It is **not** the field *value* type — don't write `<FieldValues, number>` for a numeric field; that's a type error. Mirror an existing field like `email.field.tsx` / `money.field.tsx`, which all use `<FieldValues, string>`.)
- `disabled` / `readonly` are passed in by `ZodField` (step 5). Naming is inconsistent in the codebase: native-input wrappers receive `readOnly` (the HTML prop — spreading `ComponentProps<"input">` covers it); custom Radix/compound components receive `readonly` (lowercase). Follow the component you mirror.
- Read `formField.value`, write via `formField.onChange`. Keep all rendering here — don't leak it back into `ZodField`.

**5. Dispatch to it** — `zod-field.tsx`, add a ternary arm to the `ZodField` render chain. For a renderer that should always win, put it in the **strong group** — i.e. after the last strong-group arm (`fieldType === "uploadFiles"`) and **before** the `searchOptionsFn ?` check:

```tsx
) : fieldType === "color" ? (
  <ColorField formField={formField} disabled={disabled} readOnly={readonly} />
```

Done. Any schema using `commonZod.color` now renders the picker. Update [field-types.md](field-types.md)'s detection table so the skill stays accurate.

### Where to place a new rule in `getFieldType`

`getFieldType` is match-first. Order matters only when two rules could match the same field:

- A **description**-based rule (most new types) can't collide with another description rule — one schema has one description. Place it with the other `description ===` checks.
- A **name**-based rule (like `username` / `password`) can collide with a type rule. Keep the most specific (instance-type) checks first — that's why `ZodEmail` is rule 1.

### Where to place a new branch in the `ZodField` render chain

- A renderer that should always win regardless of `displayOptions` → the **strong group** at the top (with email/date/file).
- A renderer driven by a `displayOption` (like `selectOptions`) → in the displayOption group, ordered by how specific it is.
- Remember: the `textarea` branch sits *after* the displayOption group. If your new type must beat `selectOptions`, put it in the strong group, not near `textarea`.

## Task 2 — Add a `commonZod` helper that reuses an existing renderer

No new renderer needed — just a new schema. Add it to `commonZod` with the existing marker:

```ts
// a stricter note that still renders as a Textarea
shortNote: z.string().max(200, "Tối đa 200 ký tự").describe(SCHEMA_DESCRIPTION.TEXTAREA),
```

That's the whole change. Detection already handles `TEXTAREA`.

## Task 3 — Add a new `displayOption`

Two steps, and **both are required** — declaring the field on the type without wiring it is the bug that left `onFileDownload` and `selectMultiple` dead.

**1. Declare it** on `FieldDisplayOption` in `zod-field.tsx`.

**2. Consume it** — destructure it from `displayOption` inside `ZodField` and pass it to the renderer (or use it in the `FormItem` / chain). If it isn't destructured and used, it does nothing.

After both, add it to the `FieldDisplayOption` reference in [field-types.md](field-types.md) and the `ZodFormProps` block in `SKILL.md`.

## Task 4 — Add a new overlay size token

`OverlaySize` is one shared union (`@/lib/overlay-size`) consumed by three independent maps. To add `'2xl'`:

1. Add `'2xl'` to the `OverlaySize` union in `@/lib/overlay-size`.
2. Add a `'2xl'` entry to **each** size map — `DIALOG_SIZE_CLASS` (`zod-form.dialog.tsx`), `DRAWER_SIZE_CLASS` (`zod-form.drawer.tsx`), `ALERT_SIZE_CLASS` (`ui/alert-dialog.tsx`). TypeScript forces this — a `Record<OverlaySize, string>` won't compile until every key is present.

To change what an *existing* token resolves to, edit just the relevant map — never a call-site className. See [rendering-modes.md](rendering-modes.md) → "Width".

## Task 5 — Change overlay behaviour (rare)

- **Make the drawer respect `blockOutsideClick`** — its `onInteractOutside` handler in `zod-form.drawer.tsx` is currently a commented-out no-op. Uncommenting `if (data?.dialogOptions?.blockOutsideClick) event.preventDefault();` (and accepting the `event` arg) wires it up.
- **Wire OTP auto-submit** — `InputOTP` in `zod-field.tsx` has `onComplete={() => onSubmit()}` commented out. `onSubmit` would need threading from `ZodFormFields` into `ZodField` first.
- **A new render mode** (e.g. a fullscreen sheet) — clone `zod-form.dialog.tsx`: a singleton listening on two new event-bus events, plus an `openZodFormSheet` emitter. Reuse `<ZodForm>` inside. Mount the new singleton once at the app root next to `<ZodFormDialog />` / `<ZodFormDrawer />` (see [rendering-modes.md](rendering-modes.md) → "Mounting the singletons") — forgetting this is why `open…` calls silently do nothing. Add the close event to `ZodForm`'s `onSuccess` wrapper if it should auto-close.

## After any extension

- Run `pnpm lint` — a missing `Record<OverlaySize, …>` key is a **compile-time** type error. But `analyzeSchema`'s type allowlist throws at **render time** (a runtime `Error`), not at compile time — exercise the new field in the running app to catch that path.
- Update the affected reference file(s) so the skill never drifts from the code — an inaccurate skill is worse than none.
