---
name: zod-form
description: |
  Build forms (create, edit, action-confirm, modal) from a Zod v4 schema + displayOptions. Covers the 6-column responsive grid, inline vs. dialog vs. drawer rendering, SCHEMA_DESCRIPTION-driven field detection, readonly/hidden edit locks, commonZod helpers (datetime, dateOnly, timeOnly, textarea, money, phone, gender, citizenIdNo, uploadFiles, previewFiles, newPassword), file-upload flows with S3 + existing-file preview, cross-field validation via superRefine on the form-side schema (never on the contract), dynamic field visibility via watchEffect, and extra content via children. **Use whenever the user asks to create/edit a form, add a modal/drawer form, wire a Zod schema to a UI, validate input with Zod, add a field to an existing ZodForm, add a new field renderer to the ZodForm system, or handle file upload in a form — even if they don't say "ZodForm" explicitly.** For wrapping a trigger button that opens a create/edit dialog (the `<XxxCreateDialog>` / `<XxxEditDialog>` pattern that replaces `.../new` and `.../edit` pages), see the **zod-form-trigger-dialog** skill instead.
---

# ZodForm System

> **When to use**: Any form that maps a Zod v4 schema to UI — create, edit, filter, confirm-action dialog, modal form, or inline page form. If the codebase already has a `clientAPI.X.Y({ body })` method and a Zod contract for it, ZodForm is the default.

> **Not ported yet.** This repo has `SCHEMA_DESCRIPTION` / `commonZod` / `zod.utils` in `packages/zod-schemas`, but the ZodForm runtime still lives in ELP-fe. Before using this skill, port from `ELP-fe/apps/frontend/src/`: `components/zod-form/` (`zod-form.tsx`, `zod-field.tsx`, `form-error-message.tsx`, `fields/*` — skip the ELP-only `problem-languages.field.tsx`), `components/global/zod-form.dialog.tsx` + `zod-form.drawer.tsx` (mount both in `routes/__root.tsx`), `hooks/use-contract-form.tsx`, `lib/overlay-size.ts`, `lib/event-bus.ts`, `components/loading-button.tsx`, `components/common/commit-select.tsx`, `components/common/async-search-combobox.tsx`, and `components/permission-check.tsx`; plus `packages/zod-schemas/src/form/refinements/` (index + `auth.refinement.ts`) when you need shared refinements.

Forms in this codebase are **not** hand-wired `react-hook-form` + `Controller` per field. Instead, a single Zod v4 schema drives four things:

- **field discovery** — which fields exist (`analyzeSchema`)
- **field rendering** — which component to use (`getFieldType` + `ZodField`)
- **validation** — client-side, reusing the contract's rules (`zodResolver`)
- **submission** — via a `contractAPI(body)` callback returning `IResponse<...>`

**Your job when building a form** is to produce three things:

1. a `schema: ZodObject` — usually derived from the API contract with `.pick / .omit / .extend / .superRefine`
2. a `displayOptions` map — label, colSpan, placeholder, hidden, readonly, selectOptions, searchOptionsFn, helpText, …
3. a `contractAPI(body) => Promise<IResponse<...>>` — typically `clientAPI.Domain.method({ body })`

Plus `defaultValues`, `onSuccess`, and optionally `onError`, `submitBtn`, `watchEffect`, `children`.

---

## How this skill stays reusable

The **pattern** documented here (a schema drives discovery + rendering + validation + submission; three render modes; description-based field detection; form-side cross-field validation) is project-agnostic. It transfers to any React + Zod v4 + react-hook-form codebase.

What changes between projects is a small set of **bindings** — import paths and helper names. Everything in this skill is written against this project's bindings; to reuse the skill elsewhere, remap them and the rest applies unchanged. The table below lists the most-used bindings; the **complete** list and the full porting guide are in [references/project-setup.md](references/project-setup.md).

