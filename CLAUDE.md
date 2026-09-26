# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Detailed conventions live in `.claude/rules/*.md` (auto-loaded via `paths:` frontmatter when matching files are read) and `.claude/skills/*/SKILL.md` (auto-discovered). This file covers only topology and cross-cutting context.

> **Unsure which skill to use?** Read `which-skill` (`.claude/skills/which-skill/SKILL.md`) first.

## Project

dona-province-dashboard-fe — frontend monorepo for the DONA Province Dashboard. React 19 + Vite + TanStack Router/Query/Table + ts-rest + Zod v4 + Tailwind v4 + Radix (shadcn), pnpm workspaces + Turborepo, Biome. Stack inherited from the sister project ELP-fe (`D:\DONASKY\SOURCE\ELP\ELP-fe`) — see `TECH-STACK.md`.

## Backend

Exactly **one** backend: sibling repo `../dona-province-dashboard-be` (not a submodule).

- Spring Boot 4 / Java 21, port **8080** → FE env `VITE_SERVER_URL=http://localhost:8080` (root `.env`, see `.env.example`).
- Java package `com.donasky.province_dashboard` — `controller/`, `service/` + `service/impl/`, `repository/`, `entity/`, `dto/request|response/` (`{Resource}{Action}Request/Response`), `mapper/`, `constant/CommonConstant.java`.
- Uses `org.donasky:common-lib`: `ResponseObject` envelope (mirrored by `packages/zod-schemas/src/api/response.ts`), JWT security, `PermissionProvider`/`RoleProvider` hooks, public URLs via `UrlPermitMatcher` in `config/AppSecurityConfig.java`.
- Schema = Flyway migrations in `src/main/resources/db/migration/V{n}__*.sql`.

`pnpm dev:be` / `pnpm dev:fullstack` `cd ../dona-province-dashboard-be`, so the directory layout `DONA-PROVINCE-DASHBOARD/{dona-province-dashboard-fe, dona-province-dashboard-be}` is load-bearing.

## Monorepo layout

```
apps/
  frontend/         # React 19 + Vite SPA
  open-api/         # Generates OpenAPI YAML from ts-rest contracts
packages/
  shared/           # App config, constants, utilities (no React)
  zod-schemas/      # Zod schemas, ts-rest contracts, entity types, permission registry
```

Workspace aliases: `@repo/frontend`, `@repo/shared`, `@repo/zod-schemas`. In `apps/frontend/src` use `@/...`. Vite resolves `@repo/*` directly to source (no build step for packages).

## Commands

```bash
pnpm dev:fe          # Frontend only (Vite, port FRONTEND_PORT or 3000)
pnpm dev:be          # Backend on :8080
pnpm dev:fullstack   # FE + BE concurrently
pnpm dev:scan        # FE with react-scan overlay
pnpm openapi         # Regenerate OpenAPI YAML from contracts
pnpm lint            # turbo lint (tsc -b per app) + biome lint
pnpm format          # biome check --write
```

Node `>=22`, pnpm `10.13.1`.

## Architecture — the contract spine

Every feature starts in `packages/zod-schemas`, then the frontend wires it up:

```
packages/zod-schemas/src/
├── common.ts          # commonZod field library (every user-facing field lives here)
├── custom-type.ts     # Branded types (dateOnly, timeOnly, sortQuery) + parseXxx helpers
├── entity/            # *-schema.ts — one file per domain (xxxSchema / xxxItemSchema / xxxDetailSchema)
├── api-contract/      # *.contract.ts per domain; index.ts composes appContract
│   └── schemas/       # Shared header / token schemas
├── permission/        # (when added) mirrors the BE permission seed 1:1
├── form/              # Form-side schemas (superRefine cross-field validation, never on contracts)
└── api/               # Response envelope + ErrorCode
```

- `apps/frontend/src/config/clientAPI.config.ts` — typed RPC client over `initClient(appContract)`: `clientAPI.Province.list({ query })`. **No JWT handling yet** — port `lib/token-manager.ts` + the auth-header branch from ELP-fe when auth lands.
- `apps/frontend/src/repositories/` — every API call goes through TanStack Query factories in `-factory.ts` (`createQueryRepository`) and `-paging.ts`. See skill `repository-pattern`.
- `apps/frontend/src/routes/` — file-based routing; `routeTree.gen.ts` is generated. `-` prefixed files/folders are route-ignored.
- `apps/frontend/src/components/ui/` — shadcn components (generated, biome-excluded).

## Not yet ported from ELP-fe

zod-form + global dialog/drawer, data-table kit (`DataTable`, `useUrlSearch`, `SearchInput`…), theme provider/color themes, auth + permission registry + `PermissionCheck`, page-status pages. Skills that depend on them say which files to copy from ELP-fe — port on first use, then adapt.

## Sync workflows (when BE changes)

Slash commands in `.claude/commands/`, run in order:

1. `/check-backend` — pull `../dona-province-dashboard-be`, write `.docs/backend-activities/<ts>-TODO.md`.
2. `/sync-prisma-schema` — if DDL or Java enums changed (shadow `packages/zod-schemas/prisma/schema.prisma`, no live DB).
3. `/sync-entity-schemas` — reconcile `packages/zod-schemas/src/entity/*-schema.ts`.
4. `/sync-contract-from-backend` — regenerate contracts + permission registry from controllers/DTOs/seed.

## Critical library versions

| Library | Version | Notes |
|---|---|---|
| Zod | `^4.4.3` | v4 — `z.email()` / `z.int()` / `z.iso.datetime()`, NOT v3 style |
| ts-rest | `3.53.0-rc.1` | pinned via `pnpm.overrides` |
| Tailwind | `^4.1.17` | v4 CSS-first config |
| TanStack Router | `^1.170.8` | |
| TanStack Query | `^5.90.16` | |

`tsconfig` has `erasableSyntaxOnly` → no TS `enum` / `namespace`. Biome: double quotes, 2-space indent, 100-char lines. Generated files (`routeTree.gen.ts`, `components/ui/*.tsx`, `clientAPI.config.ts`) are biome-excluded.
