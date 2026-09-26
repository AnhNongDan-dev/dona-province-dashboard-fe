You are a senior backend engineer experienced with PostgreSQL, Java backend systems, and Prisma ORM.

Your task is to update the Prisma schema based on Flyway SQL migrations and Java enums from the backend repository.

## Path Resolution

1. Detect the current project root (the working directory).
2. The project follows a naming convention: `<project-name>-fe` (frontend) and `<project-name>-be` (backend).
3. Derive the backend path by replacing `-fe` with `-be` in the project root path. For this project that is `../dona-province-dashboard-be` (Spring Boot, Java package `com.donasky.province_dashboard`) — the **only** backend. If `CLAUDE.md` lists a different path, trust it.
4. **Auto-discover** the following paths (DO NOT hardcode file names — they change as the backend grows):

### Prisma schema
The Prisma schema in this frontend repo is a **shadow of the Java backend** — it has no live database and no generated client. It lives at `packages/zod-schemas/prisma/schema.prisma`, alongside the entity/contract schemas it feeds, and serves as a versioned record of which backend migrations have been synced.

Use: `find <project-root> -name "schema.prisma" -not -path "*/generated/*" -not -path "*/node_modules/*"`

If no `schema.prisma` exists yet (the case on a fresh checkout), create it at `packages/zod-schemas/prisma/schema.prisma` with a minimal `generator` + `datasource` block (no `url` — the datasource is never connected; it exists only so `prisma validate` accepts the file).

### Flyway migrations
- `<backend-path>/src/main/resources/db/migration/V{n}__*.sql`

If no migration directory exists (or it is empty), report that there is nothing to sync yet and stop.

### Java enums
Enums normally live under `<backend-path>/src/main/java/com/donasky/province_dashboard/constant/`, but do not assume — discover them:

Use: `grep -rl "public enum" <backend-path>/src/main/java` — only files containing `public enum` count.

5. If any critical path cannot be resolved (Prisma schema or migrations), ask the user.

## Shadow Policy (MANDATORY) — shadow 100% of the backend, annotate BE-internal in place

The prisma schema is a **complete shadow** of the backend database. Shadow **every table and every column** that exists in the backend migrations — including BE-internal storage (tables/columns the FE never reads through any API response DTO). Do NOT skip a model or column because "the FE never sees it".

### Why shadow 100% (and not skip)

Failure mode this rule exists to prevent (seen in a sister project with the same setup): V4 added `user_settings` (a BE-internal table). The sync **skipped** the model from the shadow entirely on the reasoning "no entity DTO exists, no point shadowing". Two days later that decision was invisible — the shadow looked complete, but anyone running `/check-backend` or `/sync-prisma-schema` had to cross-reference `.docs/backend-activities/*.md` to learn the table even existed. The shadow's audit-trail value was lost. **Skipping creates silent drift that looks like completeness.**

Shadowing 100% with an in-place note is the right tradeoff:
- The shadow stays a faithful, greppable record of the backend DB.
- The BE-INTERNAL marker tells `/sync-entity-schemas` (and any human reader) "do not generate an entity Zod schema for this" — the warning travels with the model, no cross-file lookup needed.
- A future migration that touches the same column/table updates the same shadowed location — no chance of forgetting it exists.

### When to mark BE-INTERNAL

Mark a **column** as BE-INTERNAL when it exists in the DB but is **not exposed in any `*Response.java` DTO**. Verify with:
```bash
grep -rln "<camelCaseFieldName>" <backend-path>/src/main/java --include="*Response.java"
```
Empty result = BE-internal. (Beware false positives — `code` will match `districtCode`; eyeball the hits.)

Mark a **whole model** as BE-INTERNAL when **none** of its columns ship in any Response DTO — i.e. the entire table is backend-only storage and the FE either never reads it, or reads only a derived/unwrapped form (e.g. `user_settings.settings` is exposed as a parsed `Map<String, Object>`, not as a `UserSettingResponse` row).

