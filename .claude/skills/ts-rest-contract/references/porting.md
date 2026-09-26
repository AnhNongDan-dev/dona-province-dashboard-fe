# Porting this skill to another project

This skill teaches a **method** — contract-first API design with ts-rest + Zod v4 —
not a set of facts about one repository. The method is portable. What changes
between projects is a small, fixed set of *anchors*: shared modules the contracts
are built from. Re-point those, and every pattern in this skill works unchanged.

## What is portable vs. project-specific

| Portable (keep as-is) | Project-specific (re-point) |
|-----------------------|-----------------------------|
| Contract-first flow: entity schema → contract → router + repo | The seven anchors below |
| `c.router({...})` route structure | Import paths of every anchor |
| Endpoint key naming (`searchXxxs`, `getXxxById`, `find*`, action verbs) | The `/api/v1/` path prefix string |
| "Declare every query filter / body field explicitly" | The response-envelope shape |
| `.optional().catch(undefined)` for query; `.nullable()` for body (Java-specific — see step 5) | Whether the project even *has* an envelope |
| Splitting CRUD from non-CRUD patterns | The HTTP-status convention |

## The seven anchors

For a new project, find each anchor's local equivalent (or decide it does not
apply) and update the imports in the SKILL template. This table *is* the port.

| # | Anchor | This project | What to look for elsewhere |
|---|--------|--------------|----------------------------|
| 1 | Response envelope | `successResponseSchema` → `{ success: true, data }` | A response wrapper. If the API returns the payload raw, drop the wrapper — `responses: { 200: xxxDetailSchema }`; note this also disables `OpenAPIHelper.extendErrorResponse`, so re-verify how error responses are generated. |
| 2 | Pagination | `searchOptionsSchema` (in) + `searchResultsSchema` (out) | The project's list-query and paged-result schemas. Field names (`page`/`size` vs `pageIndex`/`pageSize`) vary. |
| 3 | Shared fields | `commonZod` | A shared library of validated primitives. If absent, fields are defined per entity schema. |
| 4 | Auth header | `jwtAuthHeaderSchema` | The header schema for protected routes. Some projects use cookies — then there is no header anchor. |
| 5 | Error catalogue + helper | `ErrorCode` + `OpenAPIHelper.generateErrorCodes` | An error-code enum and the metadata helper. If the project has neither, `metadata` may be plain or omitted. |
| 6 | Entity schemas | `../entity/{domain}-schema` — three-tier naming `xxxSchema` / `xxxItemSchema` / `xxxDetailSchema` | Where data shapes live. Contracts always import shapes; they never define entities. The target project may name variants differently (`xxxResponse`, `xxxListItem`) — map the names. |
| 7 | Path prefix | `/api/v1/` | The API's base path. |

## Two convention decisions to confirm per project

These are choices, not facts — verify them against the target project's existing
contracts before applying:

1. **HTTP status.** This project declares `200` for every response and carries
   success/failure in the envelope. A project without an envelope declares real
   statuses (`201` for create, `204` for delete, `4xx` for errors). Match whatever
   the existing contracts do.
2. **List path shape.** This project uses `/api/v1/{plural}` with no `/search`
   suffix. Other projects use `/xxx/search` or `/xxx/list`. Match the existing
   contracts — consistency within a project beats any single rule.

## Porting procedure

1. Open 2–3 existing contract files in the target project. They reveal all seven
   anchors and both convention decisions faster than any documentation.
2. Build the anchor map (the table above) for that project.
3. Update the import block — including the entity-schema import line and its variant
   names — and the two conventions in this skill's `SKILL.md` template.
4. Skim each `references/` file; adjust only the project-specific spots (envelope
   shape, status codes, helper names). `successResponseSchema` appears throughout
   `SKILL.md` and every reference — renaming the envelope is one project-wide
   find-and-replace, not a per-file rewrite. Changing the envelope *shape* (not just
   its name) also means revisiting `openapi/openAPI.helper.ts` — its
   `extendErrorResponse` is envelope-aware. The *reasoning* in each file — why
   declare filters explicitly, why `.nullable()` for bodies — stays valid everywhere.
5. If the target backend is not Java, re-check `request-body.md`'s
   `.nullable()`-vs-`.optional()` rule: it exists because `JSON.stringify` drops
   `undefined` and Java needs an explicit `null`. A backend that treats a missing
   key the same as `null` does not need the rule — but being explicit rarely hurts.

## How to extend the skill

Adding a *new* endpoint pattern (say, a Server-Sent-Events stream, or a file
upload) does not touch `SKILL.md` or the other references — add one section to
`endpoint-patterns.md`, following the existing per-pattern shape: a one-line
"when to use", then a worked example. Adding a new shared field type updates
`query-filters.md` / `request-body.md` only. Keeping each concern in its own file
is what makes a change land in exactly one place.