| Binding | This project (`dona-province-dashboard-fe`) |
|---|---|
| Form component | `ZodForm`, `createZodFormProps` — `@/components/zod-form/zod-form` |
| Dialog opener | `openZodFormDialog`, `ZodFormDialogEvent` — `@/components/global/zod-form.dialog` |
| Drawer opener | `openZodFormDrawer`, `ZodFormDrawerEvent` — `@/components/global/zod-form.drawer` |
| Schema helpers | `commonZod` — `@repo/zod-schemas/src/common` |
| Field-detection markers | `SCHEMA_DESCRIPTION` — `@repo/zod-schemas/src/common` |
| API client | `clientAPI` — `@/config/clientAPI.config` |
| Response type | `IResponse<T>` = `{ success: true; data }` \| `{ success: false; message; errors }` |
| Permission gate | `<PermissionCheck permission="...">` — `@/components/permission-check` |
| Overlay width token | `OverlaySize` — `@/lib/overlay-size` (needed for `dialogOptions.size`) |
| Async-search option schema | `AsyncSearchComboboxOptionSchema` — `@/components/common/async-search-combobox` (needed for async-search fields) |

> **Adding/changing a capability** (new field renderer, new commonZod helper, new overlay size)? Read [references/extending.md](references/extending.md) — it gives the exact files to touch, in order.

---

## Decision flow — pick the right section

| Your situation | Read |
|---|---|
| **Just starting — want a high-level tour** | This SKILL.md (continue reading) |
| Pick a field renderer / understand detection priority | [references/field-types.md](references/field-types.md) |
| Choose inline vs dialog vs drawer; submit button; width; closing | [references/rendering-modes.md](references/rendering-modes.md) |
| Write the schema: `commonZod` helpers, pick/omit/extend, optional vs nullable | [references/schema-patterns.md](references/schema-patterns.md) |
| Conditional field visibility based on another field's value | [references/watch-effect.md](references/watch-effect.md) |
| File upload — create flow, edit flow with existing files, S3 presigned URLs | [references/file-upload.md](references/file-upload.md) |
| Cross-field validation (`endAt > startAt`, conditional-required, totals) | [references/cross-field-validation.md](references/cross-field-validation.md) |
| **Add a new field type / renderer / commonZod helper / overlay size** | [references/extending.md](references/extending.md) |
| How the internals work — `analyzeSchema`, `getFieldType`, `useContractForm`, event bus | [references/architecture.md](references/architecture.md) |
| Reuse this skill in another project — the porting checklist | [references/project-setup.md](references/project-setup.md) |
| A symptom you're debugging (invisible field, wrong renderer, …) | [references/common-pitfalls.md](references/common-pitfalls.md) |
| Wrapping a trigger button to open a create/edit dialog in place | See **zod-form-trigger-dialog** skill |

---

## The 6-column grid (container queries)

The form is a `grid grid-cols-1 @4xl/main:grid-cols-6`. Columns collapse to 1 when the container is narrow.

- `colSpan: 6` → full row (default)
- `colSpan: 3` → half (two per row)
- `colSpan: 2` → third (three per row)
- `colSpan: 1` → sixth (six per row)

**Prerequisite**: a layout ancestor must declare `@container/main`. For inline page forms this is usually the page layout. For dialog/drawer, `<DialogContent>` / `<DrawerContent>` already include `@container/main`.

Rows should sum to ≤ 6. Uneven rows left-align; use `colSpan: 6` to force a break.

### Visual section break (`breakBefore`)

For long forms that group naturally into sections (e.g. *login info* vs *personal info*), set `breakBefore: true` on the **first field** of the new section. ZodForm renders a thin full-width separator (`col-span-full my-2 h-px bg-border`) right before that field.

- The break is **only a horizontal line** — no title, no description. For a section heading, render it via `children`.
- `breakBefore` is ignored on the field at index 0 (no leading separator).
- Don't stack `breakBefore` on consecutive fields — it produces double separators.

---

## Field detection (cheat sheet)

Rendering happens in two layers. **First** `getFieldType(fieldName, fieldSchema)` inspects the schema's `description` + the field name + the Zod instance. **Then** `ZodField` walks a render chain. The order below is the *effective* priority — first match wins.

