# One-Shot — Execute End-to-End, No Chat Until Done

You have received a concrete, self-contained task. The user will NOT respond to clarifying questions, status updates, or mid-flight chat. Execute end-to-end and stop only when the task is verifiably complete or you hit a hard STOP condition below.

## Operating mode
- Silent execution. No commentary, no "I will now…", no progress narration outside the mandated checkpoints.
- Decisions are yours. When a choice is ambiguous, resolve it by reading the codebase, not by asking.
- One pass. Front-load all context gathering before coding. Do not loop back to ask.

## Phase 1 — Context lock (read-only, no edits)
1. Read the route/file the task targets, its parent layout, and every component it imports.
2. Map data: grep `apps/frontend/src/repositories/`, `clientAPI`, and `packages/zod-schemas/src/api-contract/` for every endpoint touching this domain.
3. Pattern lock: grep for 2–3 sibling implementations of the same UI/bug pattern in this repo. Match the convention you find — do NOT invent a new one.
4. Skill scan: if the work matches `zod-form`, `zod-form-trigger-dialog`, `tanstack-table`, `repository-pattern`, `tanstack-router`, `use-router-types`, or `ts-rest-contract` — read that SKILL.md before planning. Auto-load on match.
5. Permissions: confirm gating via `<PermissionCheck>` / `requirePermission(...)` from `packages/zod-schemas/src/permission/` (not ported yet — if the task needs gating before it exists, port it from ELP-fe per `.claude/rules/permission-check.md`). Never gate on `role`.

Output: `✅ Context locked` + one-line summary of files read, APIs mapped, patterns matched, skills loaded. Nothing else.

## Phase 2 — Branch on task type
Classify the task as exactly one of:

- **NEW UI / page refactor** → switch flows immediately to `@.claude/prompts/refactor-ui.md` and execute its 12-step workflow from Step 1. Do not continue this prompt.
- **BUG FIX** → continue below.
- **Small feature / wiring change** → continue below.

## Phase 3 — Ideation (bug fix / small feature only)
Generate 2–3 candidate approaches. For each: one-line fix, files touched, risk, blast radius. Pick one. Lock it.

## Phase 4 — Plan
Write a tight implementation plan:
- Root cause (bug) OR target behavior (feature) — one paragraph, evidence-backed (file:line)
- Files to create/modify (full paths)
- Repository / query-key / invalidation changes
- Permission gating
- Binary acceptance criteria (pass / fail, no prose)
- Out-of-scope list (what you will NOT touch)

## Phase 5 — Multi-agent plan review (MANDATORY, parallel)
Spawn 3 subagents IN PARALLEL in a single message. Each gets a self-contained brief (task, files, plan, acceptance criteria).
- Agent 1 — Technical feasibility, edge cases, data-shape gaps, permission correctness
- Agent 2 — UX impact, persona alignment, UI text, accessibility (always weigh UX, even for "just a bug fix")
- Agent 3 — Flow, navigation, cross-page side effects, regression surface

Consolidate. Annotate which agent caused each change. Resolve conflicts with a one-line rationale. Produce plan v2.

Output: `✅ Plan v2 ready` + diff vs v1.

## Phase 6 — Implement
Execute plan v2. Do NOT exceed planned scope.
- Follow Project Constraints below
- After each significant file: `✅ <what was done> — <file:line>`
- No comments explaining WHAT the code does — only WHY when non-obvious
- No `any`, no `enum`, no `namespace`
- Never edit `routeTree.gen.ts`, `components/ui/*.tsx`, `clientAPI.config.ts`
- Field placeholders use "VD:" prefix or helpText — never look like real values

## Phase 7 — Post-implementation review (MANDATORY)
Spawn 1 review subagent. Brief: changed files, plan v2, acceptance criteria. Lens: senior frontend engineer auditing for correctness, scope creep, pattern drift, missed acceptance criteria.

Consolidate feedback. Apply fixes. Re-verify each acceptance criterion against files re-read fresh from disk (do NOT trust in-context snapshots).

## Phase 8 — Lint gate (terminal phase)
Run lint scoped to your edited files only:
`pnpm lint 2>&1 | grep -E "(<file1>|<file2>|...)" | head -60`

Fix every error in YOUR files. Never bypass with `eslint-disable` or `@ts-ignore`. Repeat until grep output is empty.

When grep is empty: `✅ Lint clean — DONE`. STOP. No summary, no follow-ups, no "anything else?". Silence.

## Project constraints (apply throughout)
- React 19 + TanStack Router + ts-rest + Zod v4 + Tailwind v4 + shadcn
- Permission gating via `<PermissionCheck>` / `requirePermission(...)` only
- Derive types from a single source (`z.infer`, utility types) — never duplicate
- Biome: double quotes, 2-space indent, 100-char lines
- Grep for similar patterns before writing new code — follow existing convention

## Hard STOP conditions (these are the ONLY reasons to break silence and ask)
- Deleting any file
- Adding a new dependency (`pnpm add ...`)
- Modifying anything under `packages/zod-schemas/**`
- Creating a new route without confirmed permission
- Changing BE contract business logic
- Task as written is internally contradictory or references a file/symbol that does not exist after a thorough grep

If none of these trigger: do not ask. Decide and proceed.
