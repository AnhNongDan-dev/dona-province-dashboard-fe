# Responses and error codes

Two concerns, kept together because every route declares both: the `responses` 200
schema and the `metadata` error codes. This file is the authoritative source for
both; the `SKILL.md` Quick reference is a terse echo of the table below.

## Response wrappers

Every response is wrapped by `successResponseSchema`, which produces
`{ success: true, data: <schema> }`. You only choose what goes inside `data`:

| Endpoint | `responses[200]` |
|----------|------------------|
| Paginated list | `successResponseSchema(searchResultsSchema(xxxItemSchema))` |
| Non-paginated array | `successResponseSchema(z.array(itemSchema))` — `itemSchema` is `xxxItemSchema` or a standalone schema (e.g. `bookedSlotSchema`) |
| Single detail | `successResponseSchema(xxxDetailSchema)` |
| Create | `successResponseSchema(z.object({ id: commonZod.entityId }))` |
| Update / void action | `successResponseSchema()` — no data |
| Delete | `successResponseSchema(z.undefined())` |
| Computed / aggregate | `successResponseSchema(z.object({ ... }))` — see `endpoint-patterns.md` |

Notes:

- **`searchResultsSchema(item)`** yields `{ data: item[], paging }`, where `paging`
  is `{ page, size, totalElements, totalPages, hasNext }`. Pair it with a
  `searchOptionsSchema` query.
- **The "no data" cases.** `successResponseSchema()` and
  `successResponseSchema(z.undefined())` both mean "no payload". The standard:
  update and void actions use `successResponseSchema()`; delete uses
  `successResponseSchema(z.undefined())` — that is what the entity-level deletes
  (`deleteProvince`, `deleteDistrict`, `deleteIndicator`, …) should do, so write
  a new contract that way. Some existing endpoints return a bare
  `successResponseSchema()` for deletes
  instead; both forms are accepted — the backend router conforms to whatever the
  contract declares — so when editing an existing contract, match its neighbours
  rather than treating either form as a hard law.
- **HTTP status is always `200`.** Success and failure are distinguished by the
  envelope's `success` flag, not the status line — so a contract only ever declares
  a `200`. (The backend may answer a create with `201`; the contract still says
  `200`. This is a deliberate project convention — see `porting.md` if adapting it.)

## Error codes — `metadata`

Every route declares the errors it can return, via `metadata`:

```typescript
metadata: OpenAPIHelper.generateErrorCodes(
  ErrorCode.Forbidden,
  ErrorCode.ResourcesNotFound,
  ErrorCode.InvalidStatusTransition,
),
```

Pass only the **domain-specific** codes. Other codes are added for you, but by two
different mechanisms — worth knowing so the list is not double-counted:

- **`generateErrorCodes(...)` itself** appends `BadRequest` and `InternalServerError`
  (the `DEFAULT_ERROR_CODES` constant in `openapi/openAPI.helper.ts`). These end up
  in the stored metadata.
- **At OpenAPI-generation time**, the helper additionally injects the auth codes for
  any route that has `headers` — currently `LoginRequired` and `InvalidAuthToken`
  (the `DEFAULT_HEADER_ERROR_CODES` constant). This happens when the docs are built,
  not inside `generateErrorCodes`, so you will not see them in the call.

The exact auto-included sets live in those two constants in `openAPI.helper.ts` —
read them there rather than memorising; they are also the first thing to re-check
when porting (see `porting.md`). A public route — no `headers` — gets no auth codes,
so `generateErrorCodes()` with no arguments is correct for a public endpoint that
has no domain errors.

### Which codes to list

| Situation | Add |
|-----------|-----|
| Route is permission-gated | `ErrorCode.Forbidden` |
| Route loads a record by id | `ErrorCode.ResourcesNotFound` |
| Create can collide on a unique field | `ErrorCode.DuplicateEntry` |
| State change with a status guard | `ErrorCode.InvalidStatusTransition` |
| A specific business rule | the matching `E_*` code (e.g. `ErrorCode.DistrictHasReports`) |

List only what the endpoint can actually return — `metadata` is read both for
OpenAPI docs and for the frontend's error handling, so an inaccurate list misleads
both. Do not repeat the auto-included codes.

## Adding a new error code

`generateErrorCodes` only accepts codes that exist in the catalogue. A genuinely new
business error is added in `api/error.schema.ts`:

1. Add the key to the `ErrorCode` const object — value is a stable string
   (`E_DOMAIN_REASON` for business errors).
2. Add an entry to `ERROR_DATA` with its `statusCode` and Vietnamese `message`.

Then it is usable in any contract's `metadata`. Do not invent error codes inline.
