# ZodForm — Field Types

Every entry in `displayOptions` produces exactly one rendered field. What renders is decided in two layers:

1. **`getFieldType(fieldName, fieldSchema)`** — inspects the schema's `description`, the field name, and the Zod instance, and returns a *special type* (e.g. `email`, `money`, `dateOnly`) or `"unknown"`.
2. **The render chain** in `ZodField` — a single ordered ternary. Special types render first; for `"unknown"` it falls through to the displayOption-driven renderers and then the primitive `Input` / `Checkbox`.

## Effective detection priority

The table below is the *effective* priority — it folds the two layers (`getFieldType` classification, then the `ZodField` render chain) into one ordered view. Stop at the first match.

**How `getFieldType` reads the description** (this matters when you wrap a helper): it reads `schema.description` **directly** off the field schema, and recurses into the inner type **only** through `ZodOptional`, `ZodCatch`, and `ZodNullable`, and **only** when that wrapper itself carries no description. It does **not** call `getSchemaDescription`, and it does **not** unwrap `ZodDefault` / `ZodPipe` / `ZodReadonly` / `ZodPrefault`. So `commonZod.previewFiles.optional()` still matches (the `ZodOptional` is unwrapped to reach the inner description), but stacking a `.default(...)` on top of a described helper hides the description from detection — the field would fall through to `unknown`. Keep `.describe(...)` outermost, or behind only `.optional()` / `.catch()` / `.nullable()`. (By contrast, `analyzeSchema`'s *type* resolution uses `getFinalTypeName` → `getSchemaDescription`, which unwraps all wrappers — so detection and type-resolution have different unwrap depth.)

| # | Trigger | Renders | Schema helper |
|---|---|---|---|
| 1 | `schema instanceof ZodEmail` | `EmailField` — input with mail icon | `commonZod.email` |
| 2 | name `.includes('username')` | `UsernameField` — input with user icon | `commonZod.username` |
| 3 | name `.includes('password')` | `PasswordField` — show/hide toggle; generate+copy when desc is `NEW_PASSWORD` | `commonZod.password` / `commonZod.newPassword` |
| 4 | desc `DATETIME` | `DatePickerTime` — date + time | `commonZod.datetime` |
| 5 | desc `DATE_ONLY` | `DatePickerField` — `YYYY-MM-DD` string | `commonZod.dateOnly` |
| 6 | desc `TIME_ONLY` | `TimePickerField` — `HH:MM:SS` ISO-time string (the input shows `HH:mm`; seconds default to `:00`) | `commonZod.timeOnly` |
| 6a | desc `SHORT_DURATION` | `ShortDurationField` — two selects (hours `0–8`, minutes `0,5,…,55`); value is `{ hours, minutes }` | `commonZod.shortDuration` |
| 7 | desc `PHONE` | `PhoneField` — VN phone input | `commonZod.phone` |
| 8 | desc `CITIZEN_ID` | `CitizenIdField` — 9/12-digit CCCD input | `commonZod.citizenIdNo` |
| 9 | desc `GENDER` | `GenderField` — gender select | `commonZod.gender` |
| 10 | desc `MONEY` | `MoneyField` — currency input with thousands grouping | `commonZod.feeAmount` / `commonZod.feeAmountInt` |
| 11 | desc `PREVIEW_FILES`, or name has `existingfiles`/`existingattachments`/`previewfiles` | `FilePreviewField` — list + download + soft-delete (undo) | `commonZod.previewFiles` |
| 12 | desc `UPLOAD_FILES`, or name has `attachment`/`file`/`uploadfiles` | `FileUploadField` — drag-and-drop, MIME filter, dedupe | `commonZod.uploadFiles` |
| 13 | `displayOption.searchOptionsFn` set | `AsyncSearchCombobox` — `multiple` if the field is a `ZodArray`, else single | schema field uses `AsyncSearchComboboxOptionSchema(...)` |
| 13a | `displayOption.multiSelectOptions` set | `MultiSelectComboboxField` — single search input + popover list + selected badges row + clear-all (confirm on ≥2) | — (array of primitive ids) |
| 14 | `displayOption.cardRadioOptions` set | `CardRadioGroupField` — choices as description-rich cards | — (enum / primitive) |
| 15 | `displayOption.toggleOptions` set | `ToggleGroupField` — segmented control | — (enum / primitive) |
| 16 | `displayOption.radioOptions` set | `RadioGroupField` — all options visible as radios | — (enum / primitive) |
| 17 | `displayOption.selectOptions` set | `CommitSelect` — dropdown | — (enum / primitive) |
| 18 | name is `otp` / `totp` | `InputOTP` — 6-digit numeric | `commonZod.otpCode` |
| 19 | desc `TEXTAREA` | `Textarea` — multi-line, trims on change | `commonZod.textarea` / `.description` / `.bio` |
| 20 | `FieldInfo.type` is `string` / `number` | `Input` (text / number) | — |
| 21 | `FieldInfo.type` is `boolean` | `Checkbox` — `label` renders inline beside it; `helpText` is suppressed for booleans | — |

### Two ordering facts that surprise people

- **Rows 1–12 beat displayOptions.** These are resolved by `getFieldType` and rendered at the top of the chain. A field whose schema says "I'm a date" renders a date picker even if you also pass `selectOptions`.
- **`Textarea` (row 19) is *weaker* than displayOptions (rows 13–17) and OTP (18).** In the render chain, `textarea` is checked *after* `searchOptionsFn / cardRadioOptions / toggleOptions / radioOptions / selectOptions / otp`. So a `commonZod.textarea` field that also carries `selectOptions` renders as `CommitSelect`. This is rare in practice, but it's the opposite of the intuitive "special type always wins" — only the *strong* group (1–12) always wins.

### `OTP` is triggered by field *name*, and does not auto-submit

Row 18 fires on the exact field name — `["otp", "totp"].includes(fieldName.toLowerCase())`. A field named `otpCode` (even built from `commonZod.otpCode`) will **not** render the OTP widget — it renders a plain `Input`. Name the field `otp` or `totp`.

`InputOTP` is a plain 6-digit numeric input. Its `onComplete` handler is **not** wired (commented out in `zod-field.tsx`) — completing the 6 digits does **not** submit the form. The user still presses the submit button. Don't tell users it auto-submits.

## Choosing between the enum/choice renderers

All four bind to an `enum` or primitive field. They differ only in presentation:

| displayOption | Renders | Best for |
|---|---|---|
| `radioOptions` | `RadioGroup` — every option inline | 2–5 short choices the user should see at once (gender, yes/no, small status set) |
| `toggleOptions` | Segmented control | 2–4 mutually-exclusive choices, compact (a mode switch, a tab-like pick) |
| `cardRadioOptions` | One card per choice (title + description) | choices that need explaining — each card has a label *and* a body |
| `selectOptions` | `CommitSelect` dropdown | long lists, or when vertical space is tight |

All take `{ value: string \| number; label: string }[]` (`toggleOptions` / `cardRadioOptions` take their own richer option types — `ToggleGroupOption` / `CardRadioOption`). If several are set on one field, priority is rows 13→17.

```tsx
displayOptions: {
  gender:    { label: 'Giới tính', radioOptions: GENDER_OPTIONS },
  feeType:   { label: 'Loại phí',  selectOptions: FEE_TYPE_OPTIONS },
  period:    { label: 'Kỳ báo cáo', toggleOptions: REPORT_PERIOD_OPTIONS },
  location:  { label: 'Trụ sở',    cardRadioOptions: locationCardOptions },
}
```

`RadioGroupField` accepts both string and number values — it serializes to string for Radix internally and re-maps on change, so the schema can stay `z.enum([...])` or `z.number()` with no coercion.

## AsyncSearchCombobox — single and multiple

`searchOptionsFn` makes the field an async-search dropdown. The field value is the **option object** (`{ key, label, secondary?, data }`), not the primitive id — so the schema must use `AsyncSearchComboboxOptionSchema(...)`, and `contractAPI` unwraps `.data` (see [schema-patterns.md](schema-patterns.md)).

- **Single-select** — the field is the option schema. `ZodField` renders a single combobox.
- **Multi-select** — the field is a `ZodArray` of the option schema. `ZodField` detects the `ZodArray` and renders the combobox in `multiple` mode automatically. There is no `selectMultiple` flag to set — array shape *is* the signal.
- `searchPlaceholder` overrides the text inside the popover's search input. `renderSearchOption` customises each row in the dropdown (e.g. avatar + name + phone) — but the selected-input text is still driven by the option's `label`, so keep `label` a meaningful single-line string.

## Gotchas

### Enum / array / object with no renderer → invisible field

`analyzeSchema` happily returns `type: 'enum' | 'array' | 'object'`, but the render chain has **no default** for them — it reaches the final `null`. The field renders nothing yet still validates, so an empty required value silently blocks submit. Always give such a field one of: `selectOptions` / `radioOptions` / `toggleOptions` / `cardRadioOptions` / `searchOptionsFn` / a file-or-date `SCHEMA_DESCRIPTION` / `hidden: true`.

### Email ordering — keep ZodEmail ahead of name checks

Row 1 (`ZodEmail` instance) is checked before the `username` / `password` name rules. A field named `emailPassword` would still render as `EmailField` (type match beats name match) — so don't name fields that way.

### Name-based detection beats type — boolean fields must not contain `password`/`username`/`attachment`/`file`

`getFieldType` checks the field **name** (rows 2, 3, 11, 12, 18) before falling through to the type-based default (row 21 — Checkbox for `boolean`). A boolean field named `keepCurrentPassword`, `confirmUsername`, or `attachmentEnabled` will render the corresponding password / username / file component instead of a checkbox — the UI shows an input where you expected a checkbox.

Pick names that don't contain the reserved substrings:

```ts
// ❌ Renders PasswordField even though the field is `z.boolean()`
keepCurrentPassword: z.boolean(),

// ✅ Renders Checkbox
keepOldPw: z.boolean(),
```

Reserved substrings (lowercased): `username`, `password`, `attachment`, `file`, `existingfiles`, `existingattachments`, `previewfiles`, `uploadfiles`, `otp`, `totp`.

### Textarea trims and emits `null` on empty

The `Textarea` `onChange` is:

```ts
const value = e.target.value.trim();
if (!value) formField.onChange(null);   // ← empty becomes null, not ''
else formField.onChange(e);
```

An emptied textarea submits `null`. The schema field **must accept `null`** — use `.nullable()` (matches what the contracts already do for `description` / `note` / `bio`). A bare `.optional()` rejects `null` and shows a spurious validation error the moment the user clears the field. See [schema-patterns.md](schema-patterns.md) → "optional vs nullable".

### Read-only display of a textarea value must preserve newlines

Textarea content is stored with raw `\n`. The default browser CSS collapses newlines into spaces. Whenever you display a textarea-backed field **outside the form** (detail page, card, drawer header, summary), wrap the value:

- **`whitespace-pre-wrap`** (default; codebase convention) — preserves newlines *and* consecutive spaces.
- **`whitespace-pre-line`** — preserves newlines but collapses consecutive spaces; use when the content was pasted from Word/PDF/email and stray indentation is noise.

```tsx
<p className="whitespace-pre-wrap">{resource.description ?? '—'}</p>
```

Default to `pre-wrap` unless the surrounding file already uses `pre-line`. In a table cell that should truncate, use neither — use `line-clamp-1` / `truncate` + `title={value}`.

### Existing-file preview and upload are separate fields

An edit form with files almost always needs both:

```ts
schema.extend({
  existingFiles: commonZod.previewFiles,  // already on the server — soft-delete with undo
  newFiles:      commonZod.uploadFiles,   // what the user adds now
})
```

`contractAPI` reconciles the two. See [file-upload.md](file-upload.md).

### Name-based file detection is broad

Rows 11–12 also fire on the field *name*: anything whose lowercased name contains `file` resolves to `uploadFiles`, and `existingfiles`/`existingattachments`/`previewfiles` resolve to `previewFiles`. The `file` substring match is wide — a field innocently named `fileType`, `fileFormat`, or `profileFileLabel` would be misdetected as a file-upload field. Prefer description-based detection (`commonZod.uploadFiles`) and avoid `file` in the name of non-file fields.

### `onFileDownload` and `selectMultiple` are dead options

Both are declared on `FieldDisplayOption` but **never read** by `ZodField` (not destructured) — legacy declarations that were never cleaned up. They do nothing. `FilePreviewField` has download built in; multi-select is driven by the field being a `ZodArray`. Don't pass either. If you remove them from the type, grep call sites first — older code may still pass them (harmless no-ops).

## `FieldDisplayOption` — full reference

```ts
interface FieldDisplayOption {
  // Labels & text
  label?: string;
  placeholder?: string;
  helpText?: string;           // <FormDescription> below the field — NOT rendered for boolean/checkbox

  // Layout
  colSpan?: 1 | 2 | 3 | 4 | 5 | 6;   // default 6 (full row)
  breakBefore?: boolean;              // thin full-width <hr> before this field (ignored at index 0)
  className?: string;                 // on the <FormItem>
  labelClassName?: string;            // on the <FormLabel>
  messageClassName?: string;          // on the <FormErrorMessage> (e.g. 'text-center' for OTP)

  // State
  hidden?: boolean;            // not rendered — still submitted from defaultValues
  readonly?: boolean;          // rendered, visible, not editable
  disabled?: boolean;          // disabled (also forced true while isPending)

  // Choice renderers (see table above for priority)
  selectOptions?: { value: string | number; label: string }[];
  radioOptions?: { value: string | number; label: string }[];
  starOptions?: { value: string | number; label: string }[];
  toggleOptions?: ToggleGroupOption[];
  cardRadioOptions?: CardRadioOption[];

  // Local multi-select (in-memory option list — for async, use searchOptionsFn instead)
  multiSelectOptions?: { value: string | number; label: string }[];
  multiSelectEmptyText?: string;       // shown when options.length === 0

  // Async search
  searchOptionsFn?: (query: string) => Promise<AsyncSearchComboboxOption[]>;
  searchPlaceholder?: string;
  renderSearchOption?: (option: AsyncSearchComboboxOption) => ReactNode;

  // Dead — declared but never read by ZodField. Do not use.
  onFileDownload?: (file: ExistingFile) => void;
  selectMultiple?: boolean;
}
```

## Required vs optional — how the asterisk is computed

`FormLabel` shows a red `*` when `FieldInfo.required` is true:

```ts
required = !fieldSchema.safeParse(undefined).success
        && !fieldSchema.safeParse(null).success
```

The field is *required* only if it rejects **both** `undefined` and `null`. So `.optional()`, `.default(...)`, `.catch(...)`, and `.nullable()` all drop the asterisk. You never set this manually — if the asterisk is wrong, fix the schema.

## Number input quirks

`z.number()` + `type="number"`: the `Input` `onChange` converts `''` → `undefined` and otherwise `Number(raw)`, so an empty number field submits `undefined` (not `NaN`, not `''`). For a field that must end up an integer id, coerce in the contract (`z.coerce.number()`). For an optional quantity, `.optional()` is correct (empty → `undefined`).

## Checkbox label placement

A boolean field renders `Checkbox`. Its `helpText` is **not** shown (the `helpText` `<FormDescription>` is skipped for `type === 'boolean'`). The `label` renders as a normal label, ordered next to the checkbox. If you need explanatory text next to a checkbox, put it in `label`; a separate description line isn't available for checkboxes.
