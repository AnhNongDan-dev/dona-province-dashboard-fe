---
description: Rules for all .tsx files — cache invalidation + navigation after state-changing API calls (POST/PUT/PATCH/DELETE)
paths:
  - "**/*.tsx"
---

# Mutation Invalidation Rules

After any API call that changes server state (POST / PUT / PATCH / DELETE), the UI must reconcile caches so the user never sees stale data. The exact strategy depends on where the user is and what happened to the resource.

Repositories expose `invalidate()` per-instance and `invalidateAllSearchXxxQueries()` for list/search caches — see `apps/frontend/src/repositories/-factory.ts`. Always reuse these; never call `queryClient.invalidateQueries` inline.

## On a detail page

The page loader (`createFileRoute(...).loader`) calls `throw404Error()` when the detail repository returns null (the `throw404Error` helper is not ported yet — port it from ELP-fe). Re-triggering the loader is how we get the 404 for free.

### Resource is deleted / no longer visible to the user

Trigger a full router invalidation so the loader runs again and naturally throws 404.

```tsx
// Good — inside a detail page component
const router = useRouter();

async function onDelete() {
  const res = await clientAPI.Report.deleteReport({ params: { id } });
  if (!res.success) return toast.error(res.message, { id: res.errorCode });

  invalidateAllSearchReportsQueries();          // sibling lists (other pages) — fire-and-forget
  await router.invalidate();                    // await: this page's loader must re-run → throw404Error
}
```

- Do **not** manually `navigate({ to: "/error/404" })` — let the loader decide.
- Do **not** call only `xxxDetailRepository(id).invalidate()` and stay on the page; the component will render stale data until remount.

### Resource is updated (still visible)

Invalidate the detail repository so `useQuery` refetches. Do **not** trigger the router loader (avoids a visible page transition / skeleton).

```tsx
// Good
await xxxDetailRepository(id).invalidate();
```

If the mutation also affects lists the user might navigate back to, also call the relevant `invalidateAllSearchXxxQueries()`.

## On a list / table page

### Plain list repository (non-search)

Invalidate that list's repository — its query key covers all entries.

```tsx
await xxxListRepository().invalidate();
```

### Search data table (paginated + filtered)

Invalidate **all pages** of the table, not just the current page, because any mutation can shift row positions across pages. Every search repository must expose an `invalidateAllSearchXxxQueries()` helper that invalidates by the shared root key (see the **repository-pattern** skill for the shape).

```tsx
// Good
await invalidateAllSearchDistrictsQueries();

// Bad — only invalidates the current page's query key
await searchDistrictsRepository(currentParams).invalidate();
```

If a new `searchXxx.repository.ts` is missing the `invalidateAllSearchXxxQueries` helper, add it before wiring up the mutation handler.

## Summary

| Location | Mutation type | Action |
|----------|---------------|--------|
| Detail page | Delete (resource gone) | `router.invalidate()` → loader throws 404 |
| Detail page | Update | `xxxDetailRepository(id).invalidate()` |
| List page | Any | `xxxListRepository().invalidate()` |
| Search table | Any | `invalidateAllSearchXxxQueries()` (all pages) |

In every case, also invalidate sibling caches the mutation can affect (e.g. a list shown on the parent route).

## Awaiting vs. fire-and-forget

`invalidateQueries` marks the cache stale **synchronously**; the promise it returns resolves only after the background refetch of *active* queries finishes. The staleness mark — not the refetch — is what reconciles the cache, and it's already applied when the call returns.

- **`await` only when the next line depends on the refetch.** The canonical case is `await router.invalidate()` so a route loader re-runs and throws 404 after a delete. Here you stay on the page and need the loader to have re-run.
- **Fire-and-forget when invalidating a list on another page** (a create form that redirects, a row action that routes elsewhere). Awaiting it before `navigate()` delays navigation by a full round-trip for data the user isn't viewing — that page refetches its stale list on mount anyway.

```tsx
// ✅ Navigating away — don't await; navigation is instant
onSuccess: (data, payload) => {
  invalidateAllSearchIndicatorsQueries();
  if (provinceId != null) invalidateAllSearchProvinceIndicatorsQueries(provinceId);
  navigate({ to: '/app/indicators/$indicatorId', params: { indicatorId: String(data.id) } });
},

// ✅ Staying & deleting — await, because router.invalidate() must re-run the loader
async function onDelete() {
  const res = await clientAPI.X.delete({ params: { id } });
  if (!res.success) return toast.error(res.message);
  invalidateAllSearchXxxQueries();   // sibling list on another page — fire-and-forget
  await router.invalidate();         // this page's loader must re-run → throw 404
}
```
