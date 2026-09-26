---
description: Rules for creating ts-rest API contract schemas — route structure, CRUD patterns, response wrappers, query/path params, error codes, and schema composition
paths:
  - "packages/zod-schemas/src/api-contract/**/*.ts"
---

## Contract File Structure

```typescript
import { initContract } from '@ts-rest/core';
import z from 'zod';
import { ErrorCode } from '../api/error.schema';
import { successResponseSchema } from '../api/response';
import { commonZod, searchOptionsSchema, searchResultsSchema } from '../common';
import { jwtAuthHeaderSchema } from './schemas/token.schema';
import { OpenAPIHelper } from '../openapi/openAPI.helper';
// entity imports...

const c = initContract();

export const xxxContract = c.router({
  // routes...
});
```

---

## Route Definition

Every route follows this shape:

```typescript
routeName: {
  summary: 'Short description',
  description: 'Detailed description',
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: '/api/v1/...',
  headers: jwtAuthHeaderSchema,                    // omit for public routes
  pathParams: z.object({ id: commonZod.pathId }),  // omit if no path vars
  query: searchOptionsSchema.extend({ ... }),      // omit if no query
  body: z.object({ ... }),                         // omit for GET/DELETE, or use c.noBody()
  responses: {
    200: successResponseSchema(dataSchema),
  },
  metadata: OpenAPIHelper.generateErrorCodes(ErrorCode.Forbidden, ...),
},
```

### Mandatory rules:
- All paths prefixed with `/api/v1/`
- Protected routes MUST include `headers: jwtAuthHeaderSchema`
- Every route MUST have `metadata` with relevant error codes
- `summary` and `description` are required for OpenAPI docs

---

## CRUD Patterns

### List (paginated)

```typescript
listXxxs: {
  method: 'GET',
  path: '/api/v1/xxxs',
  query: searchOptionsSchema.extend({
    status: xxxStatusZod.optional().catch(undefined),
    categoryId: commonZod.entityId.optional().catch(undefined),
  }),
  responses: {
    200: successResponseSchema(searchResultsSchema(xxxItemSchema)),
  },
},
```

### Get by ID

```typescript
getXxxById: {
  method: 'GET',
  path: '/api/v1/xxxs/:xxxId',
  pathParams: z.object({ xxxId: commonZod.pathId }),
  responses: {
    200: successResponseSchema(xxxDetailSchema),
  },
},
```

### Create — response `200` with `{ id }`

Every response uses HTTP `200`, including create — success/failure is carried in the
body envelope, not the status line.

```typescript
createXxx: {
  method: 'POST',
  path: '/api/v1/xxxs',
  body: z.object({
    name: xxxSchema.shape.name,
    description: xxxSchema.shape.description,
  }),
  responses: {
    200: successResponseSchema(z.object({ id: commonZod.entityId })),
  },
},
```

### Update

```typescript
updateXxx: {
  method: 'PUT',
  path: '/api/v1/xxxs/:id',
  pathParams: z.object({ id: commonZod.pathId }),
  body: z.object({
    name: xxxSchema.shape.name,
    description: xxxSchema.shape.description,
  }),
  responses: {
    200: successResponseSchema(),
  },
},
```

#### The response schema mirrors what the BE controller actually returns

`{ id }` for create and empty for update are the **defaults** — they hold when the BE controller
returns the new id / `Void`. But the response schema is not a convention to impose on the BE; it
is a mirror of the BE method's actual return type. If a `*Controller.java` method returns the full
entity DTO (`ResponseObject<IndicatorResponse>` from both `create` and `update`, for example), the
contract **must** use that entity variant — narrowing it to `{ id }` / empty would drop fields the
BE sends and fail Zod parsing at runtime.

```typescript
// BE: IndicatorController.create / .update both return ResponseObject<IndicatorResponse>
createIndicator: { ..., responses: { 200: successResponseSchema(indicatorSchema) } },
updateIndicator: { ..., responses: { 200: successResponseSchema(indicatorSchema) } },
```

Before applying the `{ id }` / empty default, confirm the controller's return type. BE wins.

### Delete — `c.noBody()`, no response data

Use `successResponseSchema()` (no argument) for endpoints that don't return data.
Never use `successResponseSchema(z.undefined())` — BE may send `data: null` or omit
the field entirely, which fails `z.undefined()` validation and crashes the app.

```typescript
deleteXxx: {
  method: 'DELETE',
  path: '/api/v1/xxxs/:id',
  pathParams: z.object({ id: commonZod.pathId }),
  body: c.noBody(),
  responses: {
    200: successResponseSchema(),
  },
},
```

### State transition (publish, archive, etc.)

```typescript
publishXxx: {
  method: 'PUT',
  path: '/api/v1/xxxs/:id/publish',
  pathParams: z.object({ id: commonZod.pathId }),
  body: c.noBody(),
  responses: {
    200: successResponseSchema(),
  },
  metadata: OpenAPIHelper.generateErrorCodes(ErrorCode.InvalidStatusTransition),
},
```

---

## Response Wrappers

```typescript
// Single detail — import the entity's detail variant
successResponseSchema(xxxDetailSchema)

// Paginated list — import the entity's list-item variant
successResponseSchema(searchResultsSchema(xxxItemSchema))

// Array (non-paginated)
successResponseSchema(z.array(xxxItemSchema))

// Create — return ID only
successResponseSchema(z.object({ id: commonZod.entityId }))

// No data (update / state change / delete)
successResponseSchema()

// Aggregate / bespoke shape (counts, rollups — no entity equivalent):
// a local `const` declared at the top of the contract file, or an inline z.object
successResponseSchema(xxxStatsSchema)
```

---

