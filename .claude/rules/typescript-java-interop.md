---
description: TypeScript-Java type system differences — nullable vs optional, date/number/enum/boolean mapping between JSON and Java types
paths:
  - "packages/zod-schemas/src/**/*.ts"
---

## `null` vs `undefined` — The Fundamental Difference

Java has no `undefined`. JSON has no `undefined`. `JSON.stringify` drops `undefined` fields:

```typescript
JSON.stringify({ a: 1, b: undefined, c: null })
// → '{"a":1,"c":null}'
// b is DROPPED entirely, c is KEPT as null
```

**Rule: Always use `.nullable()`, never `.optional()` for fields that can be empty.** `.optional()` produces `undefined` which disappears in JSON — Java never sees the field.

```typescript
// CORRECT — Java sees "description": null
description: z.string().nullable(),

// WRONG — Java never receives this field at all
description: z.string().optional(),
```

---

## Date/Time

Java uses ISO 8601 strings. JavaScript `Date` auto-serializes to ISO 8601 via `JSON.stringify()`.

```
Java → JSON: "2024-01-15T08:30:00Z" (ISO string)
Zod parse:   → Date object
JSON.stringify: → "2024-01-15T08:30:00.000Z" (ISO string)
Java receives: ISO string → parsed by Jackson/Gson
```

- Always use `commonZod.datetime` — never raw `z.string()` or `z.date()`
- Nullable dates: `commonZod.datetime.nullable()`
- Never send Unix timestamps — Java expects ISO 8601

---

## Number Types

Java has `int`, `long`, `float`, `double`, `BigDecimal`. JavaScript has only `number` (64-bit float).

| Java Type | Zod Pattern | Note |
|-----------|-------------|------|
| `int` / `long` | `z.int()` | Enforces whole number |
| `double` | `z.number()` | Direct mapping |
| `BigDecimal` | `z.number()` | Safe for < 2^53, precision loss possible beyond that |

- Never use `BigInt` — Java JSON libraries don't produce it

---

## Enum Mapping

Java enums serialize to `.name()` (UPPERCASE string). TypeScript const objects must match exactly.

```typescript
// Must match Java: enum ReportStatus { DRAFT, SUBMITTED, APPROVED, REJECTED }
export const ReportStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
```

- Values must be UPPERCASE strings matching Java enum names
- Never use numeric enums
- When Java adds a new value, update both the const object AND `z.enum()` array

---

## Boolean

Java primitive `boolean` is always `true` or `false`, never `null` or missing.

**Rule: A field backed by a Java primitive `boolean` must NEVER be `.nullable()` or `.optional()`.** Always `z.boolean()`.

```typescript
// CORRECT
isPublic: z.boolean(),
isPublished: z.boolean(),

// WRONG — primitive boolean can't be null in Java
isPublic: z.boolean().nullable(),
isPublic: z.boolean().optional(),
```

If a boolean field "doesn't apply yet", its value is `false` — not `null`, not `undefined`.

### Exception: tri-state `Boolean` sentinel on a PATCH-style request body

The boxed Java type `Boolean` (capital B) on a **request** field *can* be `null`, and the BE
sometimes uses that as a deliberate three-way signal: `null` = "leave unchanged", `true`/`false`
= "set to this value". A partial-update DTO is the usual home for this.

When — and **only** when — you have read the BE DTO and confirmed the field is declared `Boolean`
(boxed, nullable) with that three-way meaning, mirror it as `z.boolean().nullable()`:

```typescript
// DistrictUpdateRequest(... , Boolean clearParent)  — null = leave parent as-is, true = clear to root
clearParent: z.boolean().nullable(),
```

### Exception: boxed `Boolean` response field that BE can leave null

A **response** DTO field declared `Boolean` (boxed) — not primitive `boolean` — can serialize to
`null` (e.g. an optional sub-DTO whose flags aren't computed in every code path). When you have
read the BE response DTO and confirmed the field is boxed `Boolean`, mirror it as
`z.boolean().nullable()`:

```typescript
// IndicatorValueResponse(String code, Boolean hasTarget, Boolean hasActual) — boxed, may be null
hasTarget: z.boolean().nullable(),
hasActual: z.boolean().nullable(),
```

### The deciding test

`primitive boolean` → bare `z.boolean()` (base rule). `boxed Boolean` → `z.boolean().nullable()`
is allowed **iff** you have seen the boxed declaration. These two `.nullable()` cases — the PATCH
sentinel and the boxed response field — are the only sanctioned ones. If you cannot point at a
`Boolean` (capital B) declaration in the BE DTO, treat the field as primitive and keep it bare.