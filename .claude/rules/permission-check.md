---
description: Rules for FE authorization — global permission vs. resource ownership (plus an optional scoped-role layer). Permission codes mirror the BE seed; roles come from the BE.
paths:
  - "apps/frontend/**/*.{ts,tsx}"
  - "packages/zod-schemas/src/permission/**/*.ts"
---

# Authorization Rules

> Most of the FE infra named here (`PermissionCheck`, `useCurrentUser`, `requirePermission`, `useResourceOwnership`, `currentUser.repository.ts`, `packages/zod-schemas/src/permission/`) is not in this repo yet — port it from ELP-fe (`D:\DONASKY\SOURCE\ELP\ELP-fe`) when the first gated feature lands. The rules below apply from day one.

The FE has **two** core authorization layers (plus an optional third if the BE adds a scoped role — see *Scoped roles*). Each call site must use exactly one. Mixing them is the root cause of most auth bugs.

| Layer | Source of truth | What it answers |
|---|---|---|
| **1. Global permission** | `currentUser.permissions: Set<Permission>` derived FE-side from `roleCodes` via the registry (mirror of BE seed) | "Does this user's system role allow this action anywhere in the app?" |
| **2. Resource ownership** | `item.createdBy === currentUser.id` | "Did this user create the resource they're trying to act on?" |

## Quick chooser

- Acts on something global (create a report, list districts, view an admin page) → **Layer 1**.
- Acts on a resource the user might own (edit my report, delete my draft) → **Layer 2** (often combined with the ADMIN super-role bypass).

---

## Layer 1 — Global permission

### Backend is the source of truth

The backend is `../dona-province-dashboard-be` (Spring Boot, `org.donasky:common-lib` JWT security). Permission codes live in its Flyway migrations `src/main/resources/db/migration/V{n}__*.sql` — none are seeded yet; grep the migrations once they exist. Each `INSERT INTO permission (...)` binds one URL pattern + HTTP method to a permission code:

```sql
INSERT INTO permission (code, url_pattern, method, description) VALUES
    ('REPORT_CREATE', '/api/v1/reports',   'POST', 'Create new report'),
    ('REPORT_VIEW',   '/api/v1/reports/*', 'GET',  'View report detail'),
    ...
```

common-lib's security layer (fed by the BE's `PermissionProvider` / `RoleProvider` beans; public URLs whitelisted by `UrlPermitMatcher` in `config/AppSecurityConfig.java`) matches each incoming request against this table — no `@PreAuthorize` annotations on controllers. Reading a `*Controller.java` to sync a contract, you will see **zero** permission info; permission for a route is found by matching `(path, method)` against the seed.

- **Naming (BE):** `RESOURCE_ACTION` in UPPER_SNAKE — `REPORT_CREATE`, `DISTRICT_VIEW`, `INDICATOR_UPDATE`, `ADMIN_USER_LOCK`.
- **Wildcards:** `*` matches one path segment. Treat `:xxxId` in a contract path as `*` when looking up the seed pattern.
- **`*` method** means "any HTTP verb" (typically used by a `FULL_PERMISSION` catch-all for ADMIN).

### FE registry mirrors BE seed exactly

`packages/zod-schemas/src/permission/*.ts` is the TypeScript registry — one file per domain. The FE may **never** invent a permission code that isn't in the seed, and the seed is **never** invented FE-side. The `permissions: Set<Permission>` on `CurrentUserDTO` is derived from `roleCodes` via `roleToPermissions(role)` at profile-fetch time.

Structure:

```typescript
// packages/zod-schemas/src/permission/report-permission.ts
export const ALL_REPORT_PERMISSIONS = [
  'REPORT_LIST', 'REPORT_CREATE', 'REPORT_VIEW', 'REPORT_UPDATE', /* … */
] as const;
export type ReportPermission = (typeof ALL_REPORT_PERMISSIONS)[number];

// Mirrors INSERT INTO role_permission grants in the BE migrations.
export const ROLE_REPORT_PERMISSIONS: Record<UserRole, ReportPermission[]> = {
  ADMIN: [...ALL_REPORT_PERMISSIONS],  // FULL_PERMISSION catch-all
  // one entry per role in the BE seed
};
```

`UserRole` in `packages/zod-schemas/src/entity/user-schema.ts` must match the BE role enum / role seed exactly. The role model is defined by the BE — never add, rename, or reinterpret a role FE-side.

### Consuming a global permission

