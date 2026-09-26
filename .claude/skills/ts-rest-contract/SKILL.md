---
name: ts-rest-contract
description: Use when creating or modifying ts-rest API contract files in packages/zod-schemas/src/api-contract/. Triggers on contract creation, endpoint definition, request/response schema design, query filter patterns, or any work involving ts-rest contracts with Zod v4.
---

# ts-rest Contract

## Overview

A **contract** is the typed, single source of truth for one API domain: it declares
every endpoint's method, path, auth, request shape, and response shape. The backend
router and the frontend repository are both built *from* the contract — neither side
invents its own shape.

The change always flows in one direction:

```
entity schema  →  API contract  →  backend router  +  frontend repository
(this skill writes the second step)
```

This skill covers writing and reviewing those contract files. It is split so each
concern lives in exactly one place — the standard case is fully self-contained in
this file; anything non-standard has a dedicated reference (see *Reference files*).

## When to use

- Creating a new `{domain}.contract.ts` file
- Adding or modifying endpoints in an existing contract
- Deciding the request body, response, query filters, or error codes for an endpoint
- Reviewing contract code for correctness
- Porting these patterns to a different contract-first project (see `references/porting.md`)

## Project conventions (the anchors)

A contract is assembled from a fixed set of shared building blocks. Everything in
this skill is built on these seven anchors — learn them once, reuse them everywhere:

| Anchor | What it is | Import from |
|--------|-----------|-------------|
| Response envelope | Wraps every payload as `{ success: true, data }` | `successResponseSchema` — `../api/response` |
| Pagination | `query/page/size/sort` input + `{ data, paging }` output | `searchOptionsSchema`, `searchResultsSchema` — `../common` |
| Shared fields | Validated primitives (`pathId`, `entityId`, `datetime`, …) | `commonZod` — `../common` |
| Auth header | JWT header schema for protected routes | `jwtAuthHeaderSchema` — `./schemas/token.schema` |
| Error catalogue | Error-code union + the metadata helper | `ErrorCode` — `../api/error.schema`; `OpenAPIHelper` — `../openapi/openAPI.helper` |
| Entity schemas | Data-shape source of truth (`xxxSchema`, `xxxItemSchema`, `xxxDetailSchema`) | `../entity/{domain}-schema` |
| Path prefix | Every path starts with `/api/v1/` | — |

> **Skeleton state:** `api/response`, `common`, `api/error.schema`, `openapi/openAPI.helper`
> and `api-contract/schemas/token.schema` exist; `appContract` in `api-contract/index.ts` is
> still empty and there is **no `entity/` dir yet** (so no `commonStatusZod` in
> `entity/permission-schema` either — it does not exist in ELP-fe either). Create the
> entity schema first, and define the shared ACTIVE/INACTIVE `commonStatusZod` there
> when the first entity needs it.
> The only backend is `../dona-province-dashboard-be` (Spring Boot, port 8080).

> These names are specific to *this* project. To run the skill in another
> contract-first project, map each anchor to its local equivalent — that mapping is
> the entire porting surface. See `references/porting.md`.

## Workflow

1. **Confirm the entity schema exists.** Responses and body fields are composed from
   `../entity/{domain}-schema.ts`. If it is missing, create it first (use the
   `sync-entity-schemas` skill) — the contract should not invent field shapes.
2. **List the endpoints.** Standard CRUD? Use the template below. Anything else
   (state transitions, scoped/nested reads, bulk, public) → `references/endpoint-patterns.md`.
3. **Write the contract file** following the template and the per-concern references.
4. **Register it** in `api-contract/index.ts` (see *Register the contract*).
5. **Verify** with `pnpm lint` (TypeScript + Biome).

## Standard CRUD template

This is the complete shape for a typical entity. Copy it, replace `xxx`/`Xxx`, and
delete any route the domain does not need. Each route is independent — read it as a
self-contained unit.

Response data shapes (`xxxItemSchema`, `xxxDetailSchema`) are imported from the
entity schema — the single source of truth. The entity file exposes the list-view
(`xxxItemSchema`) and detail-view (`xxxDetailSchema`) shapes as **distinct exports**,
so the list and the detail response evolve independently — adding a detail-only field
never bloats the list. A contract reuses entity shapes for standard list/detail
responses and never picks fields from another contract. A genuinely endpoint-specific
(aggregate) response with no entity equivalent may instead be a local `const` or an
inline `z.object` — see `references/endpoint-patterns.md`.

