You are a senior full-stack engineer maintaining a frontend project that consumes APIs from a Java Spring Boot backend.

Your task is to fetch the latest changes from the backend repository, analyze what changed, and produce a structured activity log file that guides the frontend team on what needs to be done.

## Step 1 — Locate the Backend Repository

This project has exactly **one** backend:
- `../dona-province-dashboard-be` — Spring Boot 4 / Java 21, port 8080, Java package `com.donasky.province_dashboard`

If `CLAUDE.md` has a "Sibling Repositories" section, trust it over this default. If the path does not exist, ask the user.

## Step 2 — Git Fetch & Pull

In the backend repo:
1. `git fetch origin`
2. Capture new commits: `git log HEAD..origin/$(git rev-parse --abbrev-ref HEAD) --oneline`
3. If there are new commits, run `git pull`
4. Save the full list of new commit hashes + messages

If there are **no new commits**, note "no changes" and skip further analysis (still write a SKIP file — see Step 5).

## Step 3 — Collect Changed Files

If the backend had new commits, run:

```bash
git diff HEAD~<N>..HEAD --name-status
```

Where `<N>` is the number of commits pulled. This gives a complete list of added / modified / deleted files.

Then, for each **relevant file**, capture the actual diff:

```bash
git diff HEAD~<N>..HEAD -- <filepath>
```

Focus on files in these categories (paths under `src/main/java/com/donasky/province_dashboard/` unless noted):
- `src/main/resources/db/migration/V{n}__*.sql` — Flyway migration files (schema **and** permission seed, when present)
- `src/main/resources/validation/validationItems.json` — field-level validation rules (`@ItemValidate` lookups), when present
- `controller/*Controller.java` — API endpoint definitions
- `dto/request/**/*Request.java`, `dto/response/**/*Response.java` — DTO shapes (`{Resource}{Action}Request/Response`)
- `entity/*.java` — JPA entity / data model changes (extend `BaseEntity` from `org.donasky:common-lib`)
- `constant/**/*.java` — Java enums (discover with `grep -rl "public enum"`) and `CommonConstant` changes
- `**/validation/annotation/*.java`, `**/validation/validator/*.java` — custom validation annotations and their validators, when present
- `config/AppSecurityConfig.java` — `UrlPermitMatcher` public-URL changes and `PermissionProvider` / `RoleProvider` wiring

## Step 4 — Classify: TODO or SKIP

- **TODO** — meaningful changes affecting the frontend (schema, contracts, UI, enums, permissions, validation rules, public URLs, etc.)
- **SKIP** — only minor/irrelevant changes (comments, refactors, test files, CI config, internal services with no API impact)

## Step 5 — Write the Activity Log File

Create a file at:

```
.docs/backend-activities/<YYYY-MM-DD_HH-mm>-<action>.md
```

Where:
- `<YYYY-MM-DD_HH-mm>` is the current date/time, zero-padded and sortable
- `<action>` is `TODO` or `SKIP`

Example: `.docs/backend-activities/2026-05-25_14-30-TODO.md`

Create the `.docs/backend-activities/` directory if it does not exist.

### File Contents

