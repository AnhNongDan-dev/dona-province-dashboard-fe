# Endpoint patterns beyond standard CRUD

The six families below cover every endpoint that does not fit the standard CRUD
template in `SKILL.md`. Each is self-contained — read only the one you need. The
worked examples use illustrative province-dashboard domains (this repo has no contracts
yet) — the paths, methods, body and response *patterns* are the ones to follow; large
response objects are abbreviated (and marked as such) and `summary`/`description`
prose is kept short.

## Verb prefix: choosing the endpoint key

The endpoint key name signals what the endpoint does. Pick the prefix first; the
rest of the pattern follows.

| Prefix | Use for | Example |
|--------|---------|---------|
| `search` | the one canonical top-level paginated list with text search | `searchProvinces` |
| `get` | a single record by id | `getProvinceById` |
| `find` | any other read — nested, scoped, or aggregate | `findProvinceDistricts`, `findMyReports` |
| `create` / `update` / `delete` | standard mutations | `createProvince` |
| an action verb | a state mutation that is not plain create/update/delete | `publishReport`, `assignIndicator` |
| `bulk{Verb}` | a batch operation over many records | `bulkCreateIndicatorValues` |

---

## 1. `find*` reads — scoped, nested, or aggregate lists

`search{Domain}s` is reserved for the single canonical list. Every *other* read uses
`find*`. Three sub-cases:

**Nested list** — records that belong to a parent in the path. Paginated, so it
extends `searchOptionsSchema` and returns `searchResultsSchema(...)`:

```typescript
findProvinceDistricts: {
  summary: 'Find province districts',
  description: 'Find districts of a specific province with pagination',
  method: 'GET',
  path: '/api/v1/provinces/:provinceId/districts',
  headers: jwtAuthHeaderSchema,
  pathParams: z.object({ provinceId: commonZod.pathId }),
  query: searchOptionsSchema.extend({
    status: commonStatusZod.optional().catch(undefined),
  }),
  responses: { 200: successResponseSchema(searchResultsSchema(districtItemSchema)) },
  metadata: OpenAPIHelper.generateErrorCodes(ErrorCode.Forbidden, ErrorCode.ResourcesNotFound),
},
```

**Scoped-to-caller list** — "my …", derived from the JWT, no owner id in the path.
A scoped list may or may not be paginated — `findMyReports` returns *all* rows, so
it has no `query` and returns a plain `z.array(...)`. (Add `query: searchOptionsSchema`
and wrap the response in `searchResultsSchema(...)` only if it should page.)

```typescript
findMyReports: {
  summary: 'List my reports',
  description: 'Return every report owned by the signed-in user; not paginated',
  method: 'GET',
  path: '/api/v1/reports/my',
  headers: jwtAuthHeaderSchema,           // the JWT IS the scope — no owner id in the path
  responses: {
    200: successResponseSchema(
      z.array(z.object({
        id: commonZod.entityId,
        reportType: reportTypeZod.nullable(),
        reportStatus: reportStatusZod,
        totalValue: z.number().nullable(),
        // …further fields abbreviated — the real endpoint returns the full report shape
      })),
    ),
  },
  metadata: OpenAPIHelper.generateErrorCodes(ErrorCode.Forbidden),
},
```

**Aggregate list** — a computed shape (counts, rollups) — see *Aggregate responses* below.

---

## 2. Action endpoints — verb-named state mutations

A mutation that is not plain create/update/delete. The path ends in the action; the
verb-named key carries the meaning. Body is only the action's own fields, or
`c.noBody()` when the action needs no input. The response is `successResponseSchema()`
(no payload), like an update.

```typescript
// Action with input
assignIndicator: {
  summary: 'Assign indicator to district',
  description: 'Assign an indicator to a district for reporting',
  method: 'POST',
  path: '/api/v1/districts/:districtId/indicators',
  headers: jwtAuthHeaderSchema,
  pathParams: z.object({ districtId: commonZod.pathId }),
  body: z.object({
    indicatorId: districtIndicatorSchema.shape.indicatorId,
    isRequired: districtIndicatorSchema.shape.isRequired,
  }),
  responses: { 200: successResponseSchema() },
  metadata: OpenAPIHelper.generateErrorCodes(
    ErrorCode.Forbidden, ErrorCode.ResourcesNotFound, ErrorCode.DuplicateEntry,
  ),
},

// Action with no input — bodyless
publishReport: {
  summary: 'Publish report',
  description: 'Publish a draft report so it becomes visible on the dashboard',
  method: 'PUT',
  path: '/api/v1/reports/:reportId/publish',
  headers: jwtAuthHeaderSchema,
  pathParams: z.object({ reportId: commonZod.pathId }),
  body: c.noBody(),
  responses: { 200: successResponseSchema() },
  metadata: OpenAPIHelper.generateErrorCodes(
    ErrorCode.Forbidden, ErrorCode.ResourcesNotFound, ErrorCode.InvalidStatusTransition,
  ),
},
```

The `updateXxxStatus` route in the standard template is the most common action
endpoint — already in `SKILL.md`.

---

## 3. Bulk endpoints

