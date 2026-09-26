# Async-search options (wrapping a search repo for AsyncSearchCombobox)

`AsyncSearchCombobox` is the project's standard async dropdown. It calls an `onSearch` function with the user's typed query and renders the returned options. To avoid duplicating fetch logic, every entity that's selectable in a dropdown gets a small **search-options** module that wraps its existing search repo.

## File location & naming

Live in [apps/frontend/src/repositories/async-search-options/](../../../../apps/frontend/src/repositories/async-search-options/). One file per entity:

```
async-search-options/
├── resource-search-options.ts
├── province-search-options.ts
├── district-search-options.ts
├── indicator-search-options.ts
├── indicator-group-search-options.ts
└── report-search-options.ts
```

Each file exports two things:

- `generate{Entity}Key(id)` — stable key string for the option (e.g. `'resource-42'`).
- `{entity}SearchOptionsFn(search)` — the `onSearch` handler.

## Prerequisites

Before creating a search-options file:

- [ ] A search repo exists (`search{Entity}Repository`).
- [ ] The repo exports its query type (`Search{Entity}Query`).
- [ ] The entity has a clearly readable display field (`name`, `fullName`, `title`, ...).

## Template

**Reference**: [resource-search-options.ts](../../../../apps/frontend/src/repositories/async-search-options/resource-search-options.ts)

```typescript
import type { AsyncSearchComboboxOption } from '@/components/common/async-search-combobox';
import { type SearchXsQuery, searchXsRepository } from '../searchXs.repository';

export const generateXKey = (xId: number): string => `x-${xId.toString()}`;

export const xSearchOptionsFn = async (search: Partial<SearchXsQuery>) => {
  // page/size are the CONTRACT's query field names — not the DTO's pageIndex/pageSize.
  const searchParams: SearchXsQuery = {
    page: 0,
    size: 20,                    // sensible dropdown page size
    ...search,                   // caller-supplied filters (typed query, scope, status…)
  };

  const res = await searchXsRepository(searchParams).loader();
  return res.items.map(
    (x) =>
      ({
        data: x,                 // full DTO — `onCommit` gets it back
        key: generateXKey(x.id), // stable identifier
        label: x.name,           // display string
        secondary: x.code,       // optional — shown as a muted sub-label
      }) satisfies AsyncSearchComboboxOption,
  );
};
```

Notes:

- Use `.loader()` (not `.useQuery()`) — this is a one-shot fetch, not a subscription. It still benefits from the cache.
- Query params are the **contract's** field names (`page`, `size` in this project), not the DTO's `pageIndex`/`pageSize`. The type `SearchXsQuery = ApiContract['query']` enforces this — using the wrong names is a compile error.
- `Partial<SearchXsQuery>` lets callers pass extra filters (`{ status: 'ACTIVE' }`) on top of the typed query.
- `secondary` is optional — populate it when a code/subtitle helps disambiguate.

## UI examples

### Example 1 — Filter dropdown above a data table

```typescript
import { districtSearchOptionsFn, generateDistrictKey } from '@/repositories/async-search-options/district-search-options';
import AsyncSearchCombobox from '@/components/common/async-search-combobox';

function DistrictFilter({
  search,
  updateSearch,
}: {
  search: SearchReportsQuery;
  updateSearch: (part: Partial<SearchReportsQuery>) => void;
}) {
  return (
    <AsyncSearchCombobox
      defaultKeyOption={search.districtId ? generateDistrictKey(search.districtId) : undefined}
      placeholder='Chọn quận/huyện'
      onSearch={districtSearchOptionsFn}
      onCommit={async (option) => updateSearch({ districtId: option.data.id, page: 0 })}
      onClear={async () => updateSearch({ districtId: undefined })}
      className={cn(search.districtId && 'ring')}
    />
  );
}
```

`defaultKeyOption` reuses `generate{Entity}Key` so the dropdown shows the currently-selected entity on first paint without a second fetch. The `ring` class marks the filter as active.

### Example 2 — Inside a ZodForm modal

`openZodFormDrawer` accepts an async-search field where the value is the selected option object (with `data`, `key`, `label`). Wire the same `onSearch`:

```typescript
openZodFormDrawer({
  schema: createReportSchema,
  displayOptions: {
    district: {
      label: 'Quận/huyện',
      colSpan: 6,
      asyncSearch: { onSearch: districtSearchOptionsFn },
    },
  },
  contractAPI: ({ district, ...body }) =>
    clientAPI.Report.createReport({ body: { ...body, districtId: district.data.id } }),
  onSuccess() {
    toast.success('Created successfully');
    invalidateAllSearchReportsQueries();
    ZodFormDrawerEvent.close();
  },
});
```

The form value's `district.data.id` is the integer ID — note how the API call destructures `district` separately from the rest of the body.

### Example 3 — Scoped search

When the dropdown should only show items belonging to a parent, wrap the function with the scope baked in:

```typescript
const onSearchDistrictsForProvince = (search: Partial<SearchDistrictsQuery>) =>
  districtSearchOptionsFn({ ...search, provinceId });

<AsyncSearchCombobox onSearch={onSearchDistrictsForProvince} ... />
```

## Picking the label field

| Entity | Label field | `secondary` |
|--------|-------------|-------------|
| Resource | `name` | `code` |
| District | `name` | `code` |
| User | `fullName` | `phoneNumber` |
| Indicator | `name` | `unit` |

If two entities share names and there's no `secondary`, append a disambiguator at the call site (e.g. `${user.fullName} (${user.username})`) — but keep `mapToDTO` as the source of truth.

## Lifecycle / what happens on each keystroke

```
User types in combobox
        │
        ▼
onSearch(query) called   ── debounced by AsyncSearchCombobox itself
        │
        ▼
xSearchOptionsFn({ query })
        │
        ▼
searchXsRepository({ query, page: 0, size: 20 }).loader()
        │
        ▼  (cached entries hit instantly; fresh queries fetch)
{ items, total, ... }
        │
        ▼
items.map → AsyncSearchComboboxOption[]
        │
        ▼
Dropdown renders; user selects → onCommit(option) fires with full DTO in option.data
```

Because the underlying repo uses the same cache as the table, opening a dropdown for the same query that's currently shown in a table is free.

## When a search-options file is NOT the right tool

A few comboboxes call `clientAPI` directly instead of wrapping a search repo (`searchResourcesForCombobox.repository.tsx`, `searchUsersForCombobox.repository.tsx`). That pattern skips the repo cache and duplicates fetch logic — it exists for cases that also need a custom **render function** colocated with the fetch. **Prefer the `async-search-options/` pattern**: it reuses the cache and keeps one fetch definition per entity. Only reach for a direct-`clientAPI` combobox module when you have a concrete reason the repo wrapper can't serve.

> **Project-specific paths** — relocate when porting (see SKILL.md → Porting)
>
> | Symbol | This project's location |
> |--------|-------------------------|
> | `AsyncSearchCombobox`, `AsyncSearchComboboxOption` | `@/components/common/async-search-combobox` |
> | `clientAPI` | `@/config/clientAPI.config` |
> | `openZodFormDrawer` / `ZodFormDrawerEvent` | the project's imperative ZodForm dialog API |
> | Search-query field names | the contract's `query` schema (here `page`/`size`) |
