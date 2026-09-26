# URL Sync & Debouncing

Every filter change updates the URL. Reloading the page, sharing the URL, clicking browser Back — everything stays coherent because the URL **is** the single source of truth for "what is this table showing".

## The model: URL is the truth

```
                    URL search params (single source of truth)
                            ↑           ↓
       updateSearch (immediate)    Route.useSearch() reads it
       updateSearchDebounced (300ms timer)
```

There is **no local mirror**, no `debouncedSearch` companion state, no `resetKey`. The page reads `search` directly from the URL via [`useUrlSearch`](../../../../apps/frontend/src/hooks/use-url-search.ts), and writes back through one of two action functions:

| Function | When the URL is updated | Use for |
|---|---|---|
| `updateSearch(part)` | Immediately | Pagination, sort, every dropdown commit (status, type, etc.), toggle buttons |
| `updateSearchDebounced(part)` | 300 ms after the last call | Free-text inputs only |

Both merge `part` into the current URL search and call `navigate({ to: ".", search: next, replace: true })`. They short-circuit when the merged value equals the current URL — no redundant navigations, no infinite loops by construction.

## The route

```tsx
import { xContract } from '@repo/zod-schemas/src/api-contract/x.contract';
import { createFileRoute } from '@tanstack/react-router';
import { useUrlSearch } from '@/hooks/use-url-search';
import { requirePermission } from '@/repositories/currentUser.repository';

export const Route = createFileRoute('/app/<entity>/')({
  component: RouteComponent,
  validateSearch: xContract.searchX.query,        // Zod — rejects junk in the URL
  loader: () => requirePermission('view:x'),      // Permission gate only — no search repository call here
});

function RouteComponent() {
  const { search, updateSearch, updateSearchDebounced } = useUrlSearch(Route);

  return (
    <XDataTable
      search={{ ...search, page: search.page ?? 0, size: search.size ?? 20 }}
      updateSearch={updateSearch}
      updateSearchDebounced={updateSearchDebounced}
    />
  );
}
```

**No `useEffect`, no `useNavigate`, no `isSearchEqual` guard.** The hook owns the URL ↔ navigation contract; the route just reads and writes through it.

`updateSearchDebounced` is only forwarded into the table when the table-search component contains a `SearchInput`. If a page has no free-text input (e.g. an `assignments` table — combobox + select only), drop the prop entirely:

```tsx
const { search, updateSearch } = useUrlSearch(Route);
```

### Why `replace: true`?

Each keystroke would otherwise push a history entry. `replace` means typing "hello" creates one history entry, not five, so clicking browser Back actually leaves the table instead of rewinding letter-by-letter.

### Why `Route.useSearch()` happens inside the hook

`useUrlSearch(Route)` accepts the route object directly and reads `Route.useSearch()` internally. This keeps the page boilerplate to a single line and means the hook can dedupe writes against the actual current URL.

## The hook

