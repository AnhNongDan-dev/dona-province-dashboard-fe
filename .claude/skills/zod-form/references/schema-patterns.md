# ZodForm — Schema Patterns

How to build the `schema` prop. Three moves:

1. **Start from the contract** — `widgetContract.create.body` (a `ZodObject`).
2. **Shape it for the form** — `.pick / .omit / .extend` to match what the user actually fills in.
3. **Layer form-only rules** — `.superRefine` for cross-field validation that doesn't belong in the shared contract.

## `commonZod` helpers — always build from these

Located in `packages/zod-schemas/src/common.ts`. Most carry a `SCHEMA_DESCRIPTION` marker that drives field detection — a raw `z.date()` / `z.file()` / `z.string()` with a regex **will not** render the right field. The catalogue:

| Group | Helpers |
|---|---|
| **Ids** | `entityId` (coerced positive int), `pathId` |
| **Date / time** | `datetime` → DatePickerTime · `dateOnly` → DatePickerField · `dateOfBirth` (dateOnly + past-date rule) · `timeOnly` → TimePickerField |
| **Identity / auth** | `email` · `username` · `password` · `newPassword` (generate+copy) · `otpCode` · `citizenIdNo` → CitizenIdField · `citizenIdNoMasked` |
| **People / org** | `fullName` · `applicantName` · `unitName` · `phone` → PhoneField · `gender` → GenderField |
| **Money** | `feeAmount` (number) · `feeAmountInt` (int) — both → MoneyField |
| **Multi-line text** (→ Textarea) | `textarea` · `description` · `bio` — these three carry the `TEXTAREA` marker |
| **Plain text** (→ Input) | `code` · `name` · `shortName` · `note` · `location` — plain strings, **no** marker (note: `note` is a plain Input, not a textarea) |
| **Files** | `file` (single) · `uploadFiles` → FileUploadField · `previewFiles` → FilePreviewField · `attachment` (one attachment object) |
| **Misc entity fields** | `version` (optimistic-locking int) · `capacity` · `quantity` · `levelNo` · `dayOfWeek` · `avatarKey` · `avatarUrl` · `qrCode` · `queryBoolean` |

> Need a helper that doesn't exist (a new field kind, a new marker)? Don't scatter `.describe(SCHEMA_DESCRIPTION.X)` across route files — add it to `commonZod` once. See [extending.md](extending.md).

## Shaping the contract for the form

### Pick — expose only certain fields

```ts
schema: widgetContract.create.body.pick({ name: true, ownerId: true }),
```

### Omit and replace

```ts
// Contract's attachment field is plain metadata; the form needs File[].
schema: widgetContract.create.body
  .omit({ attachments: true })
  .extend({ attachments: commonZod.uploadFiles.min(1).max(10) }),
```

### Extend — add form-only fields

When the UI collects something the API doesn't accept directly — e.g. an `AsyncSearchCombobox` option object you later unwrap to an id:

```ts
import { AsyncSearchComboboxOptionSchema } from '@/components/common/async-search-combobox';

schema: widgetContract.create.body
  .omit({ unitId: true })
  .extend({
    unit: AsyncSearchComboboxOptionSchema(z.object({ id: z.number().int().positive() }), 'Chọn đơn vị'),
  }),

// then unwrap in contractAPI:
contractAPI: ({ unit, ...body }) =>
  clientAPI.Widget.create({ body: { ...body, unitId: unit.data.id } }),
```

Multi-select: make the field a `ZodArray` of the option schema — `ZodField` renders the combobox in `multiple` mode automatically (see [field-types.md](field-types.md)).

## optional vs nullable vs default

ZodForm supports **all three**. Every wrapper-unwrap path (`getFinalTypeName`, `getSchemaDescription`, `getFieldType`, the required check) handles `ZodNullable` — and the contracts themselves use `.nullable()` on free-text fields: `commonZod.description.nullable()`, `commonZod.bio.nullable()`, `commonZod.note.nullable()`. The "never use `.nullable()`" guidance from older revisions of this skill is **obsolete**.

