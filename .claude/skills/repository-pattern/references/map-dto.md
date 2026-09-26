# mapToDTO patterns

`mapToDTO` is the **only** place where raw API data is reshaped. Doing transformations here (and not in components) means:

- The DTO type is derived once via `ReturnType<typeof mapToDTO>` and flows through every consumer.
- Components stay declarative — no `useMemo` chains for shape fixes.
- DEV mock fallback can reuse `mapToDTO` and stay structurally identical to a real response.

## Rule of thumb

If the same field is computed in two components, push it into `mapToDTO`.

## Common patterns

### 1. Pass-through (no transform yet)

Even when there's nothing to compute, write the function. It locks in the DTO type and gives you a hook for later — most detail repos (`districtDetail`, `reportDetail`) are exactly this:

```typescript
const mapToDTO = (data: ResponseData) => ({ ...data });
export type DistrictDetailDTO = ReturnType<typeof mapToDTO>;
```

### 2. Computed fields from related data

`currentUser.repository.ts` derives a `permissions` `Set` from the user's roles so every consumer can do O(1) permission checks:

```typescript
const mapToDTO = (data: ResponseData, permissions: Set<Permission>) => ({
  ...data,
  permissions,                       // Set<Permission> — derived from roles
});
```

Returning a `Set` (vs an array) is fine — it's a TS-private DTO, the network shape stays JSON. Note `mapToDTO` may take extra arguments beyond the raw response when the computed value depends on data assembled in `queryFn` (here, permissions resolved from a separate roles call).

### 3. Flatten arrays into single fields

When the API returns a one-element array but the UI only ever cares about the first, flatten it **inside the per-item transform** (search repos) or directly (detail repos):

```typescript
// search repo — the per-item transform passed to mapPaging
mapPaging(envelope, ({ roles: [role], ...item }) => ({ ...item, role }))
```

Now `user.role` works directly, no `user.roles[0]` everywhere.

### 4. Sort/order list fields

When display order is deterministic, sort once in `mapToDTO`. `findProvinceDistricts.repository.ts` sorts districts by `sortOrder` so every consumer gets them ordered:

```typescript
mapPaging(
  { ...envelope, items: [...data.data].sort((a, b) => a.sortOrder - b.sortOrder) },
  (item) => ({ ...item }),
)
```

Always copy first (`[...arr]`) — never sort the source array in place.

### 5. Search results — transform per-item via `mapPaging`

Search DTOs **must** route the envelope through `mapPaging` — never spread it (`{ items, ...data }`), which leaks backend field names into the DTO type. Pass the per-item transform as the second argument:

```typescript
const mapToDTO = (data: ResponseData) =>
  mapPaging(
    {
      pageIndex: data.paging.page,
      pageSize: data.paging.size,
      total: data.paging.totalElements,
      items: data.data,
    },
    (item) => ({ ...item /* per-item compute */ }),
  );
```

`mapPaging` produces the canonical `{ pageIndex, pageSize, total, hasNext, items }` envelope. See [creating-list-search.md](creating-list-search.md) for the full search-repo recipe.

## DTO type export

Always export the DTO type so consumers (components, helpers, async-search options) can type their props without re-deriving:

```typescript
export type DistrictDetailDTO = ReturnType<typeof mapToDTO>;
```

For search repos, also export the **query** type so callers can type form state and route search:

```typescript
export type SearchResourcesQuery = ApiContract['query'];
export type SearchResourcesResult = ReturnType<typeof mapToDTO>;
```

## What NOT to do in mapToDTO

- **Don't fetch.** Pure transformation only. If you need data from another endpoint, do it in the consumer or chain repos.
- **Don't format for display** (currency strings, formatted dates, "X days ago"). Keep DTO data; format in components/`DateDisplay`.
- **Don't drop fields.** Spread `...data` first, then add. If you remove fields the DTO type silently narrows and consumers may break later.
- **Don't throw.** Throwing belongs in `queryFn`. `mapToDTO` is called on every cache read and every mock — throwing here is hard to debug.
