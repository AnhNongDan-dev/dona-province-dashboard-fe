# Thành Đoàn Đồng Nai Central — Frontend

Cổng tài khoản trung tâm: đăng nhập một lần (OIDC) cho các hệ thống của Thành Đoàn, tự đăng ký,
liên kết / gộp tài khoản, quản lý phiên và kênh liên lạc.

Stack: React 19 + Vite + TanStack Router/Query/Table + ts-rest + Zod v4 + Tailwind v4 + Radix (shadcn), pnpm + Turborepo, Biome. Chi tiết: [TECH-STACK.md](TECH-STACK.md).

Backend: `../dona-province-dashboard-be` (dev port 8081). Vite proxy các đường `/api/`, `/oauth2/`, `/.well-known/`, `/userinfo`, `/connect/`, `/sso/` sang BE, giữ Host `localhost:3000`.

```bash
cp .env.example .env
pnpm install
pnpm dev:fe          # chỉ FE
pnpm dev:fullstack   # FE + BE
```

Luồng và contract: xem `packages/zod-schemas/src/api-contract/` và `CLAUDE.md`.