```typescript
import { initContract } from '@ts-rest/core';
import z from 'zod';
import { ErrorCode } from '../api/error.schema';
import { successResponseSchema } from '../api/response';
import { commonZod, searchOptionsSchema, searchResultsSchema } from '../common';
import { OpenAPIHelper } from '../openapi/openAPI.helper';
import { jwtAuthHeaderSchema } from './schemas/token.schema';
// Entity schemas hold every data shape — import them, never redefine:
import { xxxSchema, xxxItemSchema, xxxDetailSchema } from '../entity/xxx-schema';
// commonStatusZod = the shared ACTIVE/INACTIVE enum most entities use. A domain with
// a richer status set imports its own `xxxStatusZod` from xxx-schema instead — and
// then substitutes `xxxStatusZod` for `commonStatusZod` in the search query below.
import { commonStatusZod } from '../entity/permission-schema';

const c = initContract();

export const xxxContract = c.router({
  // === SEARCH — paginated list ===
  searchXxxs: {
    summary: 'Search xxxs',
    description: 'Search xxxs with pagination',
    method: 'GET',
    path: '/api/v1/xxxs',                       // plural domain, NO /search suffix
    headers: jwtAuthHeaderSchema,
    query: searchOptionsSchema.extend({
      status: commonStatusZod.optional().catch(undefined),  // declare every filter — see references/query-filters.md
    }),
    responses: {
      200: successResponseSchema(searchResultsSchema(xxxItemSchema)),
    },
    metadata: OpenAPIHelper.generateErrorCodes(ErrorCode.Forbidden),
  },

  // === GET BY ID — detail ===
  getXxxById: {
    summary: 'Get xxx by ID',
    description: 'Get detailed xxx information by ID',
    method: 'GET',
    path: '/api/v1/xxxs/:xxxId',
    headers: jwtAuthHeaderSchema,
    pathParams: z.object({ xxxId: commonZod.pathId }),
    responses: {
      200: successResponseSchema(xxxDetailSchema),
    },
    metadata: OpenAPIHelper.generateErrorCodes(ErrorCode.Forbidden, ErrorCode.ResourcesNotFound),
  },

  // === CREATE ===
  createXxx: {
    summary: 'Create xxx',
    description: 'Create a new xxx',
    method: 'POST',
    path: '/api/v1/xxxs',
    headers: jwtAuthHeaderSchema,
    body: z.object({                            // compose inline — see references/request-body.md
      code: xxxSchema.shape.code,
      name: xxxSchema.shape.name,
      description: xxxSchema.shape.description,
    }),
    responses: {
      200: successResponseSchema(z.object({ id: commonZod.entityId })),
    },
    metadata: OpenAPIHelper.generateErrorCodes(ErrorCode.Forbidden, ErrorCode.DuplicateEntry),
  },

  // === UPDATE ===
  updateXxx: {
    summary: 'Update xxx',
    description: 'Update xxx information',
    method: 'PUT',
    path: '/api/v1/xxxs/:xxxId',
    headers: jwtAuthHeaderSchema,
    pathParams: z.object({ xxxId: commonZod.pathId }),
    body: z.object({
      name: xxxSchema.shape.name,
      description: xxxSchema.shape.description,
    }),
    responses: {
      200: successResponseSchema(),             // no data payload
    },
    metadata: OpenAPIHelper.generateErrorCodes(ErrorCode.Forbidden, ErrorCode.ResourcesNotFound),
  },

  // === UPDATE STATUS — state transition ===
  updateXxxStatus: {
    summary: 'Update xxx status',
    description: 'Activate or deactivate a xxx',
    method: 'PUT',
    path: '/api/v1/xxxs/:xxxId/status',
    headers: jwtAuthHeaderSchema,
    pathParams: z.object({ xxxId: commonZod.pathId }),
    body: z.object({ status: xxxSchema.shape.status }),
    responses: {
      200: successResponseSchema(),
    },
    metadata: OpenAPIHelper.generateErrorCodes(
      ErrorCode.Forbidden,
      ErrorCode.ResourcesNotFound,
      ErrorCode.InvalidStatusTransition,
    ),
  },

  // === DELETE ===
  deleteXxx: {
    summary: 'Delete xxx',
    description: 'Hard-delete a xxx',
    method: 'DELETE',
    path: '/api/v1/xxxs/:xxxId',
    headers: jwtAuthHeaderSchema,
    pathParams: z.object({ xxxId: commonZod.pathId }),
    body: c.noBody(),
    responses: {
      200: successResponseSchema(z.undefined()),  // delete returns z.undefined()
    },
    metadata: OpenAPIHelper.generateErrorCodes(ErrorCode.Forbidden, ErrorCode.ResourcesNotFound),
  },
});
```

