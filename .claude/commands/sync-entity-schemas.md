You are a senior TypeScript engineer specializing in Zod v4 schemas and domain modeling.

Your task is to compare the Prisma schema with existing entity schemas and create/update entity schemas to stay in sync.

## Path Resolution (Auto-Discover — DO NOT hardcode)

All paths must be auto-discovered from the project root. The command is project-agnostic.

### 1. Prisma schema
The Prisma schema in this frontend repo is a **shadow of the Java backend** (`../dona-province-dashboard-be`) used only to keep entity schemas in sync — it has no live database. It lives at `packages/zod-schemas/prisma/schema.prisma`.

Use: `find <project-root> -name "schema.prisma" -not -path "*/generated/*" -not -path "*/node_modules/*"`

If none found, tell the user to run `/sync-prisma-schema` first and stop.

### 2. Entity schema directory
Expected location: `packages/zod-schemas/src/entity/`.

On a fresh checkout this directory does not exist yet — create it (and the first `*-schema.ts` file) as part of Step 6. If a different entity directory is found (look for directories containing `*-schema.ts` files), ask the user which to use.

### 3. Example template
Search for the example/template file inside the entity directory:
- `_example-schema.ts`
- `_template-schema.ts`

If not found, proceed without a template — use the rules from entity-schema.md as guidance.

### 4. Common fields (commonZod)
Search for the shared field definitions (usually `packages/zod-schemas/src/common.ts`):

Use: `grep -rl "commonZod" <project-root>/packages --include="*.ts" | head -5`

### 5. Entity schema rules
Search for the entity schema rules file:
- `.claude/rules/entity-schema.md`

If not found, use the built-in rules in this command as fallback.

### 6. TypeScript-Java interop rules (optional)
Search for interop rules:
- `.claude/rules/typescript-java-interop.md`

If not found, use these defaults: `.nullable()` over `.optional()`, booleans never nullable, ISO 8601 datetimes.

### 7. Backend validation sources

