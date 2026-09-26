# ZodForm — watchEffect (Conditional Display)

`watchEffect` is how you make field visibility / colSpan / label depend on another field's value. The returned overrides are shallow-merged onto each field's base `displayOption`.

## Signature

```ts
watchEffect?: (
  values: Partial<z.infer<TSchema>>,
) => Partial<Record<keyof TSchema['shape'], Partial<FieldDisplayOption>>>
```

Called on every form value change (via `useWatch`). Returns a map of `{ fieldName: overrides }`. Anything not in the map passes through unchanged.

## Typical pattern — applicant-type conditional fields

From the dossier-create form:

```ts
watchEffect: (values) => {
  const isPersonal = values.applicantType === ApplicantType.PERSONAL;
  return {
    applicantName: {
      label: isPersonal ? 'Tên đối tượng' : 'Tên tổ chức',
      placeholder: isPersonal ? 'Nhập tên đối tượng' : 'Nhập tên tổ chức',
    },
    dateOfBirth: { hidden: !isPersonal },
    gender:      { hidden: !isPersonal },
    religion:    { hidden: !isPersonal },
    position:    { hidden: !isPersonal },
    nation:      { hidden: !isPersonal },
    idCard: {
      hidden: false,
      colSpan: isPersonal ? 3 : 6,
      label: isPersonal ? 'CCCD/CMND' : 'Mã định danh',
      placeholder: isPersonal ? 'Nhập số CCCD/CMND' : 'Nhập mã định danh',
    },
  };
},
```

### Rules

- **Merge semantics**: `{ ...baseOption, ...overrides[fieldName] }`. An override of `{ hidden: false }` can un-hide a field. An override of `{ colSpan: 3 }` replaces the base colSpan.
- **Hidden fields still submit** from `defaultValues`. If you want personal-only fields to *also* disappear from the payload, strip them in `contractAPI` (see pattern below).
- **Don't branch the schema** — one schema that accepts both shapes. Use `.superRefine` in combination for conditional-required rules.

### Stripping hidden field values in contractAPI

`hidden: true` keeps the field's default value in the form state, so it's still in `body` when `contractAPI` fires. Strip explicitly:

```ts
contractAPI: async (body) => {
  const { dateOfBirth, gender, religion, position, idCard, nation, ...baseData } = body;

  const personalFields =
    body.applicantType === ApplicantType.PERSONAL
      ? { dateOfBirth, gender, religion, position, idCard, nation }
      : {};

  return clientAPI.Dossier.create({ body: { ...baseData, ...personalFields } });
},
```

## Pair watchEffect with superRefine for conditional-required

`watchEffect` controls rendering. It does **not** change validation. To make a field required only when another field has a certain value, add a `.superRefine` to the schema:

```ts
schema: dossierContract.create.body.superRefine((data, ctx) => {
  if (data.applicantType === ApplicantType.PERSONAL) {
    if (!data.dateOfBirth) ctx.addIssue({
      code: 'custom', message: 'Bắt buộc', path: ['dateOfBirth'],
    });
    if (!data.gender) ctx.addIssue({
      code: 'custom', message: 'Bắt buộc', path: ['gender'],
    });
    // ... etc
  }
}),
```

The field-level schema for `dateOfBirth` stays `.optional()`; the conditional-required lives in the refine. This is the clean separation.

## Performance note

`watchEffect` receives **all** watched values on every change. For forms with many fields, this means frequent re-renders of the whole form. In practice it's been fine up to ~20 fields. If you ever hit a perf issue, you'd refactor `watchEffect` to use `useFormContext().watch(['specificField'])` directly inside a child — but don't bother prematurely.

## Things not to do with watchEffect

- **Don't submit from watchEffect.** It's a display-only hook.
- **Don't mutate schema.** The schema is built once; `watchEffect` only reshapes `displayOptions`.
- **Don't read external state** (e.g. route params, other queries) from inside `watchEffect` — those should be baked into `defaultValues` or the schema at construction time. `watchEffect` is pure: `values → displayOptions overrides`.
- **Don't use it to set field values.** If you need "selecting X auto-fills Y", you'd need a child effect hook with `setValue`, which is outside the watchEffect contract. For most cases, `defaultValues` covers the initial load and users fill the rest manually.