## Quick reference

| Aspect | Rule |
|--------|------|
| HTTP status | `200` for **every** response — success/failure is carried in the body envelope, not the status line |
| `summary` + `description` | required on every route — both feed the generated OpenAPI docs |
| Response wrapper | `successResponseSchema(dataSchema)` always |
| Auth header | `headers: jwtAuthHeaderSchema` on protected routes; omit only for public ones |
| Path prefix | `/api/v1/` always |
| List path | `/api/v1/{plural-domain}` — **no** `/search` suffix |
| Path param | `commonZod.pathId` (coerces string → positive int); name it `{domain}Id`, not `id` |
| List response | `searchResultsSchema(xxxItemSchema)` |
| Detail response | `xxxDetailSchema` |
| Create response | `successResponseSchema(z.object({ id: commonZod.entityId }))` |
| Update / void-action response | `successResponseSchema()` (no data payload) |
| Delete response | `successResponseSchema(z.undefined())` — nuance in `references/responses-and-errors.md` |
| No request body | `body: c.noBody()` |
| Error metadata | `OpenAPIHelper.generateErrorCodes(...domain-specific codes)` — never omit |
| Contract variable | `{domain}Contract` (camelCase) |
| Endpoint key | `{verb}{Domain}` — `searchProvinces`, `getProvinceById`, `createProvince` |
| File name | `{domain}.contract.ts` (kebab-case) |

## Zod v4

Contracts run on Zod v4. Where a route composes a field inline (a body field, an
aggregate response shape), use the v4 API: `z.int()` (not `z.number().int()`),
`z.email()` (not `z.string().email()`), `z.iso.datetime()`, `.catch()` for fallback
values, `.meta({ examples })` for docs. Most fields, though, come from `commonZod`
or an entity schema — those are already v4 and carry their own metadata, so reusing
them is always preferred over writing raw Zod.

## Beyond standard CRUD

When an endpoint does not fit the template, read `references/endpoint-patterns.md`.
It covers, each as its own self-contained pattern:

- **`find*` reads** — scoped, nested, or aggregate lists (`findMyReports`, `findProvinceDistricts`)
- **Action endpoints** — verb-named state mutations (`publishReport`, `assignIndicator`)
- **Bulk endpoints** — array-in operations (`bulkCreateIndicatorValues`)
- **Sub-resource paths** — nested resources with multiple path params
- **Public endpoints** — no auth header
- **Aggregate responses** — endpoint-specific shapes that have no entity schema

## Reference files

Read the one that matches what you are deciding — each is independently scoped:

| File | Read it when you are deciding… |
|------|--------------------------------|
| `references/query-filters.md` | how to declare search/pagination filters |
| `references/request-body.md` | what Zod type a POST/PUT body field should be |
| `references/endpoint-patterns.md` | how to shape a non-CRUD endpoint |
| `references/responses-and-errors.md` | the response wrapper or the error-code list |
| `references/porting.md` | how to reuse this skill in another project |

## Register the contract

A new contract is invisible until it is composed into the app router. `index.ts`
already declares `const c = initContract();` and the `appContract` router — you only
add two lines to it:

```typescript
import { xxxContract } from './xxx.contract';   // beside the other contract imports

export const appContract = c.router({
  // ...existing keys
  Xxx: xxxContract,   // PascalCase key
});
```
