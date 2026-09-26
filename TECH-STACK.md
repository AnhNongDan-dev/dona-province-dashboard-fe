# Tech Stack — DONA Province Dashboard Frontend

> Kế thừa baseline từ project **ELP-fe**. Backend duy nhất: `../dona-province-dashboard-be` (Spring Boot, port `8080`).

## 1. Nền tảng & Ngôn ngữ

| Hạng mục | Lựa chọn | Phiên bản | Ghi chú |
|---|---|---|---|
| Runtime | Node.js | `>=22` | Pinned qua `engines` |
| Package manager | pnpm | `10.13.1` | Pinned qua `packageManager`; dùng pnpm workspaces |
| Ngôn ngữ | TypeScript | `~5.9.3` | `erasableSyntaxOnly` → **không** dùng `enum` / `namespace` |
| Monorepo orchestrator | Turborepo | `^2.7.3` | Cache build/lint theo task |

## 2. Cấu trúc Monorepo

pnpm workspaces + Turborepo. Aliases: `@repo/frontend`, `@repo/shared`, `@repo/zod-schemas`.

```
apps/
  frontend/         # React 19 + Vite SPA — app chính
  open-api/         # Sinh OpenAPI YAML từ ts-rest contracts
packages/
  shared/           # Config, constants, utilities (không có React)
  zod-schemas/      # Zod schemas, ts-rest contracts, entity types, permission registry
```

- Vite resolve `@repo/zod-schemas` & `@repo/shared` thẳng vào source (không cần build step cho packages).
- Trong `apps/frontend/src` dùng alias `@/...`.

## 3. Frontend Core

| Hạng mục | Lựa chọn | Phiên bản | Ghi chú |
|---|---|---|---|
| UI library | React | `^19.2.0` | |
| Build tool | Vite | `^7.2.4` | Plugin: `@vitejs/plugin-react`, `vite-plugin-svgr`, `vite-plugin-html` |
| Router | TanStack Router | `^1.170.8` | File-based routing, auto code-splitting, `routeTree.gen.ts` |
| Data fetching / cache | TanStack Query | `^5.90.16` | Bọc trong repository layer |
| Data table | TanStack Table | `^8.21.3` | |
| Minifier | Terser | — | Manual chunks chia vendor theo package |

## 4. API Contract Layer (xương sống)

| Hạng mục | Lựa chọn | Phiên bản | Ghi chú |
|---|---|---|---|
| Contract / RPC | ts-rest | `3.53.0-rc.1` | Pinned qua `pnpm.overrides`; `initClient(appContract)` |
| Validation / Schema | Zod | `^4.4.3` | **v4** — `z.email()`, `z.int()`, `z.iso.datetime()`, `z.file()` |
| OpenAPI gen | `@ts-rest/open-api` | `3.53.0-rc.1` | Sinh YAML từ contracts |

Mọi feature bắt đầu từ `packages/zod-schemas`: `entity/*-schema.ts` → `api-contract/*.contract.ts` → frontend wiring. FE đi qua **repository layer** (TanStack Query factories) cho mọi API call.

## 5. Forms

| Hạng mục | Lựa chọn | Phiên bản |
|---|---|---|
| Form state | react-hook-form | `^7.71.0` |
| Resolver | `@hookform/resolvers` | `^5.2.2` |
| Schema | Zod v4 (cross-field qua `superRefine` ở form-side schema) | — |

## 6. Styling & UI Components

| Hạng mục | Lựa chọn | Phiên bản | Ghi chú |
|---|---|---|---|
| CSS framework | Tailwind CSS | `^4.1.17` | **v4** — CSS-first config, `@tailwindcss/vite` |
| Headless primitives | Radix UI | `^1.4.3` | dialog, dropdown, select, tabs, tooltip, popover... (kiểu shadcn/ui) |
| Headless (bổ sung) | `@base-ui/react` | `^1.1.0` | |
| Variants | class-variance-authority | `^0.7.1` | |
| Class merge | clsx + tailwind-merge | `^2.1.1` / `^3.4.0` | |
| Animation | tw-animate-css + motion | `^1.4.0` / `^12.34.3` | |
| Icons | Tabler Icons + Lucide | `^3.36.1` / `^0.562.0` | |
| Theme | next-themes | `^0.4.6` | Light/dark |
| Toast | sonner | `^2.0.7` | |
| Command menu | cmdk | `^1.1.1` | |
| Drawer | vaul | `^1.1.2` | |
| Carousel | embla-carousel-react | `^8.6.0` | |
| OTP input | input-otp | `^1.4.2` | |
| Resizable panels | react-resizable-panels | `^4.6.5` | |

## 7. Thư viện bổ sung

| Mục đích | Lựa chọn | Phiên bản |
|---|---|---|
| Charts | recharts | `3.8.0` |
| Date utils | date-fns | `^4.x` |
| Date picker | react-day-picker | `^10.0.1` |
| Cookies | js-cookie, react-cookie | `^3.0.5` / `^8.0.1` |

Thư viện domain khác (xlsx, react-pdf, react-dropzone, @dnd-kit…) — chỉ thêm khi feature cần, ưu tiên cùng version với ELP-fe.

## 8. Tooling & Quy ước

| Hạng mục | Lựa chọn | Phiên bản | Cấu hình |
|---|---|---|---|
| Lint + Format | Biome | `^2.4.15` | **double quotes**, 2-space indent, 100-char line, `noExplicitAny: error`, auto organize imports |
| Type check | `tsc -b` (per app) | — | Chạy qua `turbo run lint` |
| Git hooks | Husky | `^9.1.7` | pre-commit trên staged files |
| Task runner | Turborepo | `^2.7.3` | |
| Tiện ích CLI | cross-env, concurrently, rimraf, mkdirp, cpy-cli, tsx | — | |

> **Lưu ý**: Biome dùng **double quotes** (config). Generated files được exclude khỏi lint: `routeTree.gen.ts`, `components/ui/*.tsx`, `clientAPI.config.ts`.

## 9. Scripts chuẩn

```bash
pnpm dev:fe        # Frontend only (Vite)
pnpm dev:be       # Backend ../dona-province-dashboard-be (port 8080)
pnpm dev:fullstack # FE + BE concurrently
pnpm build         # turbo run build
pnpm lint          # turbo lint (tsc -b) + biome lint
pnpm format        # biome check --write (format + organize imports)
pnpm openapi       # Sinh OpenAPI YAML từ contracts
```

---

## Tóm tắt 1 dòng

> **React 19 + TypeScript + Vite + TanStack (Router/Query/Table) + ts-rest + Zod v4 + Tailwind v4 + Radix UI**, quản lý bằng **pnpm workspaces + Turborepo**, lint/format bằng **Biome**. Xương sống là contract-first qua `ts-rest` + `zod-schemas`, FE truy cập API qua **repository layer (TanStack Query)**.
