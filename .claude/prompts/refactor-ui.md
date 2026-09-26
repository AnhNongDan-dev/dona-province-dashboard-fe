# Refactor UI — Workflow Prompt

## Input (fill in)
Page to refactor / build: [ROUTE_PATH or page name — e.g. /app/provinces/$provinceId]
Extra requirements (optional): [e.g. "mobile-first", "must use tabs"]

## Mandatory workflow — execute sequentially. DO NOT skip, merge, or reorder steps. DO NOT code before Step 10.

### Step 1 — Understand the page
- Read the route file, related components, and parent layout
- Answer: What is this page? What is its primary purpose? Where does it sit in the overall app flow?
- Output: short paragraph describing the page + line `✅ Step 1 done`

### Step 2 — Map data
- Find ALL APIs available for this page via `apps/frontend/src/repositories/`, `clientAPI`, and ts-rest contracts in `packages/zod-schemas/src/api-contract/`
- List the full data set: entity, fields, relations, required permissions
- Output: table of API → data shape + `✅ Step 2 done`

### Step 3 — Raw feature list
- From Step 2 data, derive EVERY feature this page could support: view, filter, sort, search, CRUD, navigation, bulk actions, export, etc.
- DO NOT filter at this step — list everything
- Output: raw feature list + `✅ Step 3 done`

### Step 4 — Persona filter
- Identify the page's user: role (as defined by the BE role seed / `UserRole`) and concrete permissions from `packages/zod-schemas/src/permission/`
- Acting as that user, select features from Step 3 that are actually needed
- Drop features that do not match the persona's permissions or jobs-to-be-done
- Output: filtered feature list per persona + `✅ Step 4 done`

### Step 5 — Layout exploration
- MANDATORY: read `.claude/skills/which-skill/SKILL.md` and the design skill it points to for this kind of page (e.g. `.claude/skills/design-taste-frontend/SKILL.md`, `.claude/skills/minimalist-ui/SKILL.md`)
- Consider the layouts described in those skills
- Reason about additional layouts that may fit even if not in the skill
- Output: 3–5 layout candidates with pros / cons + `✅ Step 5 done`

### Step 6 — UX self-review (act as the user)
For EACH layout candidate, answer ALL of the following:
1. Who is the user? What do they need to do on this page?
2. Is every piece of information shown effective? Will the user understand it at a glance?
3. Is any information hard to reach? Can the user perform action X immediately when they want to?
4. Are there links to related pages? Does information X link to page X? Can the user navigate to related pages when needed?
5. Is the UI text clear? Are the words appropriate for this app and for this user role?
6. Is the flow easy? Are there friction points or risks?
7. If this layout is a common pattern, am I overthinking and going against the majority?
- Output: comparison table + `✅ Step 6 done`

### Step 7 — Decision + plan
- Lock in the final layout after resolving every question in Step 6
- Produce a detailed implementation plan:
  - New / modified files (full paths)
  - Component breakdown
  - Route / loader changes
  - Repository calls + query keys + invalidation strategy
  - Permission gating
  - Form / table / dialog pattern → which skill applies
  - Binary acceptance criteria (pass / fail)
- DO NOT code — plan only
- Output: reviewable plan + `✅ Step 7 done`

### Step 8 — Multi-agent review (MANDATORY, parallel)
- Spawn 3 subagents IN PARALLEL (a single message with 3 Agent tool calls)
- Each agent receives a self-contained brief: page context + persona + chosen layout + full plan
- Role split:
  - Agent 1 — Technical feasibility, edge cases, permissions, data-shape gaps
  - Agent 2 — UX, UI text, persona alignment, accessibility
  - Agent 3 — Flow, navigation, cross-page links, page goal
- Output: 3 separate review reports + `✅ Step 8 done`

### Step 9 — Improve plan
- Consolidate feedback from the 3 agents
- Update the plan; annotate which agent's feedback caused each change
- For conflicting feedback, decide and document the reason
- Output: plan v2 + diff vs. v1 + `✅ Step 9 done`

### Step 10 — Implement
- Execute plan v2 — DO NOT exceed the planned scope
- Follow Project Constraints below
- After each significant file: `✅ [what was done] — [file:line]`
- Output: every file edited + `✅ Step 10 done`

### Step 11 — Final review
- Re-read ALL modified files fresh from disk (do not trust in-context snapshots)
- Self-check through 2 lenses:
  - "Review as user persona" — does the flow work?
  - "Review as senior frontend engineer" — over-engineered? wrong pattern?
- Verify each acceptance criterion from Step 7
- Output: pass / fail checklist + `✅ Step 11 done`

### Step 12 — Lint + bugfix
- Run: `pnpm lint 2>&1 | grep -E "(<file1>|<file2>|...)" | head -60`
- Fix every error in the files you modified — DO NOT bypass with `eslint-disable` or `@ts-ignore`
- Repeat until lint is clean for the modified files
- END when lint passes + `✅ Step 12 done`

---

## Project constraints (apply throughout)
- Stack: React 19 + TanStack Router + ts-rest + Zod v4 + Tailwind v4 + shadcn
- Use matching skills when applicable: zod-form / zod-form-trigger-dialog / tanstack-table / repository-pattern / tanstack-router / use-router-types
- Permission gating via `<PermissionCheck>` or `requirePermission(...)` — DO NOT use role checks (except the documented exceptions in `.claude/rules/permission-check.md`)
- DO NOT use `any`, `enum`, or `namespace` (erasableSyntaxOnly)
- DO NOT modify generated files: `routeTree.gen.ts`, `components/ui/*.tsx`, `clientAPI.config.ts`
- Style: double quotes, 2-space indent, 100-char lines (biome)
- Field placeholders MUST NOT look like real values — use a "VD:" prefix or helpText
- Derive types from a single source (`z.infer`, utility types) — never duplicate

## Behavior rules
- Do only what was requested. DO NOT add features or refactor outside the planned scope.
- Before coding, grep for similar patterns in the codebase and follow the existing convention.
- Ambiguity about UX or data shape → STOP and ask. Do not guess.
- DO NOT write comments that explain WHAT the code does. Only comment when the WHY is non-obvious.
- DO NOT commit or push on your own.

## Stop conditions (ASK before doing)
- Deleting any file
- Adding a new dependency (`pnpm add ...`)
- Modifying anything under `packages/zod-schemas/**` (contract / schema / permission)
- Creating a new route without confirmed permission
- Changing BE contract business logic

Start from Step 1. Print each step clearly with its header and the `✅ done` line.