A batch operation. Key is `bulk{Verb}{Domain}s`; the body wraps a non-empty array
(guard with `.nonempty()` — see `request-body.md` → *Bulk / array bodies*). Real
example — `bulkCreateIndicatorValues` records one indicator's values for many districts in a period:

```typescript
bulkCreateIndicatorValues: {
  summary: 'Bulk create indicator values',
  description: 'Record the values of an indicator for many districts in one reporting period',
  method: 'POST',
  path: '/api/v1/indicators/:indicatorId/values/bulk',
  headers: jwtAuthHeaderSchema,
  pathParams: z.object({ indicatorId: commonZod.pathId }),
  body: z.object({
    periodStart: commonZod.dateOnly,
    periodEnd: commonZod.dateOnly,
    values: z.array(z.object({
      districtId: commonZod.entityId,
      value: z.number(),
    })).nonempty('Cần ít nhất một giá trị chỉ tiêu'),
  }),
  responses: {
    200: successResponseSchema(
      z.object({
        totalCreated: z.int().min(0),
        totalSkipped: z.int().min(0),
        createdValues: z.array(z.object({
          id: commonZod.entityId,
          districtId: commonZod.entityId,
          value: z.number(),
          // …further value fields abbreviated
        })),
        // …the response also reports skipped districts — abbreviated here
      }),
    ),
  },
  metadata: OpenAPIHelper.generateErrorCodes(
    ErrorCode.Forbidden, ErrorCode.ResourcesNotFound, ErrorCode.InvalidStatusTransition,
  ),
},
```

A bulk endpoint often returns a *summary* of what it did (created/skipped counts) —
that is an aggregate response (see family 6), not a plain `successResponseSchema()`.

---

## 4. Sub-resource paths

A resource nested under a parent. The path carries every ancestor id, and
`pathParams` declares each one. Name path params `{domain}Id`, never bare `id` —
`commonZod.pathId` coerces each:

```typescript
deleteDistrictIndicator: {
  summary: 'Remove indicator from district',
  description: 'Hard-remove an indicator assignment from the district',
  method: 'DELETE',
  path: '/api/v1/districts/:districtId/indicators/:assignmentId',
  headers: jwtAuthHeaderSchema,
  pathParams: z.object({
    districtId: commonZod.pathId,
    assignmentId: commonZod.pathId,
  }),
  body: c.noBody(),
  responses: { 200: successResponseSchema(z.undefined()) },
  metadata: OpenAPIHelper.generateErrorCodes(
    ErrorCode.Forbidden, ErrorCode.ResourcesNotFound, ErrorCode.DistrictIndicatorInUse,   // a domain code you add to error.schema
  ),
},
```

A sub-resource that has its own backend controller gets its **own** contract file
(`district-indicator.contract.ts`); otherwise it lives in the parent's contract.

---

## 5. Public endpoints — no auth

An endpoint reachable without logging in **omits `headers`** entirely. Omitting the
header also means the auth error codes are not auto-added (see
`responses-and-errors.md`), so `generateErrorCodes()` lists only what truly applies:

```typescript
getStatsOverview: {
  summary: 'Public system stats',
  description: 'Return headline counts for the public landing page',
  method: 'GET',
  path: '/api/v1/public/stats/overview',
  // no headers → public
  responses: { 200: successResponseSchema(publicStatsOverviewSchema) },
  metadata: OpenAPIHelper.generateErrorCodes(),   // no Forbidden — nothing to forbid
},
```

By this project's convention, public read endpoints live under `/api/v1/public/...`.
The prefix is a per-project choice — match whatever existing public routes use.

---

## 6. Aggregate responses — endpoint-specific shapes

Most responses reuse an entity schema (`xxxItemSchema`, `xxxDetailSchema`). But an
endpoint that returns a *computed* shape — counts, rollups, joins that match no
single entity — declares its own shape: an inline `z.object` (as
`findProvincesWithDistrictCount` does below), or a local `const` at the top of the
contract file (as `getStatsOverview` does with `publicStatsOverviewSchema`). This is
the one place not reusing an entity schema is correct, because the shape genuinely
belongs to that one endpoint.

```typescript
findProvincesWithDistrictCount: {
  summary: 'Provinces with district count',
  description: 'List provinces with the number of districts per province',
  method: 'GET',
  path: '/api/v1/provinces/district-summary',
  headers: jwtAuthHeaderSchema,
  query: searchOptionsSchema.extend({
    status: commonStatusZod.optional().catch(undefined),
  }),
  responses: {
    200: successResponseSchema(
      searchResultsSchema(
        z.object({
          id: commonZod.entityId,
          code: commonZod.code,
          name: commonZod.name,
          description: commonZod.description.nullable(),
          status: commonStatusZod,
          districtCount: z.int().min(0),               // the computed field
          createdBy: commonZod.entityId.nullable(),
          createdAt: commonZod.datetime.nullable(),
        }),
      ),
    ),
  },
  metadata: OpenAPIHelper.generateErrorCodes(ErrorCode.Forbidden),
},
```

Still build the inline object from `commonZod` fields where they exist — only the
*composition* is endpoint-specific, not the field validation. If the same aggregate
shape is needed by a second endpoint, promote it to an entity-schema variant rather
than copying the inline object.