| # | Trigger | Renders | Schema helper |
|---|---|---|---|
| 1 | Schema is `ZodEmail` | `EmailField` | `commonZod.email` |
| 2 | Field name contains `username` | `UsernameField` | `commonZod.username` |
| 3 | Field name contains `password` | `PasswordField` (generate+copy when desc `NEW_PASSWORD`) | `commonZod.password` / `commonZod.newPassword` |
| 4 | Description `DATETIME` | `DatePickerTime` (date + time) | `commonZod.datetime` |
| 5 | Description `DATE_ONLY` | `DatePickerField` (`YYYY-MM-DD` string) | `commonZod.dateOnly` |
| 6 | Description `TIME_ONLY` | `TimePickerField` (`HH:MM:SS` string; input shows `HH:mm`) | `commonZod.timeOnly` |
| 6a | Description `SHORT_DURATION` | `ShortDurationField` (hours `0–8` + minutes `0,5,…,55` selects; value `{ hours, minutes }`) | `commonZod.shortDuration` |
| 7 | Description `PHONE` | `PhoneField` | `commonZod.phone` |
| 8 | Description `CITIZEN_ID` | `CitizenIdField` (9/12-digit CCCD) | `commonZod.citizenIdNo` |
| 9 | Description `GENDER` | `GenderField` | `commonZod.gender` |
| 10 | Description `MONEY` | `MoneyField` (formatted currency input) | `commonZod.feeAmount` / `commonZod.feeAmountInt` |
| 11 | Description `PREVIEW_FILES` *or* name has `existingfiles`/`existingattachments`/`previewfiles` | `FilePreviewField` (download + soft-delete) | `commonZod.previewFiles` |
| 12 | Description `UPLOAD_FILES` *or* name has `attachment`/`file`/`uploadfiles` | `FileUploadField` (drag-and-drop) | `commonZod.uploadFiles` |
| 13 | `displayOption.searchOptionsFn` provided | `AsyncSearchCombobox` — `multiple` if the field is a `ZodArray`, else single-select | schema field uses `AsyncSearchComboboxOptionSchema(...)` |
| 13a | `displayOption.multiSelectOptions` provided | `MultiSelectComboboxField` — in-memory multi-select (search + badges + clear-all). **This is the renderer for a `z.array(...)` field with a fixed option list.** | — (array of primitive ids) |
| 14 | `displayOption.cardRadioOptions` provided | `CardRadioGroupField` (rich card choices) | — (enum / primitive) |
| 15 | `displayOption.toggleOptions` provided | `ToggleGroupField` (segmented control) | — (enum / primitive) |
| 16 | `displayOption.radioOptions` provided | `RadioGroupField` (all options visible) | — (enum / primitive) |
| 17 | `displayOption.selectOptions` provided | `CommitSelect` (dropdown) | — (enum / primitive) |
| 18 | Field name is `otp` or `totp` | `InputOTP` (6-digit, numeric) | `commonZod.otpCode` |
| 19 | Description `TEXTAREA` | `Textarea` | `commonZod.textarea` / `commonZod.description` / `commonZod.bio` |
| 20 | Type is `string` or `number` | `Input` (text / number) | — |
| 21 | Type is `boolean` | `Checkbox` — the `label` renders inline beside it; `helpText` is **not** shown for booleans | — |

**Two non-obvious ordering facts** — both come up in review:

