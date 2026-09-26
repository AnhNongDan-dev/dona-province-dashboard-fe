# ZodForm — Architecture

How the pieces fit together. Read this when something isn't rendering as expected and you need to know *why*, or before [extending.md](extending.md).

## Data flow

```
schema: ZodObject  (from contract: .pick/.omit/.extend/.superRefine)
   │
   ▼  analyzeSchema(schema)
FieldInfo[]  — one entry per key: { fieldName, type, required }
   │            type ∈ string | number | boolean | datetime | enum | array | object
   ▼
<ZodField> rendered per (FieldInfo, displayOption)
   │
   ▼  getFieldType(fieldName, fieldSchema)   → a "special type" string, or "unknown"
   │
   ├─ special type  → dedicated renderer (email, date, file, money, …)
   └─ "unknown"     → render chain: searchOptionsFn → cardRadio → toggle → radio
                      → select → otp → textarea → Input/Checkbox by FieldInfo.type
```

## File layout

| File | Role |
|---|---|
| `apps/frontend/src/components/zod-form/zod-form.tsx` | `ZodForm` (default export), `ZodFormProps`, `createZodFormProps`, `analyzeSchema` (internal) |
| `apps/frontend/src/components/zod-form/zod-field.tsx` | `ZodField` (default export), `FieldDisplayOption` + `FieldInfo` types, `getFieldType` (internal) |
| `apps/frontend/src/components/zod-form/form-error-message.tsx` | `FormErrorMessage` — inline per-field error text |
| `apps/frontend/src/components/zod-form/fields/` | Specialized field components (see below) |
| `apps/frontend/src/components/global/zod-form.dialog.tsx` | `openZodFormDialog`, `ZodFormDialog`, `ZodFormDialogEvent`, `DIALOG_SIZE_CLASS` |
| `apps/frontend/src/components/global/zod-form.drawer.tsx` | `openZodFormDrawer`, `ZodFormDrawer`, `ZodFormDrawerEvent`, `DRAWER_SIZE_CLASS` |
| `apps/frontend/src/hooks/use-contract-form.tsx` | `useContractForm` — `useForm` + `zodResolver` + `useMutation` |
| `packages/zod-schemas/src/common.ts` | `SCHEMA_DESCRIPTION` enum + `commonZod` helpers |
| `packages/zod-schemas/src/zod.utils.ts` | `getFinalTypeName` + `getSchemaDescription` (wrapper-type unwrapping) |

### Fields directory

`card-radio-group.field` · `citizen-id.field` · `date-picker.field` · `date-time-picker` · `email.field` · `file-preview.field` · `file-upload.field` · `gender.field` · `money.field` · `password.field` · `phone.field` · `radio-group.field` · `time-picker.field` · `toggle-group.field` · `username.field`

To add another, see [extending.md](extending.md).

## `analyzeSchema` (zod-form.tsx)

```ts
analyzeSchema(schema) =>
  Object.entries(schema.shape).map(([key, fieldSchema]) => {
    const type = getFinalTypeName(fieldSchema);   // a type name, or "unknown" — never throws
    // analyzeSchema then validates `type` against the 7-name allowlist
    // (via z.enum([...]).safeParse) and throws Error(...) if it isn't one of them
    return {
      fieldName: key,
      type,
      required: !fieldSchema.safeParse(undefined).success
             && !fieldSchema.safeParse(null).success,
    };
  })
```

- **`type`** comes from `getFinalTypeName`, which unwraps `ZodPipe / ZodCatch / ZodOptional / ZodNullable / ZodDefault / ZodReadonly / ZodPrefault / ZodNonOptional` recursively, and returns `"datetime"` for anything whose (unwrapped) description is `SCHEMA_DESCRIPTION.DATETIME`. `getFinalTypeName` itself **never throws** — it returns `"unknown"` for an unrecognised type. The throw is `analyzeSchema`'s own: it runs `z.enum([...]).safeParse(type)` against the allowlist `string | number | boolean | datetime | enum | array | object`, and if `type` isn't one of those it **throws loudly** at render time.
- **`required`** is `true` only when the field rejects **both** `undefined` and `null`. So `.optional()`, `.default(...)`, `.catch(...)`, **and `.nullable()`** all make a field non-required and drop the red `*` from its label. You never set `required` by hand — if the asterisk is wrong, the schema is wrong.

## `getFieldType` (zod-field.tsx)

A priority-ordered, match-first function. It returns one of:

`email | username | password | dateTime | dateOnly | timeOnly | textarea | phone | citizenId | gender | money | previewFiles | uploadFiles` — or `"unknown"`.

It runs **before** the render chain. When it returns `"unknown"`, `ZodField` falls through to the displayOption-driven renderers.