This file covers **how a table page uses URL sync** — the route, the two writers, who calls which. For the formal kit contract (`useUrlSearch`'s invariants and the porting acceptance tests), see [`table-kit.md`](table-kit.md); the two don't overlap — one is usage, one is the contract.

Simplified view of [`useUrlSearch`](../../../../apps/frontend/src/hooks/use-url-search.ts):

```ts
function useUrlSearch<T>(route: { useSearch: () => T }) {
  const search = route.useSearch();
  const navigate = useNavigate();
  const searchRef = useRef(search);
  searchRef.current = search;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const writeUrl = useCallback((next: T) => {
    if (isSearchEqual(next, searchRef.current)) return;   // dedupe
    navigate({ to: '.', search: next, replace: true });
  }, [navigate]);

  const updateSearch = useCallback((part: Partial<T>) => {
    writeUrl({ ...searchRef.current, ...part });          // immediate
  }, [writeUrl]);

  const updateSearchDebounced = useCallback((part: Partial<T>) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      writeUrl({ ...searchRef.current, ...part });        // merges with the latest URL at fire time
    }, 300);
  }, [writeUrl]);

  return { search, updateSearch, updateSearchDebounced };
}
```

Key properties:

- **No mirror state.** `search` IS `Route.useSearch()`; there's nothing to keep in sync with the URL.
- **One-way writes.** Every action computes the next URL and calls `navigate`. The `isSearchEqual` dedupe is what makes the design loop-proof — we cannot navigate to the same value twice.
- **Debounce reads the latest URL when it fires**, not the URL at the time the timer was set. So "type `ab`" followed by "click page 2" before the 300 ms elapses → page 2 commits immediately, then the debounced `{ query: 'ab', page: 0 }` fires and merges into whatever the URL is at that moment. Page-back-to-0 on a fresh search is the desired behaviour.
- **One pending timer at a time.** Subsequent calls to `updateSearchDebounced` cancel the prior timer (standard debounce), but `updateSearch` does not — it just races. That race is fine because both code paths write through `writeUrl` which dedupes.

## Who uses what

| Consumer | Calls |
|---|---|
| `SearchInput` (`onInputChange`) | `updateSearchDebounced({ query, page: 0 })` |
| `CommitSelect` (`onCommit`, `onClear`) | `updateSearch({ field, page: 0 })` |
| `AsyncSearchCombobox` (`onCommit`, `onClear`) | `updateSearch({ field, page: 0 })` |
| Toggle button (`onClick`) | `updateSearch({ flag, page: 0 })` |
| TanStack Table pagination (`onPaginationChange` inside `useDataTable`) | `updateSearch({ page, size })` |
| Sort header (`useSortState.handleSort`) | `updateSearch({ sort, page: 0 })` |
| Repository (`searchXRepository(...).useQuery()`) | reads `search` |
| STT cell math | `search.page * search.size + row.index + 1` |

There is **no** `debouncedSearch` anywhere. The repository reads the URL value directly — because the URL only updates after the debounce fires, the URL value already IS "the debounced search".

## What `useUrlSearch` does NOT cover

This hook is for URL-bound list pages. For purely-local debouncing inside a component (e.g. a popover combobox that searches as the user types but never touches the URL), use [`useDebouncedValue`](../../../../apps/frontend/src/hooks/use-debounced-value.ts) — a tiny generic hook that just delays a value by a delay window. Pair it with a local `useState`:

```tsx
const [query, setQuery] = useState('');
const debouncedQuery = useDebouncedValue(query);

useEffect(() => {
  onSearch(debouncedQuery.trim());
}, [debouncedQuery, onSearch]);
```

`AsyncSearchCombobox` and `AsyncSearchSelect` are the canonical consumers. Keep the two layers separate: `useUrlSearch` owns URL ↔ filter state for the table; `useDebouncedValue` owns local input ↔ async-search inside one component. Don't try to reuse `useUrlSearch` for component-local debounce — it's bound to a TanStack Router route — and don't reach for `useDebouncedValue` to drive a URL filter, since the URL is already debounced through `updateSearchDebounced`.

See [`examples/local-debounced-search.example.tsx`](../examples/local-debounced-search.example.tsx) for the full pattern (input + debounced effect + stale-response guard).

## CommitSelect remount key — still required

`CommitSelect` is uncontrolled (seeds from `defaultValue` once at mount). When the URL changes the field from outside the bar, the control's internal state drifts. Re-key it on the value:

```tsx
<CommitSelect
  key={`status-${search.status ?? '__empty__'}`}
  defaultValue={search.status}
  ...
/>
```

`AsyncSearchCombobox` does not need this — it hydrates from `defaultKeyOption` + localStorage on each value change without needing a remount.

## Sharing the URL / deep linking

Because the URL carries the complete search state, any URL uniquely identifies a table view. The pattern for "take the user to this filtered table" — used by toast action buttons — is:

```ts
navigate({
  to: '/app/users',
  search: { query: data.fullName, size: search.size, page: 0 },
  reloadDocument: true,
});
```

`reloadDocument: true` forces a fresh navigation (not a SPA replacement) — ensures the target route remounts and picks up the new search params even if the user is already on that route. See [`row-actions.md`](row-actions.md).

## Anti-patterns

- ❌ Adding a `useEffect` in the route that calls `navigate` — `useUrlSearch` already does this.
- ❌ Keeping a local mirror of `search` in a `useState` — the URL is already the source of truth.
- ❌ Passing both `search` and `debouncedSearch` to the data table — there is only one, named `search`.
- ❌ Calling `updateSearch` from a free-text input — that fires a navigation per keystroke. Use `updateSearchDebounced`.
- ❌ Calling `updateSearchDebounced` from a dropdown commit — adds 300 ms of latency for no reason. Use `updateSearch`.
- ❌ Reading the search via `Route.useSearch()` *and* `useUrlSearch(Route)` in the same component — the hook already calls `Route.useSearch()` for you.
- ❌ Calling `searchXRepository(deps).loader()` in the route loader. The DataTable's `isLoading` skeleton already handles first-load. Putting the search repo in the loader blocks navigation until data resolves — slow, and redundant. The loader should only call `requirePermission(...)`.
- ❌ Reading from `Route.useLoaderData()` instead of `useQuery()`. The loader gates permissions; the component reads reactive data from the hook.
- ❌ Pushing history entries instead of replacing. Back button becomes useless — `useUrlSearch` always uses `replace: true`.
