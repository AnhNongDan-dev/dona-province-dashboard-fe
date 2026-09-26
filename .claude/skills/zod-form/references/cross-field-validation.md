# ZodForm — Cross-Field Validation

Business rules that involve **more than one field** live on the form-side schema, not the shared contract. This file documents why and how.

## Why not on the contract?

The contract schema in `packages/zod-schemas/` is the canonical shape both frontend and backend agree on. Pushing a date-range rule onto it would:

1. **Leak UX concerns into a transport contract** — the rule "endAt must be after startAt" is a *form* rule. The backend may have already validated it; or it may have different rules (e.g. allow equal dates for migrations).
2. **Break other callers** — if another form (or a test fixture, or a seeder) needs to bypass the rule, they can't.
3. **Make the contract type less useful** — refines don't change the inferred type, but they change behavior in ways that aren't obvious from the type.

Keep the contract as pure-shape + field-level rules. Put cross-field business logic at the ZodForm callsite.

## `.superRefine` vs `.refine`

| | `.refine(fn, msg)` | `.superRefine((data, ctx) => {...})` |
|---|---|---|
| Boolean return | Yes | No — use `ctx.addIssue` |
| Multiple errors | No (single message) | Yes (multiple `ctx.addIssue` calls) |
| Conditional errors | Awkward | Natural (`if (cond) ctx.addIssue(...)`) |
| Attach to specific `path` | Limited | Full control (`path: ['fieldName']`) |

**Always use `.superRefine` for cross-field.** `.refine` is for single-field derived checks that don't fit Zod primitives.

## Writing a superRefine

```ts
schema: widgetContract.update.body.superRefine((data, ctx) => {
  // `data` is the fully-parsed object — all field-level validation already passed
  if (data.endAt < data.startAt) {
    ctx.addIssue({
      code: 'custom',
      message: 'Ngày kết thúc phải sau ngày bắt đầu',
      path: ['endAt'],
    });
  }
}),
```

### The `path` key decides where the error renders

- `path: ['endAt']` → error appears under the `endAt` field.
- `path: ['applicant', 'name']` → nested path (for nested objects).
- Omit `path` → error becomes a form-level error (visible as the `_errorMessage` alert — but this is rarely what you want for validation).

**Rule of thumb**: pick the field the user will look at to fix the error. "End date is before start date" → put error on `endAt`. "File total exceeds 10" → put on `newFiles` or `existingFiles` depending on which one the user most recently changed.

### Multiple independent rules

```ts
.superRefine(({ startAt, endAt, year, existingFiles, newFiles }, ctx) => {
  // Rule 1: date order
  if (endAt < startAt) {
    ctx.addIssue({ code: 'custom', message: '...', path: ['endAt'] });
  }

  // Rule 2: year matches endAt
  const endYear = new Date(endAt).getFullYear();
  if (endYear !== year && endYear !== year + 1) {
    ctx.addIssue({
      code: 'custom',
      message: `Năm kết thúc phải là ${year} hoặc ${year + 1}`,
      path: ['endAt'],
    });
  }

  // Rule 3: at least one file required
  if (existingFiles.length + newFiles.length === 0) {
    ctx.addIssue({
      code: 'custom',
      message: 'Phải có ít nhất 1 tập tin',
      path: ['existingFiles'],
    });
  }
})
```

All three can fire in the same submit. The user sees all three errors.

## Pattern — conditional-required based on another field

When field X is required **only when** field Y has a specific value, the field-level schema stays `.optional()`, and `.superRefine` enforces the condition:

```ts
// On the contract:
//   dateOfBirth: z.date().optional(),
//   gender: z.enum([...]).optional(),
//   applicantType: z.enum(['PERSONAL', 'COLLECTIVE']),

schema: dossierContract.create.body.superRefine((data, ctx) => {
  if (data.applicantType === 'PERSONAL') {
    if (!data.dateOfBirth) ctx.addIssue({
      code: 'custom', message: 'Bắt buộc cho cá nhân', path: ['dateOfBirth'],
    });
    if (!data.gender) ctx.addIssue({
      code: 'custom', message: 'Bắt buộc cho cá nhân', path: ['gender'],
    });
    if (!data.idCard) ctx.addIssue({
      code: 'custom', message: 'CCCD/CMND bắt buộc', path: ['idCard'],
    });
  }
}),
```

Combine with `watchEffect` to hide the fields when not applicable. Both are needed:

- `watchEffect` controls display.
- `.superRefine` controls validation.

See [watch-effect.md](watch-effect.md).

## Pattern — sum-total / aggregate rules

Common in edit-with-files forms: "total files (existing + new) must be between 1 and 10":

```ts
.superRefine(({ existingFiles, newFiles }, ctx) => {
  const total = existingFiles.length + newFiles.length;
  if (total < 1) {
    ctx.addIssue({ code: 'custom', message: 'Phải có ít nhất 1 tập tin', path: ['existingFiles'] });
  }
  if (total > 10) {
    ctx.addIssue({ code: 'custom', message: 'Tối đa 10 tập tin', path: ['newFiles'] });
  }
})
```

Note how the error path differs based on which side of the rule the user is likely to fix.