## Response Schemas

**The entity schema is the single source of truth for data shapes.** A contract
imports from it — it never re-derives an entity field's validation rules, and never
picks fields out of another contract.

### Import the entity's per-view variant

The entity file (`packages/zod-schemas/src/entity/{domain}-schema.ts`) exports
separate per-view variants — `xxxItemSchema` (list/table row) and `xxxDetailSchema`
(detail view). They are **distinct exports**, so the list and the detail response
evolve independently — adding a detail-only field never bloats the list. Import and
use them directly:

```typescript
listXxxs:   { ..., responses: { 200: successResponseSchema(searchResultsSchema(xxxItemSchema)) } },
getXxxById: { ..., responses: { 200: successResponseSchema(xxxDetailSchema) } },
```

A field that the list/detail view needs but the entity schema lacks belongs in the
**entity schema** first — never patched in at the contract.

### Aggregate / bespoke responses

For a response that matches no single entity (counts, rollups, a multi-join),
declare a local `const` at the top of the contract file, or use an inline `z.object`:

```typescript
const xxxStatsSchema = z.object({ total: z.int().min(0), active: z.int().min(0) });
```

If that local shape is later needed by a second endpoint as a genuine shared shape,
promote it to an entity-schema variant rather than copying it.

(Request bodies are composed differently — see *Request Body Composition* below.)

---

## Query Parameters

- Always extend `searchOptionsSchema` for list endpoints
- Every filter field: `.optional().catch(undefined)` — invalid values become absent, not 400 errors
- Numbers from query: `z.coerce.number()` — query params are always strings
- Booleans from query: `commonZod.queryBoolean` — not `z.coerce.boolean()`
- Enums from query: `xxxZod.optional().catch(undefined)`

```typescript
query: searchOptionsSchema.extend({
  periodType: indicatorPeriodTypeZod.optional().catch(undefined),
  isPublished: commonZod.queryBoolean.optional().catch(undefined),
  categoryId: z.coerce.number().int().positive().optional().catch(undefined),
}),
```

---

## Path Parameters

Always use `commonZod.pathId` (coerced positive integer):

```typescript
pathParams: z.object({ id: commonZod.pathId }),

// Sub-resources
pathParams: z.object({
  provinceId: commonZod.pathId,
  districtId: commonZod.pathId,
}),
```

---

## Request Body Composition

Compose the body **inline per route** from the entity schema. Reuse entity field definitions (via `.shape` or `.pick`) — never redefine the field's Zod rules inline, and never share a body schema variable between routes.

```typescript
// Reference individual fields via .shape
body: z.object({
  name: xxxSchema.shape.name,
  description: xxxSchema.shape.description,
  startAt: commonZod.datetime,
}),

// Pick subset for lightweight input
body: xxxSchema.pick({ name: true, description: true }),

// Bulk operations — array with .nonempty() or .min(1)
body: z.object({
  items: z.array(z.object({
    id: commonZod.entityId,
    role: roleZod,
  })).nonempty(),
}),
```

`createXxx` and `updateXxx` often look the same today — still define their `body` independently. If one diverges tomorrow (e.g. update can't change `slug`), you change only that route.

### Never apply `.refine` / `.superRefine` to a contract body

Field-level Zod rules (length, regex, format) belong on the body via `commonZod` helpers. **Cross-field business rules** (`endAt > startAt`, conditional-required, approved-report-needs-approver) belong on the **form-side** schema at the ZodForm call site, via reusable helpers in `packages/zod-schemas/src/form/refinements/` (dir not created yet — port the zod-form infra from ELP-fe when the first form lands). The contract describes *what the API accepts*; the refinement describes *what a UX user must fill in*. See the **zod-form** skill → "Cross-field business logic stays out of the contract".

---

## Error Codes

Every route declares possible errors via `metadata`. Default errors (BadRequest, InternalServerError, and auth errors when headers present) are auto-included.

```typescript
metadata: OpenAPIHelper.generateErrorCodes(
  ErrorCode.Forbidden,
  ErrorCode.ResourcesNotFound,
  ErrorCode.InvalidStatusTransition,
),
```

Only list **domain-specific** errors — don't repeat defaults.

---

## Sub-Resource URL Patterns

```
/api/v1/provinces/:provinceId/districts        — districts of a province
/api/v1/provinces/:provinceId/indicators       — indicators scoped to a province
/api/v1/indicators/:indicatorId/values         — values of an indicator
/api/v1/reports/:reportId/attachments          — report attachments
/api/v1/provinces/:provinceId/members/me       — "me" for current user actions
/api/v1/xxxs/self                              — self-owned resources
```

---

## Contract Composition

Each domain has its own contract file. Main contract (`packages/zod-schemas/src/api-contract/index.ts`, currently an empty `c.router({})`) composes all:

```typescript
// index.ts
export const appContract = c.router({
  Auth: authContract,
  User: userContract,
  Province: provinceContract,
  District: districtContract,
  // ...
});
```

Keys are PascalCase domain names.

---

## Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| File | `{entity}.contract.ts` | `district-indicator.contract.ts` |
| Contract var | `{entity}Contract` | `districtIndicatorContract` |
| List route | `list{Entity}s` or `search{Entity}s` | `listUsers`, `searchDistricts` |
| Get route | `get{Entity}ById` | `getDistrictIndicatorById` |
| Create route | `create{Entity}` | `createDistrictIndicator` |
| Update route | `update{Entity}` | `updateDistrictIndicator` |
| Delete route | `delete{Entity}` | `deleteDistrictIndicator` |
| State route | `{action}{Entity}` | `publishReport` |
| Self route | `list{Entity}s` + path `/self` | `listSelfReports` |