```markdown
# Backend Activity — <YYYY-MM-DD HH:mm>

## Summary

| Repo | Commits pulled | Action |
|------|---------------|--------|
| `dona-province-dashboard-be` | <N commits / "no changes"> | TODO / SKIP |

---

## New Commits

| Hash | Message |
|------|---------|
| `abc1234` | feat: add population column to district |
| `def5678` | fix: return correct status in IndicatorController |

---

## Changed Files

| File | Status |
|------|--------|
| `src/main/resources/db/migration/V4__add_district_population.sql` | Added |
| `src/main/java/.../controller/DistrictController.java` | Modified |
| `src/main/java/.../dto/response/DistrictDetailResponse.java` | Modified |

---

## Before / After

For each relevant changed file, show the meaningful diff:

### `DistrictDetailResponse.java`

**Link:** [DistrictDetailResponse.java](../dona-province-dashboard-be/src/main/java/.../dto/response/DistrictDetailResponse.java)

```diff
+ private Long population;
+ private DistrictStatus status;
```

### `V4__add_district_population.sql`

**Link:** [V4__add_district_population.sql](../dona-province-dashboard-be/src/main/resources/db/migration/V4__add_district_population.sql)

```sql
ALTER TABLE district ADD COLUMN population BIGINT;
```

### `validationItems.json` (if changed)

```diff
+ "districtName": { "type": "String", "maxLength": 255 }
```

(Continue for all relevant files)

---

## Logic Notes

> Frontend-relevant implications of the changes above. Examples:
> - New nullable column `population` → entity schema needs `.nullable()`
> - Enum `IndicatorStatus` gained value `ARCHIVED` → frontend enum const and Zod schema need update
> - Endpoint `POST /api/v1/reports/{id}/publish` added → new contract route needed; check permission seed for matching `REPORT_PUBLISH` entry
> - New `validationItems.json` key `districtName` → contract body must reflect `maxLength: 255`
> - Custom annotation regex updated → re-derive the matching Zod rule
> - `UrlPermitMatcher` in `AppSecurityConfig` changed → endpoint became public/protected; contract `headers: jwtAuthHeaderSchema` may need update
> - JWT payload / `ResponseObject` envelope changed (common-lib bump) → token parsing or response unwrapping may need update

> **Watch for BE-internal columns/tables in migrations.** When a migration adds a column or table matching one of these patterns, the **prisma shadow still gets it** (the shadow is 100% — see `/sync-prisma-schema`'s "Shadow Policy" section), but `/sync-entity-schemas` must **skip** it because the column exists in the DB without ever appearing in any API response DTO — including it in the FE entity schema causes Zod parse failures.
> - `*_seq` / `*_code_seq` — code-generation counters (e.g. `report_code_seq`)
> - `version` — Hibernate optimistic-lock revision
> - `*_lock`, `*_locked_at`, `*_locked_until` — row-lock primitives
> - `deleted`, `is_deleted`, `deleted_at` — soft-delete flags
> - `*_token`, `*_secret`, `password_hash` — credentials/secrets
> - `search_vector`, `tsvector`, `embedding` — indexing internals
> - Pure-storage tables whose API surface is a derived shape (e.g. `user_settings` → exposed as a parsed `Map<String, Object>`, not as a row)
>
> Before recommending `/sync-entity-schemas`, grep the matching `*Response.java` DTO to confirm the new column is actually exposed. If it isn't, explicitly call this out in the Logic Notes so the FE engineer knows to (a) shadow it in prisma with a `// BE-INTERNAL — ...` comment per `/sync-prisma-schema`'s comment format, and (b) skip it from the entity schema.

> **Watch for permission seed changes.** Any new/changed rows in `INSERT INTO permission (...)` or `INSERT INTO role_permission (...)` blocks of a migration file mean the FE permission registry (`packages/zod-schemas/src/permission/*.ts`, create it if absent) needs an update. List the affected permission codes here so they aren't missed.

---

## Claude's Recommendations

Based on the changes above, the suggested next steps are:

- [ ] **If migrations updated DDL (CREATE/ALTER TABLE) or Java enums changed** → `/sync-prisma-schema` then `/sync-entity-schemas`
- [ ] **If permission seed (`INSERT INTO permission`) or `role_permission` grants changed** → update `packages/zod-schemas/src/permission/*.ts` (codes must match seed exactly)
- [ ] **If API endpoints, DTOs, `validationItems.json`, custom validators, or `UrlPermitMatcher` changed** → `/sync-contract-from-backend`
- [ ] **After schema/contract changes** → check affected UI pages and fix type errors
- [ ] **Lint check** → `pnpm lint` on all touched files:
  ```
  pnpm lint 2>&1 | grep -E "(file1|file2)" | head -40
  ```
  Empty output = clean. Fix any errors before closing out.
- [ ] **Mark as synced** → once lint passes, rename this activity log file by replacing the `TODO` suffix with `SYNCED`:
  ```
  mv .docs/backend-activities/<YYYY-MM-DD_HH-mm>-TODO.md .docs/backend-activities/<YYYY-MM-DD_HH-mm>-SYNCED.md
  ```
  This signals the activity has been fully processed and avoids re-running recommendations.
- [ ] **Reset backend repo to the analyzed commit** → after all sync work is done, reset the backend's local HEAD to the exact commit that was analyzed (captured in Step 2). Do **not** use `git pull` here — the remote may have new commits that have not been analyzed yet:
  ```bash
  cd ../dona-province-dashboard-be && git reset --hard <analyzed-commit-hash>
  ```
  This keeps local HEAD in sync with what was actually processed. If there were "no changes", skip it. This only affects local state — nothing is pushed to the remote.

> Only include checklist items that are relevant to what actually changed.
```

## Important Notes

- **Never modify `schema.prisma`** in this command — only recommend it.
- Use **relative paths** in all links (`../dona-province-dashboard-be/...`), never absolute `D:\...` or `/Users/...` paths.
- If `git pull` would cause a merge conflict, stop and report to the user — do not force anything.
- This output file is a **prompt document**: when the user later says "xem file TODO" or pastes the filename, Claude should read it and execute the recommendations end-to-end.
- Even for **SKIP** actions, write the file as a dated audit trail.