## Pattern — derived field-exists check

Validate a select value against a pre-fetched list:

```ts
const { data: roles } = rolesRepository().useQuery();

const schema = userContract.update.body.superRefine((data, ctx) => {
  if (!roles.some((r) => r.id === data.roleId)) {
    ctx.addIssue({
      code: 'custom',
      message: 'Quyền không tồn tại',
      path: ['roleId'],
    });
  }
});
```

Because `schema` is built inside the component (after `useQuery`), it closes over `roles`. This is fine — `schema` is re-evaluated per render; `ZodForm` picks up the current one.

## Where `.superRefine` goes when you also `.extend`

Zod object methods compose left-to-right. `.superRefine` returns a `ZodEffects`, which is not a `ZodObject` — so you can't call `.extend` after `.superRefine`. Put `.superRefine` last:

```ts
// ✅ GOOD
widgetContract.update.body
  .omit({ attachments: true })
  .extend({ existingFiles: commonZod.previewFiles, newFiles: commonZod.uploadFiles })
  .superRefine((data, ctx) => { /* ... */ })

// ❌ BAD — .extend is not available on a ZodEffects
widgetContract.update.body
  .superRefine(...)
  .extend({ ... })   // type error
```

## Async validation

`.superRefine` can be async (return a Promise, or use `await` inside). Example: checking username uniqueness.

```ts
.superRefine(async (data, ctx) => {
  const res = await clientAPI.User.checkUsername({ query: { username: data.username } });
  if (res.success && res.data.exists) {
    ctx.addIssue({ code: 'custom', message: 'Tài khoản đã tồn tại', path: ['username'] });
  }
})
```

But: this fires on **every submit attempt**, and `useContractForm`'s resolver awaits it synchronously. For frequently-submitted forms, prefer a blur-based check on the field (outside ZodForm) rather than baking it into the schema.

## Where to put the refinement function

Inline `.superRefine((data, ctx) => { ... })` is fine for one-off rules that live with their form. Extract to a shared helper when:

- The same rule is used by two or more forms (e.g. `endAt > startAt` on report create + edit).
- The refinement body has more than 1–2 `ctx.addIssue` branches.
- The rule needs to close over runtime data (the loaded entity, a fetched list) — a factory function makes the dependency explicit.

Helpers live at `packages/zod-schemas/src/form/refinements/<domain>.refinement.ts`, re-exported from `form/refinements/index.ts`. Each file owns one domain:

```ts
// packages/zod-schemas/src/form/refinements/report.refinement.ts
import type { z } from 'zod';

type ReportDateRangeInput = {
  startAt: Date | null | undefined;
  endAt: Date | null | undefined;
};

export const reportDateRangeRefinement = (
  { startAt, endAt }: ReportDateRangeInput,
  ctx: z.RefinementCtx,
) => {
  if (startAt && endAt && endAt <= startAt) {
    ctx.addIssue({
      code: 'custom',
      message: 'Thời gian kết thúc phải sau thời gian bắt đầu',
      path: ['endAt'],
    });
  }
};

// Factory when the rule depends on already-loaded entity state
export const indicatorEditRefinementFactory =
  (indicator: Pick<Indicator, 'isPublished'>) =>
  (data, ctx) => { /* ... uses indicator.isPublished ... */ };
```

Call sites stay thin:

```ts
import { reportDateRangeRefinement, indicatorEditRefinementFactory } from '@repo/zod-schemas/src/form/refinements';

// create
const formSchema = reportContract.createReport.body.superRefine(reportDateRangeRefinement);

// edit — factory closes over the loaded indicator
const formSchema = indicatorContract.updateIndicator.body
  .extend({ isPublished: z.enum(['published', 'draft']) })
  .superRefine(indicatorEditRefinementFactory(indicator));
```

### Why not in `api-contract/`

Refinements describe *form UX*, not transport shape. Putting them on the contract body would change the inferred schema seen by every other caller (loaders, mappers, tests, the OpenAPI generator), and break the rule that `api-contract/` is the FE↔BE-agreed pure-shape layer. Helpers live under `form/` because that's where form-side artifacts already live (`form/admin-settings.form.ts`, etc.).

### Type the input as a plain object, not `z.infer<typeof someSchema>`

Helpers should not depend on a specific contract — that creates a cycle (`form/refinements/` imports from `api-contract/`, which is fine, but a form may extend the contract body before applying the refinement, so the inferred type drifts). Use a hand-written input type that names just the fields the refinement reads.

## Things not to do

- **Don't throw from `.superRefine`.** Use `ctx.addIssue`. Throwing halts parsing and turns into an opaque form-level error.
- **Don't read `methods.getValues()` or React state from inside the schema factory.** The schema is a value — it captures variables at construction. Use `useWatch` / `watchEffect` for reactive concerns, not validation.
- **Don't put navigation or side-effects in `.superRefine`.** It's a pure validator. Side effects belong in `contractAPI` or `onSuccess`.
- **Don't import a contract's `body` schema into the refinement file.** Refinements take plain object inputs; the contract composes them at the call site. This avoids cycles and lets one refinement serve multiple body shapes.
