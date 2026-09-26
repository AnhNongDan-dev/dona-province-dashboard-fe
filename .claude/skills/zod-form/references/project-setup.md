# ZodForm — Reusing This Skill in Another Project

This skill documents a **pattern**, not just one codebase. The pattern transfers to any React + Zod v4 + react-hook-form project. This file is the porting guide: what is universal, what is a per-project binding, and what the target project must already have (or build).

## Universal vs project-specific

**Universal** — true in any project that adopts the pattern; the bulk of this skill:

- A single Zod schema drives discovery, rendering, validation, and submission.
- Field detection is **description-based** — markers on the schema decide the renderer.
- `displayOptions` is a parallel map keyed by field name (label, colSpan, choice options…).
- Three render modes: inline, dialog, drawer.
- Cross-field validation lives on the **form-side** schema (`.superRefine`), never the shared contract.
- File flows are extracted into named helpers.
- The submit callback returns a discriminated `{ success: true | false }` response; field errors map back inline.

**Project-specific bindings** — names and import paths that differ per project. Everything in the skill is written against `dona-province-dashboard-fe`'s bindings (most of them still to be ported from ELP-fe — see the note at the top of `SKILL.md`); remap this table and the rest applies:

| Concept | `dona-province-dashboard-fe` | Your project |
|---|---|---|
| Form component + helper | `ZodForm`, `createZodFormProps` — `@/components/zod-form/zod-form` | _fill in_ |
| Field dispatcher + types | `ZodField`, `FieldDisplayOption`, `FieldInfo` — `@/components/zod-form/zod-field` | _fill in_ |
| Form hook | `useContractForm` — `@/hooks/use-contract-form` | _fill in_ |
| Dialog opener | `openZodFormDialog`, `ZodFormDialogEvent` — `@/components/global/zod-form.dialog` | _fill in_ |
| Drawer opener | `openZodFormDrawer`, `ZodFormDrawerEvent` — `@/components/global/zod-form.drawer` | _fill in_ |
| Schema helpers | `commonZod` — `@repo/zod-schemas/src/common` | _fill in_ |
| Detection markers | `SCHEMA_DESCRIPTION` — `@repo/zod-schemas/src/common` | _fill in_ |
| Wrapper-unwrap utils | `getFinalTypeName`, `getSchemaDescription` — `@repo/zod-schemas/src/zod.utils` | _fill in_ |
| API client | `clientAPI` — `@/config/clientAPI.config` | _fill in_ |
| Response type | `IResponse<T>` — `@repo/zod-schemas/src/api/response` | _fill in_ |
| Permission gate | `<PermissionCheck>` — `@/components/permission-check` | _fill in_ |
| Overlay size token | `OverlaySize` — `@/lib/overlay-size` | _fill in_ |
| Async-search option schema | `AsyncSearchComboboxOptionSchema`, `AsyncSearchComboboxOption` — `@/components/common/async-search-combobox` | _fill in_ |
| Event bus | `eventBus`, `EventBusName` — `@/lib/event-bus` | _fill in_ |
| Toast | `sonner` `toast` | _fill in_ |

This table is canonical. The table in `SKILL.md` is a shorter quick-glance subset of the most-used rows — when you add or change a binding, update it there too.

Beyond imports, the **UI language** (this project is Vietnamese) and **entity/domain names** (widget, district, report, dossier…) are obviously project-specific — substitute freely. The internal building blocks `ZodField` composes (`CommitSelect`, `LoadingButton`, `FormErrorMessage`, the `fields/*` library) are not things a *form author* imports — they only matter to a Scenario B port (below).

## What the target project must have

For the skill to apply, the project needs the pieces below. Two scenarios:

**Scenario A — the project already has a schema-driven form system.** Then this skill is purely a *usage guide*: fill in the binding table, and read the references for the design rationale. But the mechanics may differ from this project's — before trusting a behavioural claim, answer these against the *new* project's code:

- Does the dialog/drawer **auto-close** on success, or must `onSuccess` close it?
- Does the dialog **auto-apply** submit-button alignment (`ml-auto`), or is it manual?
- What is the **detection → render-chain order**? Which renderers beat `displayOptions`; is `textarea` weak?
- Does an emptyable textarea emit `null` (→ field must be `.nullable()`) or `''`/`undefined`?
- Does the response type **discriminate** `success: true | false`, and how are field errors shaped?
- Does the grid use a **container query** (`@container`) or a viewport breakpoint?

Wherever the answer differs, that reference's "lessons learned" change with it — rewrite them, don't copy them.

**Scenario B — building the system fresh.** Port these building blocks (each maps to a file in the table in [architecture.md](architecture.md) → "File layout"):

1. **Wrapper-unwrap utils** — `getFinalTypeName` / `getSchemaDescription`: recursively peel `ZodOptional / ZodNullable / ZodDefault / ZodCatch / ZodPipe / ZodReadonly`. Everything downstream depends on these.
2. **`SCHEMA_DESCRIPTION` + `commonZod`** — the marker enum and the helper schemas that attach markers. Start with the kinds you need (date, textarea, files, money, …).
3. **`analyzeSchema`** — `schema.shape` → `FieldInfo[]` (`{ fieldName, type, required }`), with the type allowlist.
4. **`getFieldType` + `ZodField` + the field library** — the classifier, the dispatcher, and one `fields/*.field.tsx` component per renderer. The field library is the **bulk of the porting work** — ELP-fe has 18 generic ones (`card-radio-group`, `citizen-id`, `date-picker`, `date-time-picker`, `email`, `file-preview`, `file-upload`, `gender`, `money`, `multi-select-combobox`, `password`, `phone`, `radio-group`, `short-duration`, `star-rating`, `time-picker`, `toggle-group`, `username`) plus the ELP-only `problem-languages`, which this project does not need — see [architecture.md](architecture.md) → "Fields directory"). Start with only the renderers you need; add the rest via the 5-step chain in [extending.md](extending.md). Also port `FormErrorMessage` (inline per-field error) and the shared `CommitSelect` / `LoadingButton` the chain depends on.
5. **`useContractForm`** — `useForm` + `zodResolver(schema, …, { raw: true })` + `useMutation`; on `{ success: false }`, `setError` per field + a virtual `_errorMessage` banner field.
6. **`ZodForm`** — composes 3–5, renders the 6-col grid, the error banner, the submit button.
7. **Dialog/drawer singletons + event bus** — `openZodFormDialog` emits an event; a root-mounted `<ZodFormDialog>` renders the payload. `ZodForm` fires the close events on success.
8. **The response contract** — a discriminated `IResponse<T>` so `useContractForm` can route field errors and the general message. The failure branch carries `errors: Array<{ fieldName, ... }>`; for the exact shape `useContractForm` iterates to call `setError`, see [architecture.md](architecture.md) → "`useContractForm`".

## Adapting the skill files themselves

When you copy this skill into a new project:

1. Rewrite both binding tables with the new project's paths — the canonical one above, and the quick-glance subset in `SKILL.md`.
2. Re-verify every behavioural claim against the new code — especially the ones this skill flags as easy to get wrong: **does the overlay auto-close?**, **does the dialog auto-apply `ml-auto`?**, **what is the `getFieldType` → render-chain order?**, **does an emptyable textarea emit `null`?**. If the new implementation differs, the skill's "lessons learned" change with it.
3. Replace the concrete examples (entity names, Vietnamese strings) — keep them concrete, just match the new domain. Concrete examples beat abstract ones for day-to-day use.
4. Keep [extending.md](extending.md) — the 5-step chain is the same shape in any implementation of this pattern.

An inaccurate skill is worse than no skill: it makes the model confidently do the wrong thing. The single most important porting step is step 2.
