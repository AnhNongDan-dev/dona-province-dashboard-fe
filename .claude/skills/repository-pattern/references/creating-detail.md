# Creating a Detail repo (one resource by ID)

For endpoints that fetch **one resource by ID**: detail pages, edit-form preloads, etc.

**References**: none in this repo yet — the first repo of this type becomes the reference. (The skeleton only has `-factory.ts` + `-paging.ts`.)

## When to use

- Endpoint shape is `GET /resource/:id` (one or more path IDs).
- Caller has the ID(s) of a single resource.
- Result is the full resource (not a paginated list).

## Template

```typescript
import type { xContract } from '@repo/zod-schemas/src/api-contract/x.contract';
import type { ExtractApiContract } from '@/@type/helper';
import { clientAPI } from '@/config/clientAPI.config';
import { createQueryRepository } from '@/repositories/-factory';
import { throw404Error } from '@/routes/error/404';

type ApiContract = ExtractApiContract<typeof xContract.getXById>;
// `{ data }` envelope — see SKILL.md → Porting.
type ResponseData = ApiContract['responseData']['data'];

const mapToDTO = (data: ResponseData) => ({
  ...data,
  // computed fields, sorting, etc.
});
export type XDetailDTO = ReturnType<typeof mapToDTO>;

const defaultData: XDetailDTO = {
  id: 0,
  // ...all required fields with sensible empties (compiler enforces this)
};

export const xDetailRepository = createQueryRepository<XDetailDTO, number>({
  queryKey: (xId) => ['x', 'detail', xId],
  queryFn: async (xId) => {
    if (!xId) return defaultData;       // guard for 0/undefined (e.g. create flow reusing the form)
    const res = await clientAPI.X.getXById({ params: { xId } });
    if (res.success) return mapToDTO(res.data);
    return throw404Error();             // NOT a bare throw Error()
  },
  defaultData,
});
```

## Param shape: bare ID vs. object

Both are common — pick by how many IDs the endpoint needs.

| Shape | Use when | Example |
|-------|----------|---------|
| Bare `number` | Single path ID | `createQueryRepository<DistrictDetailDTO, number>` — `districtDetail.repository.ts` |
| Object `{ ... }` | Multiple IDs, or a named ID for clarity | `createQueryRepository<UserDetailDTO, { userId: number }>` — `userDetail.repository.ts`; `{ districtId, indicatorId }` — `districtIndicatorDetail.repository.ts` |

With an object param, destructure in both `queryKey` and `queryFn`:

```typescript
export const userDetailRepository = createQueryRepository<UserDetailDTO, { userId: number }>({
  queryKey: ({ userId }) => ['user', 'detail', userId],
  queryFn: async ({ userId }) => { /* ... */ },
  defaultData,
});
```

## Two equivalent ways to thread the ID

The factory is `createQueryRepository<TData, TParams = void>`, so there are two interchangeable shapes for a single-ID detail repo — the **call site is identical** (`xDetailRepository(id)`) either way:

**(a) `TParams` generic** — the id flows through `queryKey(params)` / `queryFn(params)` (shown above). Skill-canonical, fewest moving parts.

**(b) Closure over the id + IIFE** — wrap the factory in an arrow that captures `id`, and immediately call the returned builder with `()` (because `TParams` is now `void`):

```typescript
export const reportDetailRepository = (reportId: number) =>
  createQueryRepository<ReportDetailDTO>({           // TParams omitted → void
    queryKey: () => ['report', 'detail', reportId],  // reportId from the closure
    queryFn: async () => {
      if (!reportId) return defaultData;
      const res = await clientAPI.Report.getReportById({ params: { reportId } });
      if (res.success) return mapToDTO(res.data);
      if (res.errorCode === ErrorCode.ResourcesNotFound) throwGoneError();
      throw new Error(`Failed to fetch report ${reportId}`, { cause: res });
    },
    defaultData,
  })();                                          // ← trailing () instantiates immediately
```

Prefer (b) when the `queryFn` or `defaultData` benefits from closing over the id (interpolating it into an error message, branching, etc.) — it reads top-to-bottom with the id in lexical scope. This project's convention (inherited from ELP-fe) is (b) for all detail repos. Either is correct; don't mix them within one repo.

## Key points

- **QueryKey hierarchy**: `['x', 'detail', id]` — the leading `'x'` matches the search repo's root. Whether `invalidateAllSearchXQueries()` *also* hits this detail entry depends on the search helper's key — see [invalidation.md](invalidation.md).
- **`if (!id) return defaultData`** — protects against components that conditionally render with `id = 0`.
- **Error handling — two valid strategies**:
  - `throw404Error()` — for true detail pages where a missing resource should show the 404 route (`districtDetail`, `reportDetail`).
  - `throw Error('...', { cause: res })` — when the detail feeds a panel/section and the surrounding UI handles the error inline rather than navigating away (`userDetail`).
- **403**: if the API distinguishes forbidden from not-found, branch on `res.errorCode` and `throw redirect({ to: '/error/403', ... })` before falling through to 404.

## Usage

```typescript
// Route — detail repos ARE primed in the loader (the page should paint with real data)
export const Route = createFileRoute('/app/districts/$districtId/')({
  loader: ({ params }) => districtDetailRepository(Number(params.districtId)).loader(),
  component: DistrictDetailPage,
});

// Component — read via useQuery, never Route.useLoaderData()
function DistrictDetailPage() {
  const { districtId } = Route.useParams();
  const { data: district } = districtDetailRepository(Number(districtId)).useQuery();
  return <h1>{district.name}</h1>;
}

// After updating this item
districtDetailRepository(districtId).invalidate();
```

> **Project-specific paths** — relocate when porting (see SKILL.md → Porting)
>
> | Symbol | This project's location |
> |--------|-------------------------|
> | `ExtractApiContract` | `@/@type/helper` |
> | `clientAPI` | `@/config/clientAPI.config` |
> | `createQueryRepository` | `@/repositories/-factory` |
> | `throw404Error` | `@/routes/error/404` (not ported yet — from `ELP-fe/apps/frontend/src/routes/error/404.tsx`) |
> | 403 redirect | `/error/403` route path |
