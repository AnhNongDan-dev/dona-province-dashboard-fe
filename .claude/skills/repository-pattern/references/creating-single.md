# Creating a Single repo (no params)

For endpoints that fetch **one global value** with no parameters: current user, app config, feature flags, etc.

**Reference**: none in this repo yet (no auth/current-user wiring). Port `ELP-fe/apps/frontend/src/repositories/currentUser.repository.ts` as the model.

## When to use

- Endpoint takes no inputs.
- Result is the same for the whole session (per user).
- You want it cached forever and only invalidated on explicit events (login, logout, profile update).

## Template

```typescript
import type { xContract } from '@repo/zod-schemas/src/api-contract/x.contract';
import { redirect } from '@tanstack/react-router';
import type { ExtractApiContract } from '@/@type/helper';
import { clientAPI } from '@/config/clientAPI.config';
import { createQueryRepository } from '@/repositories/-factory';

type ApiContract = ExtractApiContract<typeof xContract.getX>;
// This project's backend wraps the payload in `{ data }` — see SKILL.md → Porting.
type ResponseData = ApiContract['responseData']['data'];

const mapToDTO = (data: ResponseData) => ({
  ...data,
  // computed fields here
});
export type XDTO = ReturnType<typeof mapToDTO>;

const defaultData: XDTO = mapToDTO({ /* mock raw response */ });

export const xRepository = createQueryRepository<XDTO>({
  queryKey: () => ['x'],            // STATIC — no params
  queryFn: async () => {
    const res = await clientAPI.X.getX();
    if (res.success) return mapToDTO(res.data);
    // Single repos typically redirect on failure (auth-critical).
    throw redirect({ to: '/auth/sign-out', search: { relativePath: window.location.pathname } });
  },
  defaultData,
});
```

## Key points

- **No `TParams` generic** → `createQueryRepository<XDTO>`. The factory defaults `TParams` to `void`, so the returned repo is called as `xRepository()` with no arguments.
- **Static queryKey** — a single root segment (e.g. `['user']`).
- **`defaultData` built via `mapToDTO`** — guarantees the shape stays in sync if you add computed fields.
- **Error → redirect**, not `throw Error`. These repos back auth/session; a thrown error surfaces a generic error screen instead of a meaningful redirect. `currentUser.repository.ts` branches on `errorCode` first (`UserAlreadyLocked → throwLockedError()`, `ServiceUnavailable → throw503Error()`) before falling through to sign-out.

## Companion helpers

Single repos often pair with imperative guards that read from the cache:

```typescript
export const requirePermission = async (permission: Permission) => {
  const { permissions } = await currentUserRepository().loader();
  if (!permissions.has(permission))
    throw redirect({ to: '/error/403', mask: { to: '.', unmaskOnReload: true }, replace: true });
};
```

Use `.loader()` here (not `.get()`) so the cache is primed if the repo hasn't been fetched yet.

## Usage

```typescript
// Component
const { data: user } = currentUserRepository().useQuery();

// Loader / guard
const user = await currentUserRepository().loader();

// Force refresh after profile update
currentUserRepository().invalidate();
```

> **Project-specific paths** — relocate when porting (see SKILL.md → Porting)
>
> | Symbol | This project's location |
> |--------|-------------------------|
> | `ExtractApiContract` | `@/@type/helper` |
> | `clientAPI` | `@/config/clientAPI.config` |
> | `createQueryRepository` | `@/repositories/-factory` |
> | Sign-out / error redirects | `/auth/sign-out`, `/error/403` route paths |
> | `throwLockedError`, `throw503Error` | `@/routes/error/locked`, `@/routes/error/503` |