Patterns that are almost always BE-INTERNAL (still verify with grep before marking):
- `*_seq` / `*_code_seq` — code-generation counters (e.g. `report_code_seq`)
- `version` — Hibernate optimistic-lock revision
- `*_lock`, `*_locked_at`, `*_locked_until` — row-lock primitives
- `deleted`, `is_deleted`, `deleted_at` — soft-delete flags
- `*_token`, `*_secret`, `password_hash` — credentials/secrets
- `search_vector`, `tsvector`, `embedding` — full-text / vector indexing internals
- S3 storage keys that are populated lazily (e.g. `attachment_key`, `export_key`) — verify against the DTO
- Pure storage tables for backend bookkeeping (e.g. `user_settings`) whose API surface is a derived shape rather than a row mirror

### Comment format (use exactly this style)

**Field-level** — anchor the comment immediately above the field:
```prisma
model Report {
  ...
  name                        String
  // BE-INTERNAL — S3 object key for the generated export file. Nullable since V5:
  // reports can be created before the export job has run.
  // NOT exposed in any *Response DTO — do NOT add to entity Zod schema during
  // /sync-entity-schemas (would cause Zod parse failures on real responses).
  exportKey                   String?
  ...
}
```

**Model-level** — anchor the comment immediately above the `model` keyword:
```prisma
// BE-INTERNAL — per-user key/value settings, stored as a JSON TEXT blob.
// The API exposes `settings` as a parsed Map<String, Object>; the DB column
// is raw TEXT. Endpoints: GET/PUT /api/v1/settings/me.
// DO NOT generate an entity Zod schema for this model during
// /sync-entity-schemas — there is no UserSettingResponse DTO; the FE only
// ever sees the unwrapped `settings` map. Generating an entity would create
// a schema that nothing on the wire matches and invite drift.
// Added by V4__add_user_settings.sql.
model UserSetting {
  ...
  @@map("user_settings")
}
```

Comment requirements:
1. **Start with `// BE-INTERNAL — `** (exact prefix + em-dash) so it's greppable and `/sync-entity-schemas` can reliably detect it.
2. **One sentence on what the column/table is** (mechanic, not just "internal storage").
3. **Why FE never sees it** — name the missing DTO, or describe the derived shape the FE actually consumes.
4. **Explicit "do NOT add to entity Zod schema during /sync-entity-schemas"** — the warning must address the next sync command by name.
5. **Source migration** (e.g. "Added by V4__add_user_settings.sql" or "Nullable since V5") so a reader can find the change history.

### Migration header note

In the `MIGRATIONS USED` header at the top of the schema, mark migrations that introduce BE-INTERNAL tables with a short inline note, e.g.:
```prisma
// V4__add_user_settings.sql (last commit: abc1234)  -- adds user_settings (BE-internal storage; shadowed but NOT in any Response DTO)
```

This way the migration list alone tells a reader "yes, this was processed; yes, the result is intentionally annotated".

## Workflow (MANDATORY)

### Step 0: Pull latest code

Run `git pull` in the backend repository to ensure you are working with the latest migrations and Java enums.

### Step 1: Read the existing Prisma schema

Read the auto-discovered `schema.prisma` file and extract:
- existing model names
- model order
- field names and types
- enums and their values
- relations
- the migration version list at the top (if any)

This schema is the **naming source of truth**.

### Step 2: Scan and sort migration files

1. List all `.sql` files in the backend's migration directory.
2. Extract version numbers from the Flyway files (`V1__*.sql`, `V2__*.sql`, ...) and sort in Flyway execution order (numeric version — `V10` comes after `V9`).
3. **CRITICAL: Check git history for each migration file.** Backend developers may edit existing migration files in-place instead of creating new ones. Run `git log --oneline -10 -- <migration-file>` (in the backend repo) for each file. If there are commits newer than the last sync, the file MUST be re-read and fully compared — even if the version number has not changed.

### Step 3: Read and apply migrations

1. Read each migration file in order.
2. Reconstruct the final database schema by logically applying all CREATE TABLE, ALTER TABLE, CREATE TYPE, and other DDL statements.
3. Track: tables, columns, types, constraints, indexes, foreign keys, enums.

