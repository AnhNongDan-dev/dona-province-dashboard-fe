# ZodForm — Common Pitfalls

A symptom-first debugging index. Each row points to the canonical section — the rule is explained there once, not re-taught here.

## Symptom → cause → fix

| Symptom | Cause | Fix | Canonical |
|---|---|---|---|
| A field is **invisible** but submit does nothing / errors | The field resolves to `enum` / `array` / `object` and has no renderer — `ZodField` renders `null` | Give it `selectOptions` / `radioOptions` / `toggleOptions` / `cardRadioOptions` / `searchOptionsFn`, or `hidden: true` | [field-types.md](field-types.md) → "invisible field" |
| A date / file field renders as a **plain text input** | Schema used raw `z.date()` / `z.array(z.file())` — detection is description-based | Build from `commonZod.datetime` / `commonZod.uploadFiles` etc. | [schema-patterns.md](schema-patterns.md) |
| Hidden field arrives as `undefined`; backend rejects it | `hidden: true` does not supply a value — it only suppresses rendering | Add the field to `defaultValues` (`id`, `version`, …) | rule 3 in `SKILL.md` |
| A textarea shows a **spurious "required" error** after the user types then clears it | The `Textarea` field emits `null` on empty; the schema is `.optional()`, which rejects `null` | Use `.nullable()` for emptyable textareas | [schema-patterns.md](schema-patterns.md) → "optional vs nullable" |
| API rejects an async-search field — gets `{ key, label, data }` not an id | The field value is the option object | Unwrap `.data` in `contractAPI` | [field-types.md](field-types.md) → "AsyncSearchCombobox" |
| Grid stays **1-column** on a wide screen | No `@container/main` ancestor — the grid uses a container query | Add `@container/main` to the layout (dialog/drawer already have it) | [rendering-modes.md](rendering-modes.md) → "`@container/main` check" |
| Submitting a failing form shows the error **twice** (banner + toast) | `onError: (res) => toast.error(res.message)` duplicates the built-in banner | Remove `onError` (keep it only for side effects) | rule 9 in `SKILL.md` |
| Inline form's submit button **hugs the left edge** | Inline `<ZodForm>` has no default alignment | Set `submitBtn.className` to `'w-full'` or `'ml-auto'` (dialog/drawer are automatic) | [rendering-modes.md](rendering-modes.md) → "alignment" |
| Overlay too narrow for a dense form | Default `size` is `'sm'` | `dialogOptions: { size: 'lg' }` — never a `max-w-*` className | [rendering-modes.md](rendering-modes.md) → "Width" |
| `.extend` / `.omit` is a type error after `.superRefine` | `.superRefine` returns a `ZodEffects`, which has no object methods | Put `.superRefine` **last** in the chain | [cross-field-validation.md](cross-field-validation.md) |
| `openZodFormDialog(...)` does nothing | The `<ZodFormDialog />` root singleton isn't mounted | Mount it once at the app root | [rendering-modes.md](rendering-modes.md) → "Mounting the singletons" |

## Things that *look* like bugs but aren't

### A manual `ZodFormDialogEvent.close()` in `onSuccess`

Not a bug — just redundant. `ZodForm` closes the dialog/drawer itself on success. Existing call sites cargo-cult the manual close; it's harmless but pointless. New code should omit it. (See [architecture.md](architecture.md) → "Auto-close".)

### Passing `submitBtn.className: 'ml-auto'` to `openZodFormDialog`

Not a bug — just redundant. The dialog prepends `ml-auto` already, so you get `ml-auto ml-auto`. Drop it. Pass a className to a dialog submit button *only* for the variant (e.g. `buttonVariants({ variant: 'destructive' })`).

### `OTP` field not submitting on the 6th digit

Expected. `InputOTP`'s `onComplete` is not wired — the user presses the submit button. (See [field-types.md](field-types.md) → "OTP does not auto-submit".)

## Subtle ones worth more than a line

### Mixing `useForm` / `Controller` with ZodForm

If a file has both a hand-rolled `useForm` and a `<ZodForm>`, that's drift — usually a half-finished refactor. ZodForm owns the form. State that isn't in the schema goes in component `useState` and is passed through `children`, then read inside `contractAPI` via closure — don't mount a second `useForm`.

### Using `children` for something that should be a field

If a value goes into the API payload and has validation rules, it belongs in the schema with a `displayOption` — not in `children` with its own `useState`. Decision rule: **if adding the value to the Zod schema works naturally, do that.** `children` is only for content that genuinely can't round-trip through the schema (a dynamic-arity sub-editor, a legal notice, a computed preview).

### `readonly` vs `disabled`

Both render the value and prevent editing; both still submit. `disabled` is auto-forced `true` while the form is submitting, so manual `disabled: true` is rarely needed. Use `readonly: true` for edit-form identity locks (`code`, `username`).

### A thrown error skips `onError`

`onError` fires only for controlled `{ success: false }` responses. A thrown error (network, parse) bypasses it. If you need one handler for both, catch inside `contractAPI` and return a `{ success: false }` shape — but check first, the `clientAPI` wrapper usually normalises network failures already.
