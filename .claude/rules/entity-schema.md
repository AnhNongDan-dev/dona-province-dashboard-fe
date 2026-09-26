---
description: Rules for creating and maintaining Zod entity schemas — enums, types, composition, validation, and naming conventions
paths:
  - "packages/zod-schemas/src/entity/**/*.ts"
---

> `packages/zod-schemas/src/entity/` does not exist yet — create it with the first entity file.

## Enum Definition (Mandatory Pattern)

Every field with a finite set of values (status, type, category, role, period type, etc.) MUST use the full 5-part enum block. Never use `z.string()` or TypeScript `enum` for these.

```typescript
// 1. Const object (runtime values, single source of truth)
export const XxxStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;

// 2. Type extraction (compile-time constraint)
export type XxxStatus = (typeof XxxStatus)[keyof typeof XxxStatus];

// 3. Zod enum (runtime validation)
export const xxxStatusZod = z.enum(['ACTIVE', 'INACTIVE']);

// 4. Label map (UI display — Record ensures exhaustive coverage)
export const XXX_STATUS_LABEL: Record<XxxStatus, string> = {
  [XxxStatus.ACTIVE]: 'Active',
  [XxxStatus.INACTIVE]: 'Inactive',
};

// 5. Options array (dropdowns/selects)
export const XXX_STATUS_OPTIONS = Object.values(XxxStatus).map((s) => ({
  value: s,
  label: XXX_STATUS_LABEL[s],
}));
```

### Naming: `PascalCase` for const+type, `camelCaseZod` for zod, `UPPER_SNAKE_LABEL` / `UPPER_SNAKE_OPTIONS` for maps.

---

## Type Export (Always via `z.infer`)

Never manually define entity types. Always derive from the schema:

```typescript
export const xxxSchema = z.object({ ... });
export type Xxx = z.infer<typeof xxxSchema>;

export const xxxItemSchema = xxxSchema.omit({ ... });
export type XxxItem = z.infer<typeof xxxItemSchema>;
```

### Branded fields live in `custom-type.ts`

Any field using `.brand(...)` produces a nominal type that's incompatible with raw `string`. These belong in `packages/zod-schemas/src/custom-type.ts`, not in `commonZod`. Each entry exports **three** things: the full schema (with `.meta()` / `.describe()`), the inferred type, and a `parseXxx` helper that decomposes the branded string into its structured parts.

```typescript
// custom-type.ts
export const dateOnlyZod = z.iso.date("Ngày không hợp lệ").brand("YYYY-MM-DD")
  .meta({ examples: ["2024-01-15"] })
  .describe("DATE_ONLY");
export type DateOnly = z.infer<typeof dateOnlyZod>;

// parseXxx returns the meaningful parts of the branded value
export function parseDateOnly(value: DateOnly): { year: number; month: number; day: number } {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}
```

The `parseXxx` helper is mandatory — it's the single sanctioned way to **read** the parts of a branded string. Consumers must never hand-split or regex-extract from a `DateOnly` / `TimeOnly` / `SortQuery` etc. at a call site; always call `parseXxx(value)` so the decomposition logic lives in exactly one place next to the schema.

`commonZod` re-references these schemas so entity code can keep using `commonZod.dateOnly`. Consumers needing the **type** or **parser** import from `custom-type.ts` directly:

```typescript
import { parseDateOnly, type DateOnly } from "@repo/zod-schemas/src/custom-type";
```

---

## Field Reuse (commonZod First)

Every user-facing field MUST come from the shared `commonZod` object. Never define fields inline in entity schemas.

- Field exists in `commonZod` → use it directly
- Field does NOT exist → add it to `commonZod` first (with validation + error messages), then reference it
- Always read `packages/zod-schemas/src/common.ts` to check available fields before creating/editing entity schemas

This ensures consistent validation, error messages, and OpenAPI metadata across the entire codebase.

### commonZod fields must be bare — no `.nullable()` or `.optional()`

Fields in `commonZod` define **validation rules only**. Nullability is a schema-level concern decided by each entity or contract — apply `.nullable()` / `.optional()` at the usage site, never inside `commonZod`.

### Textarea fields

If a field is displayed as a multiline textarea in UI, use `commonZod.textarea` or `commonZod.description` (which already include `.describe(SCHEMA_DESCRIPTION.TEXTAREA)`). Do not define custom long-text fields inline.

### Vietnamese error messages (when adding new fields to `commonZod`)

| Validation | Pattern |
|---|---|
| `z.string(msg)` | `'Vui lòng nhập [tên field]'` |
| `.nonempty(msg)` | `'Vui lòng nhập [tên field]'` |
| `.min(n, msg)` | `'[Field] phải có ít nhất N ký tự'` |
| `.max(n, msg)` | `'[Field] quá dài, tối đa N ký tự'` |
| `.positive(msg)` | `'[Field] phải là số dương'` |
| `.refine(fn, msg)` | Descriptive Vietnamese constraint message |