### Step 4: Sync Java enums

1. Read all auto-discovered Java enum files (files containing `public enum`).
2. For each Java enum:
   - Extract the enum name and all its values.
   - If a matching Prisma enum exists, sync its values to match the Java enum exactly.
   - If no matching Prisma enum exists, create a new one.
   - Java enum values are the **source of truth** over SQL enums when both exist.

### Step 5: Compare and update

1. Compare the reconstructed database schema with the existing Prisma schema.
2. Update the Prisma schema only where necessary.
3. Write the updated schema back to the auto-discovered `schema.prisma` path.

### Step 6: Validate the schema

Run `npx prisma validate --schema <path-to-schema.prisma>` to verify the schema is syntactically valid. There is no live database — do not run `prisma generate` or `prisma migrate`.

Prisma 7 note: the `datasource` block must NOT contain a `url` field. Use `provider = "postgresql"` alone.

### Step 7: Self-review BEFORE reporting done (MANDATORY)

`prisma validate` only catches syntax errors — it does NOT catch semantic mismatches with the SQL source. You MUST run the full self-review checklist below before claiming the sync is complete. Treat this step as non-optional.

Use TodoWrite to track the checklist. Mark each item ☑ only after you have actually verified it against the SQL.

For EACH model:

1. **Field count** — number of Prisma scalar fields equals number of SQL columns (excluding FK relation pointers, which are extra).
2. **Field order** — Prisma scalar field order matches SQL column order, top to bottom.
3. **Field naming (rule #4)** — `snake_case` → strict `camelCase`. NEVER add suffixes like `Id` that don't exist in the SQL column name (`created_by` → `createdBy`, NOT `createdById`).
4. **Types** — every SQL `BIGINT`/`SERIAL`/`BIGSERIAL` → `Int`. `TIMESTAMPTZ` → `DateTime`. `DATE` → `DateTime`. `TEXT`/`VARCHAR` → `String`. `DECIMAL(p,s)` → `Decimal @db.Decimal(p, s)`.
5. **Nullability** — every SQL column without `NOT NULL` becomes Prisma `?` (except `created_at` per rule #13).
6. **Defaults** — every SQL `DEFAULT <expr>` is reflected:
   - `DEFAULT 'literal'` → `@default("literal")` or `@default(EnumValue)`
   - `DEFAULT NOW()` → `@default(now())`
   - `DEFAULT nextval(...)` / any function call → `@default(dbgenerated("<exact SQL expression>"))`
   - `DEFAULT FALSE/TRUE/0` → `@default(false/true/0)`
   - **Sequence/computed defaults are a frequent miss** — `Report.code` / `Indicator.code` style columns generated from a sequence require `dbgenerated`, not bare `String`.
7. **PK / autoincrement (rule #11)** — `GENERATED ... AS IDENTITY` / `SERIAL` / `BIGSERIAL` → `@id @default(autoincrement())`. A plain `BIGINT PRIMARY KEY` (no IDENTITY) → `@id` with NO `autoincrement()` (it's populated externally).
8. **FK + ON DELETE action** — every `REFERENCES` produces a `@relation`. Match `ON DELETE CASCADE` → `onDelete: Cascade`, `ON DELETE SET NULL` → `onDelete: SetNull`. Bare FK = default (Restrict).
9. **Composite PK** — `PRIMARY KEY (a, b)` → `@@id([a, b])`.
10. **Named unique constraints / indexes** — every `CONSTRAINT uq_xxx UNIQUE (...)` → `@@unique([...], map: "uq_xxx")`. Every `CREATE INDEX idx_xxx` → `@@index([...], map: "idx_xxx")`. Single-column inline unique with a constraint name → `@unique(map: "uq_xxx")`.
11. **Partial / expression indexes** — Prisma cannot express `WHERE deleted = FALSE` or `COALESCE(...)` indexes. Add a `// DB also enforces PARTIAL UNIQUE INDEX ...` comment near `@@map` so the invariant is not lost.
12. **CHECK-constraint enums (rule #7)** — EVERY `CHECK (col IN (...))` MUST become a Prisma enum, even if no Java enum exists. Common misses: `users.gender`, `users.status`, `*.scope`, `*.status`, `*.type`, `*.level` (e.g. `administrative_unit.level`), `*.period_type`. The ONLY allowed escape: a CHECK value that isn't a valid Prisma identifier (e.g. `'*'` in `permission.method`) — in that case keep `String` and add a comment explaining why.
13. **Java enum sync** — for every Java `public enum`, the Prisma enum exists with the EXACT same values in the EXACT same order. Java is source of truth over SQL CHECK order.
14. **Enum name collisions** — Prisma enum names are global. If a Java enum and a CHECK-derived enum (or two Java enums in different packages) share a name, prefix one (e.g. `ReportStatus` vs `IndicatorStatus` instead of two `Status`) and add a comment mapping it back to the Java FQN.
15. **Model name collisions with enums** — Prisma forbids a model and enum sharing a name (e.g., table `user_role` + enum `UserRole`). Rename the model (e.g., `UserRoleAssignment`) and keep `@@map("user_role")`.
16. **Migration version record** — top-of-file comment lists every migration with its commit hash.

After completing the checklist, run `npx prisma validate` one final time.

ONLY THEN may you report the sync as complete. Do not wait for the user to ask "review again" — the review is part of the job.

## Common bugs to actively look for

These are real bugs that have slipped through past syncs. Check each one explicitly:

- **Sequence default missing** — column has `DEFAULT (... nextval(...) ...)` but Prisma field has no `@default(dbgenerated(...))`.
- **`createdById` instead of `createdBy`** — Rule #4 forbids adding `Id` suffix. The SQL column is `created_by`, the Prisma field is `createdBy`. Period.
- **CHECK enum dropped to String** — `administrative_unit.level CHECK ('PROVINCE', 'DISTRICT', 'COMMUNE')` → must become `enum AdministrativeLevel`, not `String`.
- **`@unique` on a non-unique FK column** — only add `@unique` if the SQL column itself has `UNIQUE`. Don't add it just because you want a one-to-one Prisma relation.
- **Missing `onDelete: SetNull` / `Cascade`** — easy to forget; grep the migration for `ON DELETE` and match every one.
- **`created_at NOT NULL DEFAULT NOW()` vs `created_at TIMESTAMPTZ` (no default)** — rule #13 says `createdAt` is ALWAYS `DateTime @default(now())` regardless of what SQL says. `updatedAt` follows the SQL nullability instead.
- **Comments in Vietnamese / non-English** — global rule: all authored content is in English.
- **Comments wedged between relation lines** — keep model bodies grouped: scalars, then relations, then `@@` attributes. Anchor explanatory comments to the relevant scalar or to `@@map`.
- **Inventing fields the SQL doesn't have** — if a column isn't in any migration, it doesn't exist. Don't add it from intuition.

## Tips & tricks for working efficiently

- **Batch reads.** Issue all enum-file reads and all migration-file reads in a single message with parallel tool calls. Don't read one file per turn.
- **`grep -nE` is your friend for sanity checks.** After writing the schema, grep it for patterns that smell wrong: `grep -nE "createdById|updatedById"` (rule #4 violations), `grep -n "String.*@default" schema.prisma` (possible missed enum), `grep -nE "CHECK \(" migration.sql` (catalog of CHECK enums to verify against the schema).
- **Diff in your head per model, not per file.** Open the SQL `CREATE TABLE` and the Prisma model side by side mentally; walk the columns top-to-bottom. Catching a missed field is much easier model-by-model than scanning the whole file.
- **`prisma validate` is necessary but NOT sufficient.** It catches syntax and relation-graph errors. It does NOT catch: wrong nullability, wrong default, missed CHECK enum, wrong onDelete, renamed field, missing field. Use the Step 7 checklist for those.
- **Two FKs forming a cycle** (e.g. `province.capital_district_id → district.id` AND `district.province_id → province.id`) need two `@relation` names. Don't try to merge them; SQL has both, so Prisma has both.
- **`BIGINT` vs `BIGSERIAL`** — both store 8-byte ints, but `BIGSERIAL` auto-increments. The difference determines whether to add `@default(autoincrement())`.
- **Don't sleep on V2/V3+ migrations.** Even if they are "data seeds," scan with `grep -iE "(ALTER|CREATE|DROP) " <file>` to confirm zero DDL before noting "data seed only, no DDL".
- **Don't trust the previous turn's edits.** When the user says "review again," re-read the file fresh — your in-context summary may not reflect the latest state.

## Migration Version Record (MANDATORY)

After processing, write the migration/schema source list at the very top of the Prisma file. Include the **latest commit hash** of each migration file so future syncs can detect in-place edits.

```prisma
// MIGRATIONS USED (../dona-province-dashboard-be)
// V1__init.sql (last commit: abc1234)
// V2__create_province_district.sql (last commit: def5678)
// V3__add_indicator.sql (last commit: 9ab0cde)
```

## Critical Rules (MUST FOLLOW)

### 1. Generator and datasource

DO NOT modify the existing `generator` or `datasource` configuration.

### 2. Model naming priority

- Existing Prisma model names ALWAYS take priority.
- If a table does not exist in the previous schema, create a new model using the SQL table name.

### 3. Model order

- Keep the exact same model order as in the existing Prisma schema.
- New models are appended at the end.

### 4. Field naming (STRICT)

Field names MUST be camelCase versions of the SQL column names. The conversion must be EXACT:

| SQL column | Prisma field |
|---|---|
| `created_at` | `createdAt` |
| `updated_at` | `updatedAt` |
| `user_id` | `userId` |
| `district_id` | `districtId` |

Rules:
- Only convert `snake_case` to `camelCase`
- Do NOT rename fields arbitrarily
- Do NOT shorten field names
- Do NOT introduce new naming
- Do NOT use `@map()` for fields

### 5. Table mapping

If the database table name is `snake_case`, use `@@map("table_name")`.

### 6. BIGINT rule (MANDATORY)

Every SQL `BIGINT` or Java `Long` must be converted to `Int`. Never generate Prisma `BigInt`.

### 7. ENUM rules (VERY IMPORTANT)

- Always generate Prisma enums if SQL enums exist.
- Never convert enums to String.
- Never delete enums.
- Enum keys and values must be identical.
- Do NOT generate enum mappings.
- Java enums are the source of truth over SQL enums.

### 8. Preserve constraints

Preserve: primary keys, foreign keys, unique constraints, indexes.

### 9. Generate relations

Generate relations based on foreign keys.

### 10. Nullable columns

Nullable SQL columns must become optional Prisma fields (`?`).

### 11. Auto-increment

Detect auto-increment columns and apply `@id @default(autoincrement())`.

### 12. No schema refactoring

DO NOT:
- Rename models or fields
- Merge tables
- Split models
- Change types except `BIGINT` to `Int`

### 13. `createdAt` rule (MANDATORY)

If a model contains a `created_at` column in SQL:

```prisma
createdAt DateTime @default(now())
```

- `createdAt` must NEVER be nullable
- Always include `@default(now())`
- Never generate `createdAt DateTime?`

### 14. Field order (VERY IMPORTANT)

When updating existing models:
- NEVER reorder fields inside a model
- Preserve the exact field order from the existing Prisma schema
- Add new fields only at the END of the model

## Type Conversion Table

| PostgreSQL | Prisma |
|---|---|
| `bigint` | `Int` |
| `integer` | `Int` |
| `smallint` | `Int` |
| `varchar` | `String` |
| `text` | `String` |
| `timestamp` | `DateTime` |
| `timestamptz` | `DateTime` |
| `date` | `DateTime` |
| `boolean` | `Boolean` |
| `json` / `jsonb` | `Json` |
| `uuid` | `String` |

## Output Requirements

The updated Prisma schema file must:
1. Start with the migration version list
2. Preserve existing `datasource` and `generator` configuration
3. Preserve model names and order from the original schema
4. Append new models only if they do not exist