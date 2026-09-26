# Query filters

How to declare the `query` of a `GET` endpoint. For request *bodies* (POST/PUT) see
`request-body.md` — they follow a different nullability rule and must not be confused.

## The base: `searchOptionsSchema`

Every paginated list extends `searchOptionsSchema`. It already provides four fields —
**don't redeclare them** to add a filter, and **don't restate them** with the same
rules:

| Field | Meaning |
|-------|---------|
| `query` | Free-text search term |
| `page` | Zero-based page index (default `0`) |
| `size` | Page size (default `20`, min `10`, max `100`) |
| `sort` | `field,asc` / `field,desc` sort directive |

```typescript
query: searchOptionsSchema.extend({
  // only the domain-specific filters go here
}),
```

### The one sanctioned override: relaxing `query` sanitization

The base `query` runs a transform that **strips every non-letter / non-digit / non-space
character** (`.replace(/[^\p{L}\p{N}\s]/gu, "")`) before sending. That is right for
searching human names, but it silently mangles searches against fields whose values can
contain symbols — e.g. an indicator named `"GRDP (%)"`, `"Tỷ lệ hộ nghèo/tổng hộ"`, `"A+B"` would have
its search term reduced to `"C"`, `"F"`, `"AB"` and never match.

When the searched field legitimately holds special characters **and** the backend already
LIKE-escapes the term itself (so passing raw is safe), override `query` to a passthrough:

```typescript
query: searchOptionsSchema.extend({
  // BE searches indicator name (no @Pattern, may be "GRDP (%)") and LIKE-escapes server-side
  // via ValidateUtil.sanitizeQueryString — so DON'T strip symbols here, pass raw.
  query: z.string().optional().catch(undefined),
  category: indicatorCategoryZod.optional().catch(undefined),
}),
```

Two preconditions, both required — **document the reason inline**, since an undecorated
override reads like an accidental restatement:
1. The searched field has no character restriction (no `@Pattern` / charset `@Size`), so users will search symbols.
2. The backend escapes LIKE metacharacters (`%`, `_`, `\`) itself — otherwise stripping them was the only thing protecting the query, and you must keep it.

If neither holds, leave `query` inherited from the base. This is the *only* base field with a sanctioned override; never redeclare `page` / `size` / `sort`.

A `GET` that is not a paginated list (a nested lookup, a date-range query) uses a
plain `z.object({...})` instead — see the date-range example below.

## Declare every filter explicitly

The `query` object is a closed contract: a filter the backend supports **must** be
named here, and anything not named is unsupported. No catch-all `z.record()`, no
loose `z.string()` placeholders — every filter is named and typed.

```typescript
query: searchOptionsSchema.extend({
  status: xxxStatusZod.optional().catch(undefined),            // enum
  categoryId: commonZod.entityId.optional().catch(undefined),  // entity reference
  isPublished: commonZod.queryBoolean.optional().catch(undefined), // boolean
  from: commonZod.datetime.optional().catch(undefined),        // date/time
}),
```

## Two modifiers every filter needs: `.optional().catch(undefined)`

- **`.optional()`** — a filter is opt-in; absence means "do not filter on this".
  Query params use `.optional()`, *not* `.nullable()`: a URL either has the param or
  it does not. (Bodies are the opposite — see `request-body.md`.)
- **`.catch(undefined)`** — if the value is malformed (e.g. `?status=banana`), fall
  back to `undefined` and ignore the filter. A bad filter value should never turn
  the whole request into a `400`; the user just gets unfiltered results.

## Pick the type by what the filter is

| Filter kind | Use | Why |
|-------------|-----|-----|
| Enum (status, type, role) | the domain's `xxxStatusZod` from the entity schema | one source of truth for the allowed values |
| Entity reference id | `commonZod.entityId` | coerces the string param to a positive int |
| Boolean | `commonZod.queryBoolean` | see the warning below |
| Date / datetime | `commonZod.datetime` | parses an ISO string to a `Date` |
| Calendar date (no time) | `commonZod.dateOnly` | date-only `"YYYY-MM-DD"`, no time component |
| Free integer (not an id) | `z.coerce.number().int().positive().optional().catch(undefined)` | query params arrive as strings — coerce |

### Booleans: use `commonZod.queryBoolean`, not `z.coerce.boolean()`

`z.coerce.boolean()` runs JavaScript's `Boolean()` — and `Boolean("false")` is
`true`, so **every** non-empty string becomes `true`. That silently breaks any
`?flag=false` filter. `commonZod.queryBoolean` is a `z.preprocess` that maps
`"true"`/`"1"` → `true` and `"false"`/`"0"` → `false`, which is what a query
param needs.

### Enums: reference the domain's published enum

An enum filter uses the domain's `xxxStatusZod` / `commonStatusZod` — never
`z.string()` or an inline `z.enum([...])`. This is the same sourcing rule as enum
body fields, so it has a single owner: `request-body.md` → *Enums*, which also says
what to do when the enum does not exist yet. The query-only part is the modifier
chain — `xxxStatusZod.optional().catch(undefined)`.

## Worked examples

Illustrative snippets — imports are omitted; `districtItemSchema`, `indicatorValueSchema`
and the like come from the relevant `../entity/*-schema` file.

```typescript
// Paginated list with an enum + an entity-reference filter
searchDistricts: {
  summary: 'Search districts',
  description: 'Search districts with pagination',
  method: 'GET',
  path: '/api/v1/districts',
  headers: jwtAuthHeaderSchema,
  query: searchOptionsSchema.extend({
    provinceId: commonZod.entityId.optional().catch(undefined),
    status: commonStatusZod.optional().catch(undefined),
  }),
  responses: { 200: successResponseSchema(searchResultsSchema(districtItemSchema)) },
  metadata: OpenAPIHelper.generateErrorCodes(ErrorCode.Forbidden),
},

// A GET that is not a paginated list — plain z.object, same .optional().catch() rule
findIndicatorValues: {
  summary: 'Find indicator values',
  description: 'List values of an indicator within a time range',
  method: 'GET',
  path: '/api/v1/indicators/:indicatorId/values',
  headers: jwtAuthHeaderSchema,
  pathParams: z.object({ indicatorId: commonZod.pathId }),
  query: z.object({
    from: commonZod.datetime.optional().catch(undefined),
    to: commonZod.datetime.optional().catch(undefined),
  }),
  responses: { 200: successResponseSchema(z.array(indicatorValueSchema)) },
  metadata: OpenAPIHelper.generateErrorCodes(ErrorCode.Forbidden, ErrorCode.ResourcesNotFound),
},
```