Entity schemas must mirror BE field constraints — not invent them. Discover the four validation sources in `../dona-province-dashboard-be` (Java root `src/main/java/com/donasky/province_dashboard/`; grep, don't assume sub-folders):

- **Response DTOs** (the on-wire shape that the entity must parse): `dto/response/**/*Response.java`
- **Request DTOs** (carry `@ItemValidate` / custom annotations / Bean Validation that hint at field constraints when the same field appears in entity): `dto/request/**/*Request.java`
- **Validation lookup**: `src/main/resources/validation/validationItems.json` — optional; only when present
- **Custom validators**: `**/validation/annotation/*.java` + `**/validation/validator/*.java` — only when present

Also read [.claude/rules/backend-validation-source.md](../rules/backend-validation-source.md) — it defines the **priority order** (`validationItems.json` → custom validator → Bean Validation → Java type default) and is binding for this command.

If the Response DTO for a model cannot be located, ask the user before proceeding — without them, the entity will drift from BE rules silently.

## Workflow (MANDATORY — follow every step)

### Step 0: Discover paths

Auto-discover all paths listed above. Print a summary:

```
## Discovered Paths
- Prisma schema: <path>
- Entity directory: <path>
- Example template: <path> (or "not found")
- Common fields: <path>
- Entity rules: <path> (or "using built-in rules")
- Interop rules: <path> (or "using defaults")
- BE validation sources (../dona-province-dashboard-be):
  - response DTOs <path>, request DTOs <path>, validationItems.json <path or "absent">, validators <path or "absent">
```

If any critical path (Prisma schema, entity directory, validation sources) cannot be resolved, ask the user.

### Step 1: Read all source files

Read the following in parallel:
- The discovered Prisma schema
- The entity schema rules (if found)
- The interop rules (if found)
- The example template (if found)
- The common fields file
- All existing `*-schema.ts` files in the entity directory (excluding `_example-*` and `_template-*`)
- `validationItems.json` (if present)
- All custom validation annotation files + their validator implementations

### Step 1b: Resolve BE field constraints (MANDATORY — drives Step 6 generation)

Prisma alone is NOT enough. It tells you the column type and DB-level `@db.VarChar(N)`, but it does **not** know `@ItemValidate(name="…")` lookups, custom annotation regexes, or `@JsonProperty` renames. Without this step, generated entity schemas drift from real BE rules.

For every Prisma model being synced, locate the matching Response DTO (`dto/response/**/{Resource}*Response.java`). For each field in the DTO:

1. **Resolve the on-wire field name and shape** (Response DTO is the source for *entity*, not Request DTO):
   - Apply class-level `@JsonIgnoreProperties({...})` — exclude those keys from the entity schema.
   - Apply field-level `@JsonProperty("alias")` — use the renamed JSON key as the Zod key.
   - Apply `@JsonInclude(NON_NULL)` or non-`@NotNull` Object/wrapper → `.nullable()`. Primitive Java fields (`long`, `boolean`, `int`) are never null.
   - Boolean fields with Lombok `isXxx()` getter and **no** `@JsonProperty` → ask user whether wire key is `isXxx` or `xxx`. Do not guess.

2. **Resolve length / format constraints**. For the same conceptual field, look at the **Request DTO** counterpart (if exists — e.g. `DistrictCreateRequest.name` for `DistrictResponse.name`) and walk the four sources in priority order (from [backend-validation-source.md](../rules/backend-validation-source.md)):
   - `@ItemValidate(name = "k")` → open `validationItems.json` → apply `minLength` → `.min(n)`, `maxLength` → `.max(n)`, `format` → matching `commonZod.<helper>`.
   - Custom annotation (any project-defined constraint annotation) → open annotation + validator class → extract regex / length / message.
   - Standard Bean Validation (`@NotNull`, `@NotBlank`, `@Size`, `@Min`, `@Max`, `@Email`, `@Pattern`) → translate directly.
   - Java type default (no annotation) → `z.string()` / `z.int()` / `z.boolean()` with **no length cap**.

3. **Reconcile with Prisma DB cap**. `@db.VarChar(N)` is the DB ceiling, not the API constraint. When BE has a `validationItems.json` rule (say `maxLength: 255`) AND Prisma has `@db.VarChar(255)`, they agree — use `.max(255)`. If they disagree (validation rule is stricter), the BE rule wins because that's what BE enforces at runtime. If only Prisma has a cap and no validation rule references the field, treat the DB cap as the entity max (`@db.VarChar(255)` → `.max(255)`) — the field is reachable at that length even if validation is silent.

Record per field: `{ jsonKey, zodType, source }`. This map drives Step 6. **Never invent a `.min()` / `.max()` without a recorded source.**

### Step 2: Extract Prisma models and enums

From the Prisma schema, extract:
- All `model` blocks → list of entities with their fields, types, relations, and constraints
- All `enum` blocks → list of enums with their values
- Group related models by domain section (use the comment headers in the Prisma file, if present)

### Step 3: Map Prisma models to entity schema files

For each Prisma domain group, determine the target entity schema file:

| Prisma Domain | Entity File | Notes |
|---|---|---|
| Single model (e.g., `Province`) | `province-schema.ts` | One file per model |
| Related models (e.g., `Indicator` + `IndicatorValue`) | `indicator-schema.ts` | Group tightly coupled models |
| Join/link tables (e.g., `UserRole`, `RolePermission`) | Include in parent entity file | Don't create separate files for pure join tables |

**File naming**: `[domain]-schema.ts` in kebab-case.

### Step 4: Compare and identify changes

For each entity schema file, compare:

1. **Missing enums**: Prisma enums not yet defined in any entity schema → create using the 5-part enum pattern
2. **Outdated enums**: Existing enums whose values don't match Prisma → update values (add/remove)
3. **Missing entity schemas**: Prisma models with no corresponding entity schema file → create new file
4. **Outdated entity schemas**: Existing schemas whose fields don't match Prisma model → update fields
5. **Missing variants**: Entity schemas that lack standard variants (Item, Detail, Body) → add if the model is user-facing

### Step 5: Present the sync plan

Before making ANY changes, present a summary table to the user:

```
## Sync Plan

### New files to create:
- `province-schema.ts` — Province
- `district-schema.ts` — District
- `indicator-schema.ts` — Indicator, IndicatorValue

### Files to update:
- `report-schema.ts` — Add ARCHIVED status to ReportStatus enum

### Enums to sync:
| Enum | Current Values | Prisma Values | Action |
|------|---------------|---------------|--------|
| ReportStatus | DRAFT, SUBMITTED, APPROVED | DRAFT, SUBMITTED, APPROVED, ARCHIVED | Add ARCHIVED |

### Field constraint resolution (Step 1b summary):
For each non-trivial field, show the resolved rule and its source so the user can audit.

#### district-schema.ts ↔ DistrictResponse

| Field | JSON key | Resolved Zod | Source |
|---|---|---|---|
| name | name | z.string('...').max(255, '...') | validationItems.json → districtName (maxLength: 255) |
| isActive | isActive | z.boolean() | @JsonProperty("isActive") + primitive |
| population | population | z.int().nullable() | Long wrapper, no @NotNull |
| description | description | z.string().max(1000).nullable() | Prisma @db.VarChar(1000) ceiling |
| active | (excluded) | — | @JsonIgnoreProperties |

**Invented constraints to remove** (no BE source found):
- `districtSchema.name.min(2)` — no BE source; BE only enforces `@Required` + `maxLength: 255`

### No changes needed:
- (list any entity files already in sync)
```

**Wait for user confirmation before proceeding.** If the user says to proceed, continue. If they want changes, adjust the plan.

### Step 6: Apply changes

For each file (new or updated), follow these rules strictly:

#### Enum generation (5-part pattern — MANDATORY)
```typescript
// 1. Const object
export const XxxStatus = { ... } as const;
// 2. Type extraction
export type XxxStatus = (typeof XxxStatus)[keyof typeof XxxStatus];
// 3. Zod enum
export const xxxStatusZod = z.enum([...]);
// 4. Label map (Vietnamese labels)
export const XXX_STATUS_LABEL: Record<XxxStatus, string> = { ... };
// 5. Options array
export const XXX_STATUS_OPTIONS = Object.values(XxxStatus).map((s) => ({
  value: s,
  label: XXX_STATUS_LABEL[s],
}));
```

#### Schema generation
- **Use the per-field map from Step 1b** as the authoritative source for type + constraint + nullability. Never re-derive constraints from Prisma alone.
- Use `commonZod` fields wherever applicable (check the discovered common fields file first)
- If a field should be in `commonZod` but isn't, add it to `commonZod` first
- Follow the example template for structure and comments (if found)
- Use `.nullable()` for optional DB fields, never `.optional()` (Java interop)
- Booleans: always `z.boolean()`, never nullable/optional
- Add `.meta({ examples: [...] })` on string/number fields
- Add `.meta({ title, description })` on main schemas (Vietnamese description)
- **No invented `.min()` / `.max()`.** Every constraint must trace to one of the four BE sources (validationItems.json, custom validator, Bean Validation, or Prisma `@db.VarChar(N)` ceiling). If Step 1b recorded none, leave the field unconstrained.

#### Schema variants
Only generate variants that make sense for the entity:
- `xxxSchema` — Always (base entity)
- `xxxItemSchema` — If entity appears in list views (omit internal fields like `deleted`)
- `xxxDetailSchema` — If entity has a detail view
- `xxxBodySchema` — If entity has create/update forms

#### Type exports
Always derive types via `z.infer<typeof schema>`:
```typescript
export type Xxx = z.infer<typeof xxxSchema>;
```

### Step 7: Update barrel exports (if needed)

If new entity schema files were created, check if there's an `index.ts` in the entity directory and update it. If there's no index file, skip this step.

### Step 7b: Reconcile downstream consumers (MANDATORY when fields are added/removed/renamed)

A schema change is **not done** when the schema file compiles. Hand-written shape literals and TODO comments elsewhere in the repo go stale silently — lint will catch some but not all, and a stale comment compiles fine. Run this step whenever Step 4 identified any field add / remove / rename on a schema variant that consumers depend on (`xxxSchema`, `xxxItemSchema`, `xxxDetailSchema`).

For **each** added / removed / renamed field, sweep these three spots:

1. **`defaultData` literals in repository files.** Every `createQueryRepository<XxxDTO>({ ... })` typically declares a `const defaultData: XxxDTO = { ... }` near the top of the file. If the DTO gained a field, the literal is missing it → TS2741. If renamed, the literal has the old key → TS2353 + TS2741.

   ```bash
   # find every defaultData tied to this entity
   grep -rn "defaultData.*: *\(Xxx\|XxxDTO\|XxxItem\|XxxDetail\)" apps/frontend/src/repositories/
   # or, broader, just enumerate repos that import the changed type
   grep -rln "from .*entity/<domain>-schema" apps/frontend/src/repositories/
   ```

   For each match: open the file, walk its `defaultData` object, and add / rename / remove keys to match the new shape. Pick the natural zero value for the field type (`0` for `int`, `""` for `string`, `null` for `nullable`, `false` for `boolean`, `[]` for arrays).

2. **Stale `// TODO: missing field …` comments in pages/components.** Past sync rounds often parked work as `// TODO: missing field X on YyySchema — fetch detail per …` with a hard-coded `0` / `—` placeholder next to it. When that field now exists on the schema, the TODO and its placeholder are obsolete — the comment is technically correct (compiles) but the placeholder is now a silent bug.

   ```bash
   # grep for the parking convention used by past syncs
   grep -rn "TODO.*missing field" apps/frontend/src
   ```

   For each match that names a field this sync just added: delete the TODO line and replace the placeholder with the real expression (typically `district.population`, `districts.reduce((s, d) => s + d.population, 0)`, etc.).

3. **Hand-written component shape literals** (rare but possible) — `const fallback: XxxItem = { ... }`, mocks, storybook fixtures. Same fix as (1).

   ```bash
   grep -rn ": *\(Xxx\|XxxItem\|XxxDetail\) *= *{" apps/frontend/src
   ```

**Report what changed.** In your final summary, list each consumer file touched and the field(s) reconciled, so the user can spot anything you missed.

### Step 8: Verify

Run the project's lint command to check for issues. Auto-detect:
- `pnpm lint` (if pnpm workspace)
- `npm run lint` (if npm)
- `yarn lint` (if yarn)

Check `package.json` for the correct lint script.

## Critical Rules

1. **Prisma schema is the source of truth** for model structure, field names, types, and enum values.
2. **Example template is the structural guide** — follow its structure, comments, and patterns exactly (if found).
3. **Entity schema rules file is the rulebook** — every rule there MUST be followed (if found).
4. **`commonZod` first** — never define a field inline if it exists in the common fields file.
5. **No TypeScript `enum` keyword** — always use const object + type union.
6. **Vietnamese labels** — all `_LABEL` maps use Vietnamese text.
7. **Zod v4 API** — use `z.int()`, `z.email()`, `z.url()`, not v3 equivalents.
8. **Don't create schemas for pure infrastructure tables** — tables like `AuditLog`, `RefreshToken`, `EmailVerificationToken`, `PasswordResetToken` are backend-only and don't need frontend entity schemas unless the user explicitly requests them.
9. **Preserve existing code** — when updating files, only modify what needs to change. Don't reformat or restructure code that is already correct.
10. **Always ask before applying** — present the sync plan and wait for confirmation.
11. **Exclude BE-internal columns from entity schemas (CRITICAL).** Prisma schema includes columns that exist in the DB for backend bookkeeping but are **never exposed through any API response DTO**. Including them in the FE entity schema causes the schema to be wrong for response parsing (Zod parse fails → blank page) because the BE response will be missing those fields. **Default behavior: skip these columns, do not ask.** If unsure, ask the user with the specific column name before including.

    ### Danger-list — columns to skip by default

    | Column pattern | Why it's BE-internal |
    |---|---|
    | `*_seq` / `*Seq` (e.g. `report_code_seq`, `indicator_code_seq`) | Counter used to generate human-readable codes; BE increments it under row lock during create. The generated `code` is exposed, the counter is not. |
    | `version` (Hibernate `@Version`) | Optimistic-lock revision; not in response DTOs. |
    | `*_lock` / `*LockedUntil` / `*LockedAt` (when used for row locking, not user-locking) | Concurrency primitives. |
    | `deleted` / `is_deleted` / `deleted_at` (soft-delete flag) | BE filters by it; rarely returned to FE. |
    | `*_token` / `*_secret` / `password_hash` | Never exposed. |
    | `search_vector` / `tsvector` / `embedding` | Postgres full-text/vector search internal. |
    | `*_revision` / `*_etag` | Concurrency primitives. |

    ### How to apply
    - **First, check for a `// BE-INTERNAL — ` comment** anchored above the model or field in the prisma shadow. `/sync-prisma-schema`'s Shadow Policy requires that policy comment for any column/table not exposed via a Response DTO. If present → skip immediately (the comment is the authoritative signal); do not generate an entity schema for a BE-INTERNAL model, and exclude any BE-INTERNAL field from the schema you generate.
    - If no `// BE-INTERNAL — ` comment is present, walk the model column-by-column: "Is this returned by the response DTO?" If pattern matches danger-list → skip. If unsure → grep the matching BE response DTO file (`dto/response/**/*Response.java`) before deciding. When you decide a column is BE-internal but the prisma shadow lacks the comment, **flag it back to the user** — the shadow is missing a required annotation per `/sync-prisma-schema`'s Shadow Policy, and should be patched in the same change.
    - If user explicitly asks for an internal field (e.g., "I need version for optimistic locking on the FE"), include it but add a code comment explaining why.
    - In the Sync Plan output (Step 5), include a row "Skipped BE-internal columns" listing what was excluded, so the user can override if needed.

    ### Reason (load-bearing)
    Incident from a sister project with the same stack: `*_code_seq` counters were added to two entity schemas as `z.int().min(0)` (non-nullable). The matching `*Response` DTOs did not expose these columns. Production Zod parse failed → blank pages on the detail and list endpoints — the response was missing the fields the entity schema required. The same would happen here with e.g. `report_code_seq` on `reportSchema`.

## Prisma-to-Zod Type Mapping

Use this **only** as a baseline. The constraint comes from Step 1b (BE validation source), not from Prisma alone.

| Prisma Type | Zod Type |
|---|---|
| `Int` | `z.int()` or `commonZod.entityId` (for IDs) |
| `String` | `z.string()` — add constraints from Step 1b, not invented |
| `String @db.VarChar(N)` | `z.string().max(N)` (DB ceiling — apply when no stricter BE rule exists) |
| `Boolean` | `z.boolean()` |
| `DateTime` | `commonZod.datetime` |
| `DateTime?` | `commonZod.datetime.nullable()` |
| `Decimal` | `z.number()` |
| `Json` | `z.record(z.unknown())` or specific shape |
| `Enum` | Use the 5-part enum pattern |
| Relation field | Omit from schema (or use `entityId` for FK) |

## Prisma-to-Entity Field Mapping

- `id` → `commonZod.entityId`
- `createdAt` / `updatedAt` → `commonZod.datetime.nullable()`
- `createdBy` / `updatedBy` → `commonZod.entityId.nullable()`
- `code` → `z.string().max(50)` with `.meta({ examples: [...] })`
- `name` → `z.string().max(255)` with `.meta({ examples: [...] })`
- `description` → `commonZod.textarea.nullable()` or `z.string().max(N).nullable()`
- `status` (enum) → corresponding `xxxStatusZod`
- `email` → `commonZod.email`
- FK fields (e.g., `provinceId`, `districtId`) → `commonZod.entityId`
- Numeric measures (e.g., `population`, `indicatorValue`) → `z.int()` / `z.number()` — add `.min(0)` only when a BE source enforces it