```tsx
// ✅ Component — hide a button when the user lacks the permission
<PermissionCheck permission="REPORT_CREATE">
  <Button>Tạo báo cáo</Button>
</PermissionCheck>

// ✅ Imperative — when you need the boolean for branching/disabled state
const { hasPermission, isLoading } = useCurrentUser();
if (isLoading) return null;
const canCreate = hasPermission('REPORT_CREATE');

// ✅ Route guard — block the whole route, redirect to /error/403
export const Route = createFileRoute('/admin/users/')({
  beforeLoad: () => requirePermission('ADMIN_USER_LIST'),
});

// ✅ Compose Layer 1 with a boolean flag in a single check
<PermissionCheck permission="INDICATOR_CREATE" when={isProvinceSelected}>
  <Button>Thêm chỉ tiêu</Button>
</PermissionCheck>
```

`useCurrentUser()` is the canonical hook for everything in Layer 1. Do **not** call `currentUserRepository().useQuery()` directly in components; always go through the hook.

```ts
// hook surface (apps/frontend/src/hooks/use-current-user.ts)
const {
  user,            // full CurrentUserDTO — only read for display/identity
  roleCodes,       // display-only (badge in user menu)
  hasPermission,   // (code) => boolean — the ONLY auth function in Layer 1
  isLoading,       // true while profile query is in flight
  isError,
} = useCurrentUser();
```

### Never use `roleCodes` for authorization

`roleCodes` is **display-only**. All Layer 1 authorization goes through `hasPermission(code)`.

```tsx
// ❌ Bad — role-based branching
if (user.roleCodes.includes('ADMIN')) showAdminMenu();
if (user.roleCodes.includes('MANAGER')) { ... }

// ✅ Good — permission-based branching
const { hasPermission } = useCurrentUser();
if (hasPermission('ADMIN_USER_LIST')) showAdminMenu();
```

### Documented exceptions (the only ones)

Only these may read `roleCodes` directly. Each must be documented in the file where it appears and not extended:

1. **Workspace entry redirect** (e.g. the authenticated index route) — "which workspace to land in," not "which action to allow," so a role check is intentional.
2. **Display badge** (user menu, profile page header) — showing the user's role string. Display only.
3. **ADMIN super-role bypass** in an ownership check — see Layer 2.

Any other read of `roleCodes` is a bug.

### Choosing the gating mechanism (Layer 1)

| Scope | Mechanism | When to use |
|-------|-----------|-------------|
| Entire page / route | `requirePermission` in `beforeLoad` | Missing permission → redirect to `/error/403` before any render |
| Section, panel, or action button | `<PermissionCheck permission="...">` | Missing permission → hide UI element, user stays on page |
| Imperative (disabled state, conditional branching) | `useCurrentUser().hasPermission(...)` | Need a boolean inline |

**Rule of thumb:** missing permission should send the user away → use `requirePermission` in the route's `beforeLoad`. Missing permission should just hide a UI element → use `<PermissionCheck>`.

---

## Layer 2 — Resource ownership

Use the shared `useResourceOwnership(resource)` hook (component) and `requireOwnership(loader)` guard (route) — `apps/frontend/src/hooks/use-resource-ownership.ts` and `repositories/currentUser.repository.ts` (port from ELP-fe). They encode the one correct predicate: **ownership + ADMIN super-role**, mirroring a BE `isAdminOrOwner(createdBy)` check. Per-domain wrappers (`useReportPermissions`, `requireReportOwnership`) just add naming.

```tsx
// ✅ Component — owner-or-ADMIN management surface
const { canManage } = useResourceOwnership(report); // = isOwner || isAdmin
{canManage && <DropdownMenuItem onClick={onEdit}>Chỉnh sửa</DropdownMenuItem>}

// ✅ Route guard — block a manage/edit route for non-owners (ADMIN bypass built in)
beforeLoad: ({ params }) => requireReportOwnership(Number(params.reportId)),
```

If you write the predicate by hand (rare), the ADMIN bypass is `roleCodes.includes(UserRole.ADMIN)`, **never** a content permission:

```tsx
// ✅ owner-or-ADMIN, by hand
const canManage =
  (report.createdBy != null && report.createdBy === currentUser.id) ||
  roleCodes.includes(UserRole.ADMIN);
```

Notes:

- `createdBy` (from common-lib `BaseEntity`) is `entityId.nullable()` in the schema — always include a `!= null` check before comparing.
- For ADMIN bypass, read `roleCodes.includes(UserRole.ADMIN)` (the sanctioned super-role read). **Do NOT** OR with `permissions.has('<RESOURCE>_UPDATE')` — see the anti-pattern below.

