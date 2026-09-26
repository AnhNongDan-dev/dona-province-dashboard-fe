# Request body

How to shape the `body` of a `POST`/`PUT` endpoint. For query parameters see
`query-filters.md` — bodies and query params follow **opposite** nullability rules,
so keep them separate in your mind.

## Compose inline from entity-schema fields

A body is built inline, per route, by reusing field definitions from the entity
schema. Reuse the *field*, never recopy its validation rules:

```typescript
// Preferred — reference each field via .shape
body: z.object({
  code: xxxSchema.shape.code,
  name: xxxSchema.shape.name,
  description: xxxSchema.shape.description,
}),

// Also fine — pick a subset in one step
body: xxxSchema.pick({ name: true, description: true }),
```

```typescript
// Anti-pattern — redefining a field the entity schema already owns
body: z.object({
  code: z.string().min(1).max(50),   // duplicates xxxSchema.shape.code; drifts on the next change
}),
```

### Define each route's body independently

`createXxx` and `updateXxx` often look identical today. Still give each its own
inline `body` — do not extract a shared `xxxCreateBodySchema` variable. The day
update can no longer change `code` (but create still can), you edit one route
instead of untangling a shared schema. Reuse entity *fields*, not body *schemas*.

**Sub-object component schemas are the exception.** When several routes' bodies all
embed the *same nested DTO* — e.g. `createReport` / `copyReport` / `updateReport`
each carry a `sections: z.array(reportSectionDtoSchema)` whose element mirrors one
Java sub-DTO — declaring that element as a local `const` at the top of the file is fine
and preferred. The rule forbids sharing the *whole body* (so routes can diverge field by
field); it does not forbid sharing a *structural building block* that maps 1:1 to a BE
sub-type. The test: if the shared thing is "the entire request for route X," inline it; if
it's "a nested object that BE models as its own DTO," a local `const` is correct.

## `.nullable()` vs `.optional()` — the rule that bites

This backend is Java. `JSON.stringify` **drops** `undefined` keys entirely, so an
`.optional()` field that is empty is never sent — Java never sees the key. A
`.nullable()` field sends an explicit `null`, which Java receives.

> **Porting note:** this rule exists *because* the backend is Java. A backend that
> treats a missing key the same as `null` does not strictly need it — see
> `porting.md` step 5 before applying the rule to another project.

- A body field that can be empty → **`.nullable()`**
- Never use `.optional()` on a body field to mean "can be empty"
- Boolean body fields are **never** `.nullable()` or `.optional()` — a Java boolean
  is always `true` or `false`; "not set yet" is `false`

```typescript
body: z.object({
  name: xxxSchema.shape.name,
  description: xxxSchema.shape.description.nullable(),  // empty → sends null
  isPublished: z.boolean(),                            // never nullable/optional
}),
```

(`.optional()` *is* correct for query params — there, an absent key legitimately
means "no filter". The two contexts are genuinely different.)

## Pick the type by what the field is

| Field kind | Use |
|------------|-----|
| Reused entity field | `xxxSchema.shape.fieldName` |
| Entity reference id | `commonZod.entityId` |
| Short text | `xxxSchema.shape.name`, or `z.string('Vui lòng nhập …').min(1, '…').max(N, '…')` |
| Long text (multi-line) | `commonZod.textarea`, or `xxxSchema.shape.description` |
| Enum | the domain's `xxxStatusZod` / `xxxSchema.shape.status` |
| Date / datetime | `commonZod.datetime` |
| Calendar date (no time) | `commonZod.dateOnly` |
| Time of day (no date) | `commonZod.timeOnly` |
| Day of week (0–6) | `commonZod.dayOfWeek` |
| Money amount | `commonZod.feeAmount` (decimal) / `commonZod.feeAmountInt` (whole) |

**Short vs long text** — ask "would a user need more than one line?" If yes, it is a
textarea field; reuse `commonZod.textarea` (or a `description`-style entity field)
so the form renders it as a `<textarea>`.

### Enums (the single owner of the enum-sourcing rule)

An enum field — in a body or a query filter — references the domain's **published**
enum: `xxxSchema.shape.status`, the standalone `xxxStatusZod`, or the shared
`commonStatusZod`. Never `z.string()` and never an inline `z.enum([...])` — an
inline copy drifts from the allowed value set the moment the entity changes.

If the enum does not exist yet, it does **not** belong in the contract. Define it in
the entity schema first (the `sync-entity-schemas` skill owns the const-object +
`z.enum` pattern), then import it here. The contract only ever *consumes* an enum.

## Vietnamese error messages

Every inline body field needs explicit Vietnamese validation messages — they surface
directly in the form UI. Fields pulled from `commonZod.*` or an entity schema
already carry their messages; only fields you define inline need them added:

```typescript
note: z.string('Vui lòng nhập ghi chú').max(500, 'Ghi chú quá dài, tối đa 500 ký tự'),
```

## Bulk / array bodies

An endpoint that accepts many items takes an array, guarded against an empty
payload with `.nonempty()` (or `.min(1)`):

```typescript
body: z.object({
  items: z.array(z.object({
    id: commonZod.entityId,
    role: roleZod,
  })).nonempty('Danh sách không được để trống'),
}),
```

## Bodyless POST / PUT

A state-change endpoint that needs no input (`/publish`, `/cancel`) declares
`body: c.noBody()` — see `endpoint-patterns.md`.