Skip messages on internal/computed fields (IDs, counts, booleans).

---

## Schema Composition

### Derive variants — never redefine from scratch

```typescript
// Omit sensitive/internal fields, add computed fields
export const xxxItemSchema = xxxSchema
  .omit({ password: true, deleted: true })
  .extend({
    relatedCount: z.int().min(0).meta({ examples: [5, 20] }),
  });

// Pick specific fields for lightweight views
export const xxxSearchItemSchema = xxxSchema
  .pick({ id: true, name: true, status: true });

// Partial for update inputs (all fields optional)
export const xxxUpdateSchema = xxxSchema
  .pick({ name: true, description: true })
  .partial();

// Reference a single field from another schema
body: z.object({
  name: xxxSchema.shape.name,
  categoryId: otherSchema.shape.id,
});
```

### Standard variant hierarchy

| Variant | Purpose | Pattern |
|---------|---------|---------|
| `xxxSchema` | Base entity (all fields) | `z.object({ ... })` |
| `xxxItemSchema` | List/table row | `.omit()` + `.extend()` from base |
| `xxxDetailSchema` | Detail/show view | `.omit()` + `.extend()` from base |
| `xxxSummarySchema` | Minimal summary | `.pick()` from base |
| `xxxBodySchema` | Create/update request body | `.pick()` / `.partial()` / new `z.object()` referencing `.shape` |

---

## Metadata and Documentation

```typescript
// .meta() — for OpenAPI docs and examples (on every string/number/date field)
.meta({ examples: ['value1', 'value2'] })

// .meta() on main schema — title and description
xxxSchema.meta({ title: 'EntityName', description: 'Entity description' })

// .describe() — ONLY for ZodForm UI rendering hints (applied inside commonZod)
.describe(SCHEMA_DESCRIPTION.TEXTAREA)    // multiline text
.describe(SCHEMA_DESCRIPTION.DATETIME)    // date/time picker
.describe(SCHEMA_DESCRIPTION.UPLOAD_FILES) // file upload
.describe(SCHEMA_DESCRIPTION.NEW_PASSWORD) // password strength
```

---

## Custom Validation

Use `.refine()` only. Never `.check()` or `.superRefine()` for single-rule validations.

```typescript
z.string('...')
  .refine((val) => /^[\p{L}\s]+$/u.test(val), 'Only letters and spaces allowed')
  .refine((val) => !val.includes('  '), 'No consecutive spaces')
```

Chain multiple `.refine()` calls for multiple rules — each gets its own error message.

---

## Zod v4 API (Not v3)

| Use (v4) | NOT (v3) |
|-----------|----------|
| `z.email('msg')` | `z.string().email('msg')` |
| `z.url()` | `z.string().url()` |
| `z.int()` | `z.number().int()` |
| `z.iso.datetime()` | `z.string().datetime()` |
| `z.iso.date()` | `z.string().date()` |
| `z.iso.time()` | `z.string().time()` |
| `z.file()` | `z.instanceof(File)` |
| `z.templateLiteral([...]).brand('...')` | N/A |
| `.meta({ examples })` | N/A |

---

## Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| File | `[domain]-schema.ts` | `district-indicator-schema.ts` |
| Main schema | `[domain]Schema` | `districtIndicatorSchema` |
| Item schema | `[domain]ItemSchema` | `districtIndicatorItemSchema` |
| Detail schema | `[domain]DetailSchema` | `districtIndicatorDetailSchema` |
| Body schema | `[domain]BodySchema` | `districtIndicatorBodySchema` |
| Type | `[Domain]` (PascalCase) | `DistrictIndicator` |
| Enum const + type | `[Domain][Field]` | `DistrictIndicatorStatus` |
| Zod enum | `[domain][Field]Zod` | `districtIndicatorStatusZod` |
| Label map | `[DOMAIN]_[FIELD]_LABEL` | `DISTRICT_INDICATOR_STATUS_LABEL` |
| Options array | `[DOMAIN]_[FIELD]_OPTIONS` | `DISTRICT_INDICATOR_STATUS_OPTIONS` |

---

## Forbidden Patterns

- `enum` keyword (TypeScript enum) — use const object + type union
- Inline field definitions in entity schemas — use `commonZod`
- `z.string()` for finite-value fields — use full enum block
- `as any` or `as unknown as X` — fix the type
- Manual type definitions — use `z.infer<typeof schema>`
- Redefined variant schemas from scratch — use `.omit()` / `.pick()` / `.extend()`
