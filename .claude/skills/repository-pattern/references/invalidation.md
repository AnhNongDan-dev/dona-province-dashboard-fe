# Cache invalidation

Invalidation marks queries as stale; React Query refetches the **active** ones automatically and refetches the rest on next mount. There are two granularities — pick by the scope of the change.

## The two helpers

| Helper | Scope | When |
|--------|-------|------|
| `repo(params).invalidate()` | One specific query (one cache entry). | Updating a single detail, or when only one search variant could be affected. |
| `invalidateAll{Verb}{Resource}Queries()` | **All** queries whose key starts with the helper's prefix. | After CRUD on a resource — covers every active table page and every filter combo. |

```typescript
// In the search repo file — always ship this alongside the repo
export const invalidateAllSearchResourcesQueries = () =>
  queryClient.invalidateQueries({ queryKey: ['resource'] });
```

## The mental rule

> "Did anything about this resource change on the server?" → **invalidate all**.
> "Did exactly one cached query become stale and I know which?" → **`.invalidate()` it**.

In practice, **default to `invalidateAll{Verb}{Resource}Queries()`** after any mutation. It's cheap (only marks stale; only active queries refetch) and immune to subtle bugs where a different filter combo also needed refreshing.

## Does invalidating the search also refresh the detail?

**Only if the helper's prefix is an ancestor of the detail key.** React Query matches by prefix — so this depends on how broad the search helper's key is. Two real cases in this codebase:

```
searchResourcesRepository       key: ['resource', ...query]
invalidateAllSearchResourcesQueries  → invalidateQueries(['resource'])
resourceDetailRepository        key: ['resource', 'detail', id]
  →  ['resource'] IS a prefix of ['resource', 'detail', id]  ✓  detail IS refreshed
```

```
searchUsersRepository           key: ['user', 'list', ...query]
invalidateAllSearchUsersQueries      → invalidateQueries(['user', 'list'])
userDetailRepository            key: ['user', 'detail', id]
  →  ['user', 'list'] is NOT a prefix of ['user', 'detail', id]  ✗  detail is NOT refreshed
```

So **check the helper's key before relying on it to cover detail.** If the search helper invalidates a 2-segment key (`['user', 'list']`), call the detail invalidate explicitly:

```typescript
invalidateAllSearchUsersQueries();        // refreshes user tables
invalidateAllUserDetailQueries();         // refreshes any open user detail  (key: ['user','detail'])
// or, for one specific user:
userDetailRepository({ userId }).invalidate();
```

When designing a new resource, the simplest setup is to make the search helper invalidate the **bare root** (`['resource']`) so it naturally covers `['resource', 'detail', id]` too — one call, both refreshed.

## Don't `await` invalidation of off-screen lists — fire-and-forget

`invalidateQueries` does two things: it **synchronously** marks matching cache entries stale, then returns a promise that resolves only when every *active* refetch it triggered has **finished**. The staleness mark is what you actually need — it's already applied by the time the call returns. Awaiting the promise just blocks your handler on a background refetch.

So when the list you're invalidating lives on **another page** (the user is about to navigate away — a create form that redirects, a row action that routes elsewhere), do **not** await it. Awaiting delays the navigation by a full network round-trip for data the user isn't even looking at yet; when they land on that page, React Query refetches the stale entry on mount anyway.

```typescript
// ✅ Navigating away — fire-and-forget. Navigation is instant; the other page
//    refetches its stale list on mount.
onSuccess: (data, payload) => {
  toast.success('Created');
  invalidateAllSearchMyReportsQueries();                          // my-reports list (other page)
  if (provinceId != null) invalidateAllSearchProvinceReportsQueries(provinceId); // province table (other page)
  navigate({ to: '/app/reports/$reportId', params: { reportId: String(data.id) } });
},

// ❌ Awaiting blocks navigation on a background refetch of a list the user isn't viewing
onSuccess: async (data, payload) => {
  await Promise.all([invalidateAllSearchMyReportsQueries(), invalidateAllSearchProvinceReportsQueries(provinceId)]);
  navigate({ ... });   // ← delayed by a round-trip, for nothing
},
```

**When awaiting IS correct:** you stay on the current page and the very next line depends on the refetch having completed — most often `await router.invalidate()` so a route loader re-runs and throws 404 after a delete (see the delete-on-detail-page case). The test is "does my next statement need the fresh data?" — staying-and-deleting: yes; navigating-away: no.

## When to use specific `.invalidate()`

- **Polling**: a button that refreshes the current view only.
- **Targeted detail refresh**: after editing one item, if you specifically *don't* want to disturb other open queries.
- **Background prefetch**: invalidate stale tab data after the user returns from another tab.

## Parameterized-list helpers take an optional scope

A `find*` repo's helper can invalidate one parent's list or all of them:

```typescript
invalidateAllFindProvinceDistrictsQueries(provinceId);  // just this province's districts
invalidateAllFindProvinceDistrictsQueries();            // every province's districts
```

Pass the scope ID after a mutation that affects one parent; omit it after a change that could affect any.

## Examples

### After create / update / delete in a table

```typescript
openZodFormDrawer({
  // ...
  contractAPI: ({ unit, ...body }) =>
    clientAPI.User.updateUser({ body: { ...body, unitId: unit.data.id }, params: { userId: user.id } }),
  onSuccess() {
    toast.success('Updated successfully');
    invalidateAllSearchUsersQueries();
    invalidateAllUserDetailQueries();   // user's search helper keys ['user','list'] — detail needs its own
    ZodFormDrawerEvent.close();
  },
});
```

### Optimistic UI

For instant feedback (e.g. toggle a star), `updateCache` then invalidate to reconcile:

```typescript
searchResourcesRepository(search).updateCache((old) => ({
  ...old,
  items: old.items.map((r) => (r.id === id ? { ...r, starred: true } : r)),
}));
const res = await clientAPI.Resource.star({ params: { resourceId: id } });
if (res.success) invalidateAllSearchResourcesQueries();  // reconcile from server
else searchResourcesRepository(search).invalidate();     // rollback by refetching
```

## QueryKey hierarchy (why "all" works)

React Query matches by **prefix**. `invalidateQueries({ queryKey: ['resource'] })` invalidates anything whose key starts with `['resource']`:

```
['resource']                                    ✓
['resource', 'detail', 42]                      ✓
['resource', { page: 0, size: 10 }]              ✓
['resource', 'daily-booked-slots', '2026-05-22'] ✓
['user']                                         ✗  (different root)
```

This is **why a resource's repos share a root segment**. Where the search helper keys the bare root, `invalidateAll*` covers both list and detail; where it keys a 2-segment prefix, it doesn't — see the section above.

## Don'ts

- **Don't update component state to reflect a server change.** Always invalidate, let React Query re-render.
- **Don't invalidate before the API succeeds.** Only in `onSuccess`. Otherwise you trigger a refetch that races your mutation.
- **Don't ship one invalidate helper per CRUD action** (`invalidateUserOnCreate`, …). One helper per resource (plus the detail helper).
- **Don't reach into `queryClient` directly from components.** The helper lives next to the repo for a reason — co-location, single source of truth.
- **Don't `await` invalidation of a list on another page.** The staleness mark is synchronous; the promise only resolves after a background refetch the user can't see. Awaiting it before a `navigate()` delays navigation for nothing — fire-and-forget instead (see "Don't `await` invalidation of off-screen lists").

> **Project-specific paths** — relocate when porting (see SKILL.md → Porting)
>
> | Symbol | This project's location |
> |--------|-------------------------|
> | `queryClient` | `@/config/query-client.config` |
> | `clientAPI` | `@/config/clientAPI.config` |