- **Rows 1–12 beat displayOptions.** A field that resolves to email/date/phone/file/etc. renders that special component even if you *also* set `selectOptions`. The schema's description wins.
- **`Textarea` (row 19) is weaker than displayOptions (rows 13–17) and OTP (18).** A `commonZod.textarea` field that *also* has `selectOptions` renders as `CommitSelect`, not `Textarea`. (Rare, but the opposite of what you'd guess — textarea is checked late in the render chain.)

> Fields resolving to `enum`, `array`, or `object` have **no default renderer**. You must give them a renderer or `hidden: true` — otherwise the field renders `null` (an invisible field that silently blocks submit). See [common-pitfalls.md](references/common-pitfalls.md).
>
> **Match the renderer to the field's cardinality** — this is a common source of silent breakage:
> - **A `z.array(...)` field** (e.g. `indicatorIds: z.array(commonZod.entityId)`) takes `multiSelectOptions` (fixed list) or `searchOptionsFn` (async, with an array-shaped option schema). Both emit an **array**. Do **not** give an array field `selectOptions` — `CommitSelect` emits a single scalar via `onChange(option.value)`, so the form value collapses to one id and the `z.array(...)` parse breaks at submit.
> - **A single enum / scalar id field** takes `selectOptions`, `radioOptions`, `toggleOptions`, or `cardRadioOptions` — all emit a single value.

> **`radioOptions` vs `selectOptions`** — both take `{ value, label }[]`. Radio shows every option inline (best for 2–5 short choices: gender, yes/no, small status sets); select hides them behind a dropdown (best for long lists). `toggleOptions` is a segmented control for 2–4 mutually-exclusive choices; `cardRadioOptions` renders each choice as a description-rich card. If several are set, priority is rows 13→17.

Full rule set, the exact render chain, and per-renderer notes: [references/field-types.md](references/field-types.md).

---

## Minimal create-form example

```tsx
import { openZodFormDrawer } from '@/components/global/zod-form.drawer';
import { clientAPI } from '@/config/clientAPI.config';
import { commonZod } from '@repo/zod-schemas/src/common';
import { widgetContract } from '@repo/zod-schemas/src/api-contract/widget.contract';
import { widgetListRepository } from '@/repositories/widgetList.repository';
import { toast } from 'sonner';

openZodFormDrawer({
  title: 'Tạo widget',
  schema: widgetContract.create.body.extend({
    description: commonZod.textarea.nullable(),
  }),
  defaultValues: { name: '', description: null, ownerId: 0 },
  displayOptions: {
    name:        { label: 'Tên',        colSpan: 6 },
    ownerId:     { label: 'Chủ sở hữu', colSpan: 3,
                   selectOptions: [{ value: 1, label: 'An' }, { value: 2, label: 'Bình' }] },
    description: { label: 'Mô tả',      colSpan: 6 },
  },
  contractAPI: (body) => clientAPI.Widget.create({ body }),
  onSuccess: async () => {
    toast.success('Đã tạo widget');
    await widgetListRepository().invalidate();
    // No close() call — the drawer closes itself on success. See rule 2.
  },
  submitBtn: { text: 'Tạo' },
});
```

---

## Lessons learned — rules that are easy to break

These are the mistakes that show up across PRs. Each one points to its canonical reference section — don't re-explain rules in multiple places.

### 1. Submit-button alignment is automatic for dialog & drawer — only inline forms need a className

- **`openZodFormDialog`** always prepends `ml-auto` to the submit button. You do **not** pass `ml-auto` — it's redundant (yields `ml-auto ml-auto`).
- **`openZodFormDrawer`** defaults the submit button to `w-full`.
- **Inline `<ZodForm>`** has no default — the wrapper is `<div className='w-full flex'>`, so a bare button hugs the left. Inline forms must set `submitBtn.className` to `'w-full'` or `'ml-auto'`.

So the only place to consciously set alignment is an **inline** form. For a destructive dialog action, still pass the variant: `submitBtn.className: buttonVariants({ variant: 'destructive' })` (the dialog adds `ml-auto` on top). Details: [rendering-modes.md](references/rendering-modes.md).

### 2. Do **not** manually close the dialog/drawer — ZodForm closes it for you

On a successful submit, `ZodForm` calls `ZodFormDialogEvent.close()` **and** `ZodFormDrawerEvent.close()` itself, right after your `onSuccess` runs. A `ZodFormDialogEvent.close()` at the end of `onSuccess` is redundant (harmless, but cargo-culted across the codebase — don't copy it).

`onSuccess` should just do its real work: `toast.success(...)`, repo `.invalidate()`, optional `navigate(...)`. On **error** the overlay stays open (so the user sees the error banner) — correct, and also automatic. See [architecture.md](references/architecture.md) → "Auto-close".

### 3. Edit-form field locking: `readonly` if the user needs to see it, `hidden` if not

- **`readonly: true`** — rendered but not editable. Use when the user needs the context (e.g. the `code` of the thing being edited).
- **`hidden: true`** — not rendered, but **still submitted** from `defaultValues`. Use for `id`, `version` (optimistic-locking), and anything the user shouldn't see.

Both round-trip through form state — `defaultValues` must include them. [schema-patterns.md](references/schema-patterns.md).

### 4. Cross-field business logic stays out of the contract

Rules spanning multiple fields (`endAt > startAt`, conditional-required, sum-totals) belong on the **form's** schema via `.superRefine`, never on the shared contract in `packages/zod-schemas/src/api-contract/`. The contract describes *what the API accepts*; the form describes *what the user must fill in*.

Refinements that are non-trivial or reused across forms are extracted to `packages/zod-schemas/src/form/refinements/<domain>.refinement.ts` as plain functions (or factories that close over runtime context, e.g. the loaded entity). Call sites apply them via `.superRefine(reportCreateRefinement)`. This keeps `api-contract/` pure transport-shape while still letting refinement logic be shared. [cross-field-validation.md](references/cross-field-validation.md).

### 5. Complex file flows → a named helper, not inline lambdas

A create-with-files flow is ~3 steps; an edit-with-files flow is ~5. Don't inline that in `contractAPI`. Extract a colocated helper, e.g. `-widget-attachments.helper.ts` exporting `handleWidgetAttachments(...)`. [file-upload.md](references/file-upload.md).

### 6. `children` renders between the fields and the error banner

The form body order is: fields grid → `children` → `_errorMessage` banner → submit button. Use `children` for content that belongs to the form submit but isn't schema-driven: a sub-editor managed by local state, a legal notice, a computed preview. Anything that *could* be a schema field belongs in `displayOptions` instead. [architecture.md](references/architecture.md) → "Children render order".

### 7. Build schemas from `commonZod` helpers — don't reinvent `z.date()` / `z.file()`

Field detection is **description-based**. A raw `z.date()` will not render a date picker; a raw `z.array(z.file())` will not render the upload field. Always go through `commonZod` (or attach the right `SCHEMA_DESCRIPTION` — see [extending.md](references/extending.md)). The full helper catalogue is in [schema-patterns.md](references/schema-patterns.md).

### 8. `optional` vs `nullable` — and why an emptyable textarea must be `nullable`

ZodForm supports `.optional()`, `.default(...)`, **and `.nullable()`** — every wrapper-unwrap path (`getFinalTypeName`, `getSchemaDescription`, `getFieldType`, the required check) handles `ZodNullable`. (An older version of this skill said "never nullable" — that is obsolete; the contracts themselves use `commonZod.description.nullable()`.)

The one rule that matters: **the `Textarea` field emits `null` when the user clears it.** So a textarea field the user can leave empty must accept `null` → use `.nullable()` (or `.nullish()`). `.optional()` alone rejects `null` and will show a spurious validation error the moment the user empties the field. For non-textarea optional fields, prefer `.optional()`. Map a backend `null` to the right shape in `defaultValues`. [schema-patterns.md](references/schema-patterns.md) → "optional vs nullable".

### 9. Don't wire `onError` just to toast the API message

ZodForm auto-renders submission errors: per-field errors go inline, the general `res.message` renders as a red banner above the submit button. `onError: (res) => toast.error(res.message)` just duplicates the banner. Omit `onError` unless you need a side effect *beyond* showing the message (analytics, resetting sibling state). [common-pitfalls.md](references/common-pitfalls.md).

### 10. `AsyncSearchCombobox` fields carry the option object, not the id

To wire an async-search dropdown, the schema field must be the option shape (`AsyncSearchComboboxOptionSchema(...)`), not the primitive id. Unwrap `.data` in `contractAPI`. For a multi-select, make the field a `ZodArray` of that option schema — ZodField renders the combobox in `multiple` mode automatically. [field-types.md](references/field-types.md).

---

## ZodFormProps reference (quick)

```ts
interface ZodFormProps<TSchema extends ZodObject, ResSuccessData> {
  schema: TSchema;
  displayOptions: Record<keyof TSchema['shape'], FieldDisplayOption>;
  contractAPI: (body: z.infer<TSchema>) => Promise<IResponse<ResSuccessData>>;
  onSuccess: (data: ResSuccessData, payload: z.infer<TSchema>) => void;   // may be async — but the overlay auto-closes before any awaits inside it resolve
  onError?: (res: Extract<IResponse<...>, { success: false }>, payload) => void;
  submitBtn?: { text: string; className?: string };   // see rule 1
  defaultValues: DefaultValues<z.input<TSchema>>;
  dialogOptions?: { blockOutsideClick?: boolean; size?: OverlaySize };
  watchEffect?: (values) => Partial<Record<keyof shape, Partial<FieldDisplayOption>>>;
  children?: ReactNode;
}
// openZodFormDialog / openZodFormDrawer additionally take: title, description?, body?

interface FieldDisplayOption {
  label?: string;
  colSpan?: 1 | 2 | 3 | 4 | 5 | 6;    // default 6
  hidden?: boolean;                    // not rendered, still submitted
  breakBefore?: boolean;               // thin <hr> separator before this field
  placeholder?: string;
  readonly?: boolean;                  // rendered, not editable
  disabled?: boolean;                  // disabled (auto-true while submitting)
  helpText?: string;                   // below field (omitted for checkbox — see field-types.md)
  className?: string;                  // on the FormItem wrapper
  labelClassName?: string;
  messageClassName?: string;           // on the error message (e.g. 'text-center' for OTP)
  selectOptions?: { value: string | number; label: string }[];
  radioOptions?: { value: string | number; label: string }[];
  toggleOptions?: ToggleGroupOption[];
  cardRadioOptions?: CardRadioOption[];
  searchOptionsFn?: (query: string) => Promise<AsyncSearchComboboxOption[]>;
  searchPlaceholder?: string;          // search input text inside the combobox popover
  renderSearchOption?: (option: AsyncSearchComboboxOption) => ReactNode;
}
```

> `FieldDisplayOption` also declares `onFileDownload` and `selectMultiple`. **Both are dead** — declared in the type but never read by `ZodField`. Don't use them: file download is built into `FilePreviewField`; multi-select is driven by the field being a `ZodArray`.

---

## Checklist before considering a ZodForm done

- [ ] Schema built with `commonZod` helpers (not raw `z.date()` / `z.file()` / long regex)
- [ ] `displayOptions` has an entry for **every** schema field (or explicitly `hidden: true`)
- [ ] `defaultValues` covers **every** field (including hidden `id` / `version`)
- [ ] `colSpan` values per row sum sensibly (≤ 6)
- [ ] Cross-field validation is on the form-side schema (`.superRefine`), not the contract
- [ ] Enum / array / object fields have a `selectOptions` / `radioOptions` / `toggleOptions` / `cardRadioOptions` / `searchOptionsFn` / file-or-date description / `hidden: true` — no invisible fields
- [ ] Edit form: identity fields are `readonly: true` (visible) or `hidden: true` (invisible) and in `defaultValues`
- [ ] Emptyable textarea fields use `.nullable()` (the field emits `null`); other optional fields use `.optional()`
- [ ] File upload uses `commonZod.uploadFiles` (+ `commonZod.previewFiles` for edit); complex flow extracted to `-xxx-attachments.helper.ts`
- [ ] Inline `<ZodForm>`: `submitBtn.className` set (`'w-full'` or `'ml-auto'`). Dialog/drawer: alignment is automatic — don't pass `ml-auto`
- [ ] `onSuccess` does toast + `.invalidate()` (+ optional navigate). **No** manual `.close()` — the overlay closes itself
- [ ] No `onError: toast.error(res.message)` — the error banner already shows it
- [ ] AsyncSearchCombobox fields: schema uses `AsyncSearchComboboxOptionSchema(...)`, `contractAPI` unwraps `.data`
- [ ] Overlay width set via `dialogOptions.size`, never a raw `max-w-*` className
- [ ] Read-only display of any `commonZod.textarea`-backed value uses `whitespace-pre-wrap` (see [field-types.md](references/field-types.md))