`getFieldType` reads `schema.description` **directly** off the field schema. Its unwrap recursion peels `ZodOptional / ZodCatch / ZodNullable` — but **only when that wrapper carries no description**. It does **not** call `getSchemaDescription`, and it does **not** unwrap `ZodDefault / ZodPipe / ZodReadonly / ZodPrefault`. So `commonZod.previewFiles.optional()` still resolves to `previewFiles` (the `ZodOptional` is peeled to reach the inner description), while `z.string().optional()` correctly resolves to `unknown`. The catch: a `.default(...)` stacked on top of a described helper hides the description from detection — see [field-types.md](field-types.md) → "How `getFieldType` reads the description". (Detection and `getFinalTypeName`'s type-resolution therefore have *different* unwrap depth — only the latter uses `getSchemaDescription`.)

## The render chain (zod-field.tsx)

`ZodField` renders the first matching branch of one long ternary. The order is **not** the same as `getFieldType`'s order — this is the source of the "textarea is weak" surprise. The 11 positions below are *render-chain* positions; [field-types.md](field-types.md) explodes the same system into a 21-row effective-priority table — same behaviour, finer granularity.

```
1. getFieldType result, "strong" group:
   email · phone · citizenId · gender · money · username · password
   · dateTime · dateOnly · timeOnly · previewFiles · uploadFiles
2. displayOption.searchOptionsFn   → AsyncSearchCombobox (multiple if ZodArray)
3. displayOption.cardRadioOptions  → CardRadioGroupField
4. displayOption.toggleOptions     → ToggleGroupField
5. displayOption.radioOptions      → RadioGroupField
6. displayOption.selectOptions     → CommitSelect
7. fieldName is otp/totp           → InputOTP
8. getFieldType result "textarea"  → Textarea
9. FieldInfo.type string|number    → Input
10. FieldInfo.type boolean         → Checkbox
11. otherwise                      → null  (invisible field — a bug; see common-pitfalls.md)
```

Group 1 beats every displayOption. `textarea` (step 8) is checked *after* steps 2–7, so a textarea field that also has `selectOptions` renders the select. Enum/array/object types reach step 11 (`null`) unless a step 2–6 displayOption catches them.

## `useContractForm` (use-contract-form.tsx)

```ts
useContractForm({ schema, contractAPI, onSuccess, onError, defaultValues, mode })
  → { methods, isPending, onSubmit }
```

- Uses `zodResolver(schema, undefined, { raw: true })`. `raw: true` hands react-hook-form the *unparsed* values; the mutation re-parses with `schema.parse(body)` before calling `contractAPI`. That's why `contractAPI` receives `z.infer<TSchema>` (output) while `defaultValues` is typed `z.input<TSchema>`.
- On a `{ success: false }` response: the failure branch carries `errors: Array<{ fieldName: string | null; message: string }>`. For each entry with a **truthy** `fieldName`, `methods.setError(fieldName, { message })` is called (entries with a null `fieldName` are skipped — they aren't field-level errors). Separately, `res.message` is written to the virtual `_errorMessage` field. `_errorMessage` is **not** in the schema — it's a `_`-prefixed pseudo-field rendered as the red `Alert` banner above the submit button. Then `onError?.(res, payload)` fires.
- A thrown error (network/parse) is **not** routed to `onError` — `onError` only fires for controlled `{ success: false }` responses.

## Auto-close — the overlay closes itself

`ZodForm` wraps the `onSuccess` you pass:

```ts
// inside ZodForm
onSuccess: (...args) => {
  onSuccess(...args);            // your callback (toast, invalidate, navigate…)
  ZodFormDialogEvent.close();    // always fires
  ZodFormDrawerEvent.close();    // always fires
}
```

So after a successful submit, **both** the dialog and the drawer close — automatically, regardless of which one (if any) is open. Consequences:

- `onSuccess` should **not** call `.close()` — it's redundant.
- The close fires right after `onSuccess` is *invoked* (synchronously). If your `onSuccess` is `async`, its `await`s resolve *after* the overlay has already closed — fine, because toast/invalidate don't need the overlay mounted.
- On **error**, nothing closes — the overlay stays so the user can read the `_errorMessage` banner and fix the form.
- You only call `.close()` yourself in non-submit paths (a cancel button, a multi-step wizard step) — never in a standard create/edit `onSuccess`.

## Rendering pipeline

1. `ZodForm` calls `analyzeSchema(schema)` (cheap — `schema.shape` is a plain object).
2. `useContractForm` returns `{ methods, isPending, onSubmit }`.
3. `FormProvider {...methods}` wraps `ZodFormFields`.
4. `ZodFormFields` calls `useWatch({ control })` → all current values → `watchEffect(values)` → per-field display overrides.
5. For each `displayOptions` entry, `ZodField` renders with `{ ...displayOption, ...overrides[fieldName] }`. `hidden` (after merge) skips render.
6. Each `ZodField` wraps `<FormField>` (RHF Controller) → `<FormItem>` → label → `<FormControl>` renderer → optional `helpText` → `<FormErrorMessage>`.

## Children render order

Inside `ZodFormFields`, the `<form>` body is:

```
<div className='grid …'>{fields}</div>   ← schema-driven, from displayOptions
{children}                                ← your extra content
{_errorMessage alert}                     ← red banner, when the server returns a general error
<div className='w-full flex'><LoadingButton type='submit'/></div>
```

Your `children` land between the fields and the error banner. Don't use `children` to fake a submit button — use `submitBtn`.

### Double-submit guard — `pointer-events-none`

The submit `LoadingButton` is `type='submit'`, so a click fires both the button's `onClick` and the form's native `onSubmit`. The form's `onSubmit` has no guard of its own, so the button gets `className={cn(submitBtn.className, isPending && 'pointer-events-none')}` — blocking repeat clicks at the CSS layer while the mutation is in flight, with no dependency on a React re-render.

## Dialog vs drawer event bus

Both overlays use a tiny event bus (`@/lib/event-bus`). `<ZodFormDialog />` / `<ZodFormDrawer />` are mounted **once** at the app root; they listen for `OPEN_/CLOSE_ZOD_FORM_DIALOG` / `_DRAWER` and render the payload. This is why `openZodFormDialog({...})` works from anywhere — a row action, a menu item, a plain handler — with no prop-drilling and no local `<Dialog>` mount.

If `openZodFormDialog(...)` does nothing, the root singleton isn't mounted — see [rendering-modes.md](rendering-modes.md) → "Mounting the singletons".