---

## Scoped roles (only if the BE introduces them)

If the BE adds a per-scope role (e.g. a user's role within a specific province or district, returned on the scoped resource as `currentUserRole`), treat it as its own layer: expose it through a dedicated hook + guard pair (`useXxxRole(resource)` / `requireXxxRole(id, allowed)`) that reads the value BE returns, and never derive in-scope decisions from Layer 1 permissions or `roleCodes`. Mirror the BE service-layer matrix exactly; any FE rule stricter than BE is UX, not security, and must be documented as such.

---

## Anti-pattern: `ADMIN-bypass-via-content-permission`

The most common auth bug in this stack. When gating a **Layer 2** (own this resource) or scoped decision, do NOT use a content permission code as the "ADMIN bypass" — when the seed grants regular users `X_UPDATE` / `X_DELETE` (so they can manage resources they *own*), ADMIN and regular users BOTH hold that code. So `|| hasPermission('X_UPDATE')` fires for **every such user**, not just ADMIN.

```tsx
// ❌ WRONG — every regular user holding REPORT_UPDATE passes
const canManage =
  (report.createdBy != null && report.createdBy === user.id) ||
  hasPermission('REPORT_UPDATE');

// ❌ WRONG — same trap on a route guard; requirePermission('X_UPDATE') is a no-op
//             gate because every such user passes it
beforeLoad: () => requirePermission('REPORT_UPDATE'),
```

The only faithful mirror of BE `isAdminOrOwner(resource.createdBy)` is **ownership + the ADMIN super-role read from `roleCodes`**:

```tsx
// ✅ RIGHT — component / inline (or just use useResourceOwnership)
const { user, roleCodes } = useCurrentUser();
const canManage =
  (report.createdBy != null && report.createdBy === user.id) ||
  roleCodes.includes(UserRole.ADMIN);

// ✅ RIGHT — route guard (ADMIN bypass, else createdBy === id)
beforeLoad: ({ params }) => requireReportOwnership(Number(params.reportId)),
```

Prefer the shared `useResourceOwnership(resource)` hook and `requireOwnership(loader)` guard over hand-rolling the predicate per domain.

**Grep before merge:** `hasPermission("…_UPDATE")` / `permissions.has("…_DELETE")` / `requirePermission("…_UPDATE")` used as an ownership gate is always this bug. **Inverse failure also exists:** an ownership-only gate (`{isOwner && …}`) that OMITS the ADMIN bypass is over-restrictive (ADMIN loses actions BE permits) — OR-in `roleCodes.includes(UserRole.ADMIN)`, never `hasPermission('X_UPDATE')`.

---

## Adding a new gate

**BE first, FE second.**

1. **Seed the permission in BE.** Add a row to `INSERT INTO permission (...)` and the corresponding `role_permission` grants in a new Flyway migration in `../dona-province-dashboard-be/src/main/resources/db/migration/`.
2. **Sync the FE registry.** Run `/sync-contract-from-backend` for the affected domain (or rerun the permission-sync sub-step) so the code lands in `packages/zod-schemas/src/permission/<domain>-permission.ts` and the `Permission` union.
3. **Consume it** via `<PermissionCheck>`, `requirePermission`, `useCurrentUser().hasPermission(...)`, or `NavItem.permission`.

For ownership-only actions, no BE migration is needed if the BE service layer already enforces `isAdminOrOwner` — just consume `useResourceOwnership` / `requireOwnership`.

---

## Verifying registry ↔ seed parity

Before merging anything that touches `packages/zod-schemas/src/permission/`:

1. Diff the union of `ALL_*_PERMISSIONS` arrays against the union of `code` values in `INSERT INTO permission (...)` across **all** `V*` migrations.
2. Diff each `ROLE_*_PERMISSIONS[role]` array against the corresponding `INSERT INTO role_permission` block.
3. Mismatch → BE seed wins; update the FE registry to match.

---

## Known limitations

- **Permission staleness:** `permissions: Set<Permission>` is derived from `roleCodes` at profile-fetch time. A role grant/revoke takes effect on the next profile refetch (typically the next full page navigation), not instantly. This is acceptable for a session-scoped permission model.
- **FE UX vs BE enforcement:** any FE gate stricter than the BE check is UX only. A user calling the API directly gets whatever the BE allows — security lives in the BE.