| Wrapper | Accepts | Use for |
|---|---|---|
| `.optional()` | `undefined` | Most optional fields. |
| `.nullable()` | `null` | **Any textarea-backed field the user can leave empty** — the `Textarea` component emits `null` on empty (see [field-types.md](field-types.md)). Also matches contract conventions. |
| `.default(v)` | `undefined` → `v` | A field with a sensible default the user can leave alone. |

All three remove the required `*`.

The trap: a `commonZod.textarea.optional()` field looks fine until the user types then clears it — the field emits `null`, `.optional()` rejects `null`, and a spurious "required"-style error appears. For an emptyable textarea use `.nullable()` (or `.nullish()` if it can also be absent).

### Mapping a backend value into `defaultValues`

```ts
defaultValues: {
  description: widget.description,            // nullable field → keep null as-is
  ownerName:   widget.ownerName ?? undefined, // optional field → map null → undefined
  notes:       widget.notes ?? '',            // required string field → fall back to ''
}
```

## `.superRefine` — cross-field validation

`.superRefine` runs after every field parser succeeds and sees the whole object. It is the mechanism for rules like "`endAt` after `startAt`" that span fields. **Always on the form-side schema, never on the contract.** Full treatment — `path`, multiple rules, conditional-required, async — in [cross-field-validation.md](cross-field-validation.md).

```ts
schema: widgetContract.create.body.superRefine(({ startAt, endAt }, ctx) => {
  if (endAt < startAt) {
    ctx.addIssue({ code: 'custom', message: 'Ngày kết thúc phải sau ngày bắt đầu', path: ['endAt'] });
  }
}),
```

`.superRefine` returns a `ZodEffects`, which has no `.extend`/`.omit` — so it must come **last** in the chain (`.omit().extend().superRefine()`).

## `z.input` vs `z.infer`

- `defaultValues` is typed `z.input<typeof schema>` — the **pre-transform** shape.
- `contractAPI` receives `z.infer<typeof schema>` (= `z.output`) — the **post-transform** shape.

For `commonZod.datetime` (`union([isoString, date]).transform(v => new Date(v))`): `z.input` accepts `string | Date`, `z.infer` is `Date`. So `defaultValues` may pass a string or a Date; `contractAPI` always sees a `Date`.

## Common recipes

### Create with one file field

```ts
schema: widgetContract.create.body.extend({
  attachments: commonZod.uploadFiles.min(1).max(5),
}),
```

### Conditional-required field

Don't model this with `.refine` on a single field — use `.superRefine`:

```ts
schema: widgetContract.create.body.superRefine((data, ctx) => {
  if (data.type === 'SCHEDULED' && !data.scheduledAt) {
    ctx.addIssue({ code: 'custom', message: 'Thời gian đặt lịch là bắt buộc', path: ['scheduledAt'] });
  }
}),
```

Pair with `watchEffect` to hide the field when not applicable — see [watch-effect.md](watch-effect.md).

### Edit with readonly code + optimistic version

```ts
schema: widgetContract.update.body.extend({
  code: commonZod.code,   // immutable identifier, shown read-only
}),
defaultValues: { id: widget.id, code: widget.code, name: widget.name, version: widget.version },
displayOptions: {
  id:      { hidden: true },
  version: { hidden: true },
  code:    { label: 'Mã',  colSpan: 3, readonly: true },
  name:    { label: 'Tên', colSpan: 3 },
},
```

### Edit with existing files + new uploads

```ts
schema: widgetContract.update.body
  .omit({ attachments: true })
  .extend({
    existingFiles: commonZod.previewFiles,
    newFiles:      commonZod.uploadFiles.max(Math.min(10 - widget.attachments.length, 10)),
  }),
defaultValues: {
  id: widget.id,
  name: widget.name,
  existingFiles: widget.attachments,   // seed with the current list
  newFiles: [],
  version: widget.version,
},
```

See [file-upload.md](file-upload.md) for the `contractAPI` reconciliation.

## Filter forms

ZodForm is **not** used for list filter bars in this codebase — filter bars use standalone controls (`SearchInput`, `CommitSelect`, `AsyncSearchCombobox`) synced to URL search params. See the `tanstack-table` skill.
