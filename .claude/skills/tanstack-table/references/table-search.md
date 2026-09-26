# Table Search — The Filter Bar

Every data table has a `xxx-table-search.tsx` sibling that renders the filter bar. It is **one file** — all controls inline. There is no per-control file split.

> This reference is **self-contained**. Every control variant in the codebase is listed below with a copy-paste-ready snippet and the "how to use" rationale. After reading this file you should be able to assemble any filter bar without opening another reference. The full assembled template lives in [`../examples/table-search.example.tsx`](../examples/table-search.example.tsx).

## The shape

```tsx
// reports-table-search.tsx
interface Props {
  search: SearchReportsQuery;
  updateSearch: (part: Partial<SearchReportsQuery>) => void;
  updateSearchDebounced: (part: Partial<SearchReportsQuery>) => void;
}

export function ReportsTableSearch({ search, updateSearch, updateSearchDebounced }: Props) {
  // Enum option lists — built once with useMemo. Labels are <AppBadge>, never plain strings.
  const statusOptions = useMemo(
    () => CLASS_STATUS_OPTIONS.map((opt) => ({ value: opt.value, label: <AppBadge value={opt.value} /> })),
    [],
  );

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {/* controls… */}
    </div>
  );
}
```

- `interface Props` with `search`, `updateSearch`, and `updateSearchDebounced`. Drop `updateSearchDebounced` if there is no `SearchInput`.
- Enum option arrays are built with `useMemo` in the component body.
- Layout container is `<div className="flex flex-wrap gap-2 items-center">` — a plain flex-wrap row. No container queries.
- Controls use **fixed widths** so the bar wraps predictably (see the sizing table). No `flex-1`/`min-w-*` tug-of-war.

If the file feels long, that's fine — a full filter bar with seven controls is ~135 lines (see `examples/table-search.example.tsx`). Length is not a reason to split it into files.

### Two prop shapes — URL-synced vs local-state

The codebase has two shapes for the filter bar. Pick by **where pagination lives**:

| Shape | Used when | Props |
|---|---|---|
| **URL-synced** (the default) | Page owns the table; the URL is the single source of truth via `useUrlSearch(Route)`. Used by every `/app/...` table | `{ search, updateSearch, updateSearchDebounced }`, every commit passes `page: 0` |
| **Local-state** | Filter sits inside a tab/section that owns its own paginated state (no `useUrlSearch`). e.g. `my-reports`, `assigned-reports`, `my-drafts` | `{ filters, onChange }` — `onChange` is plain `setState`-style; **no `page: 0`** because the parent resets the page index when filters change |

Both still follow every other rule on this page (uncontrolled controls, `ring` on active, `<AppBadge>` labels, etc.). When in doubt, copy URL-synced — local-state is only correct when the parent isn't a route.

## Which writer — debounced vs immediate

Pick the writer by input kind. Every commit/clear also resets the page (URL-synced shape only).

| Control | Writer | Why |
|---|---|---|
| `SearchInput` (free text) | `updateSearchDebounced({ query, page: 0 })` | Without the 300 ms debounce, every keystroke is a navigation + refetch |
| `CommitSelect` / `AsyncSearchCombobox` / `MultiSelectPopover` / `DateRangeFilter` / toggle | `updateSearch({ field, page: 0 })` | A discrete commit shouldn't wait 300 ms |

Always pass `page: 0` on **both** commit and clear. A user on page 4 of the old filter must not land on an empty page 4 of the new one.

## Sizing — fixed widths

| Control | Width | Notes |
|---|---|---|
| `SearchInput` | `w-72` | Free text |
| `AsyncSearchCombobox` (entity picker) | `w-64` or `w-72` | `w-72` when it replaces `SearchInput` as the primary search |
| Enum `CommitSelect` (status, role, payment) | `w-44` or `w-48` | `w-48` for longer labels ("Trạng thái thanh toán") |
| Short enum `CommitSelect` (fee type, result, type) | `w-36` or `w-40` | |
| `MultiSelectPopover` | default (`min-w-44`) | Width grows with content |
| `DateRangeFilter` | default (`min-w-64`) | The trigger shows two dates |

Fixed widths keep the bar's wrap behaviour predictable. Don't reach for `flex-1 min-w-*` on filter controls — that causes controls to refuse to shrink and drop to a new line while empty space sits next to them.

## Visual language

One rule set, every control — so an active filter is unmistakable when several are on at once:

| State | Styling | Applied by |
|---|---|---|
| Idle (no value) | shadcn default for the variant | the component |
| Hover / focus | shadcn default | the component |
| **Active** (a value is set) | add `ring` via `cn('w-44', search.field && 'ring')` | **you**, at the call site |
| Pending (async commit) | `animate-pulse cursor-wait` | `CommitSelect`, internally |

`ring` is the single universal "this filter is doing something" signal — don't invent per-filter colours.

For array filters (`MultiSelectPopover`), the active condition is `search.field && search.field.length > 0`. For date ranges, it's `search.from || search.to`.

## Reading order

Place controls left-to-right in this order so the bar feels consistent across tables:

1. **Free text** (`SearchInput`) — primary search
2. **Entity pickers** (`AsyncSearchCombobox`) — narrows the row population
3. **Enum selects** (`CommitSelect`) — status, role, type
4. **Array / range filters** (`MultiSelectPopover`, `DateRangeFilter`) — usually last

For dependent comboboxes, the parent comes before the child (province → district).

---

# The 6 controls

## Control 1 — `SearchInput` (free text)

```tsx
import SearchInput from '@/components/common/search-input';

<SearchInput
  className={cn('w-72', search.query && 'ring')}
  defaultValue={search.query}
  placeholder="Tìm theo mã/tên báo cáo"
  onInputChange={(q) => updateSearchDebounced({ query: q || undefined, page: 0 })}
/>
```

- **Uncontrolled** (`defaultValue` + internal ref). Don't pass `value=` — it breaks ESC-clear and autofocus.
- Always wired to `updateSearchDebounced`.
- Convert empty string to `undefined` (`q || undefined`) so the URL stays clean (`?` not `?query=`).

## Control 2 — `CommitSelect` (enum / status filter)

```tsx
import CommitSelect from '@/components/common/commit-select';
import { AppBadge } from '@/components/common/app-badge';

const statusOptions = useMemo(
  () => CLASS_STATUS_OPTIONS.map((opt) => ({ value: opt.value, label: <AppBadge value={opt.value} /> })),
  [],
);

<CommitSelect
  key={`status-${search.status ?? '__empty__'}`}
  className={cn('w-44', search.status && 'ring')}
  placeholder="Trạng thái"
  defaultValue={search.status}
  options={statusOptions}
  onCommit={async (opt) => updateSearch({ status: opt.value, page: 0 })}
  onClear={async () => updateSearch({ status: undefined, page: 0 })}
/>
```

- **Every option `label` is `<AppBadge value={value} />`** — never a plain string. Users identify statuses by colour app-wide.
- Always provide `onClear` — without it the trailing `×` clear affordance doesn't render. `onClear` sets the field to `undefined` (never `''` or `null`) and passes `page: 0`.
- **The `key`.** `CommitSelect` is uncontrolled — it seeds from `defaultValue` once at mount. When the URL changes the field from *outside* the bar (a sidebar preset, a manual URL edit, a reset button), the control's internal state drifts. Re-keying on the value forces a remount so the visible badge matches the URL. Use a stable placeholder for the empty case (`'__empty__'`).

### Enum option with a custom label (role names)

When the enum value alone isn't a friendly label, pass the label as `<AppBadge>` children:

```tsx
const roleOptions = useMemo(
  () => Object.values(UserRole).map((value) => ({
    value,
    label: <AppBadge value={value}>{USER_ROLE_LABEL[value]}</AppBadge>,
  })),
  [],
);
```

The `value` prop on `AppBadge` still drives the colour; children override the text.

### Never hand-roll `<Select>` for an enum filter

Reaching for the raw shadcn `<Select>` forces you to reinvent what `CommitSelect` gives free: the trailing `×` clear, the async pending state, a clean "unset → `undefined`" path with no `"__all__"` sentinel, a consistent empty-state placeholder, and ring-on-active in one place. Use `CommitSelect`.

## Control 3 — `AsyncSearchCombobox` (entity picker)

```tsx
import AsyncSearchCombobox from '@/components/common/async-search-combobox';
import { provinceSearchOptionsFn, generateProvinceKey }
  from '@/repositories/async-search-options/province-search-options';

<AsyncSearchCombobox
  className={cn('w-64', search.provinceId && 'ring')}
  placeholder="Chọn tỉnh/thành"
  onSearch={(query) => provinceSearchOptionsFn({ query })}
  defaultKeyOption={search.provinceId ? generateProvinceKey(search.provinceId) : undefined}
  onCommit={async (opt) => updateSearch({ provinceId: opt.data.id, page: 0 })}
  onClear={async () => updateSearch({ provinceId: undefined, page: 0 })}
/>
```

- Pairs with an async-search-options helper — see the **repository-pattern** skill.
- `defaultKeyOption` hydrates the visible label from the URL on first render (`?provinceId=42` → shows the province name, not the placeholder). The localStorage cache behind `generateProvinceKey` keeps the label fast on later renders. Never invent a fake `defaultOption` label like `"Province #42"`.
- **Cross-page link priming**: when a `<Link>` on a different page sets this filter via `search` params (e.g. dashboard card → `/app/reports?indicatorGroupId=5`), use `<LinkWithPrime primeOption={{ key: generateXxxKey(id), label }}>` from `@/components/common/link-with-prime` instead of `<Link>`. The wrapper seeds the cache on `onMouseDown` so the destination filter shows the label immediately — including for middle-click / Cmd-click which bypass React `onClick` on `<a>`. Without priming, the destination renders the filter value but with a blank label until the user re-selects.
- **Do not** re-key `AsyncSearchCombobox` on its own value — that's the `CommitSelect` remount hack and it unmounts the combobox mid-interaction (lost focus/options/scroll). The combobox already hydrates from `defaultKeyOption`.

### User picker variant — shared helper

A user picker shows up in many tables (report approvals, audit-logs, data-entry assignments). Use the shared helper rather than wiring up your own:

```tsx
import {
  generateUserKey,
  renderUserComboboxOption,
  searchUsersForCombobox,
  USER_COMBOBOX_SEARCH_PLACEHOLDER,
} from '@/repositories/searchUsersForCombobox.repository';

<AsyncSearchCombobox
  className={cn('w-64', search.userId && 'ring')}
  placeholder="Người đặt"
  searchPlaceholder={USER_COMBOBOX_SEARCH_PLACEHOLDER}
  onSearch={searchUsersForCombobox}
  renderOption={renderUserComboboxOption}
  defaultKeyOption={search.userId ? generateUserKey(search.userId) : undefined}
  onCommit={async (opt) => updateSearch({ userId: opt.data.id, page: 0 })}
  onClear={async () => updateSearch({ userId: undefined, page: 0 })}
/>
```

The custom `renderOption` shows name + phone + ID number per row — necessary because a single user search hits multiple identifying fields.

### Replacing `SearchInput` with an `AsyncSearchCombobox`

Some pages (e.g. a data-entry assignments page) drop `SearchInput` entirely and use an `AsyncSearchCombobox` as the primary search. The control is wider (`w-72`) and the `Props` interface omits `updateSearchDebounced`:

```tsx
interface Props {
  search: SearchAssignmentsQuery;
  updateSearch: (part: Partial<SearchAssignmentsQuery>) => void;
}
```

### Dependent comboboxes

When one combobox's options depend on another filter, key it on **that** filter and `disable` it until the parent is set — so switching the parent clears a now-stale child selection:

```tsx
<AsyncSearchCombobox
  key={`district-${search.provinceId ?? '__empty__'}`}
  className={cn('w-64', search.districtId && 'ring')}
  placeholder="Chọn quận/huyện"
  disabled={!search.provinceId}
  onSearch={(query) => districtSearchOptionsFn({ query, provinceId: search.provinceId })}
  defaultKeyOption={search.districtId ? generateDistrictKey(search.districtId) : undefined}
  onCommit={async (opt) => updateSearch({ districtId: opt.data.id, page: 0 })}
  onClear={async () => updateSearch({ districtId: undefined, page: 0 })}
/>
```

And when the parent commits, clear the child in the same `updateSearch` call:

```tsx
onCommit={async (opt) =>
  updateSearch({ provinceId: opt.data.id, districtId: undefined, page: 0 })}
```

Keying on a dependent filter is the **only** valid `key` on an `AsyncSearchCombobox`.

## Control 4 — `MultiSelectPopover` (array filter)

For filters where the user can select **several** values at once (audit action groups, multi-tag filters), use `MultiSelectPopover`. The URL field is `string[]` (or `undefined` when empty).

```tsx
import { MultiSelectPopover } from '@/components/common/multi-select-popover';

<MultiSelectPopover
  className={cn(search.actionGroups && search.actionGroups.length > 0 && 'ring')}
  placeholder="Nhóm hành động"
  value={search.actionGroups ?? []}
  onChange={(next) =>
    updateSearch({ actionGroups: next.length > 0 ? next : undefined, page: 0 })
  }
  options={AUDIT_ACTION_GROUP_OPTIONS}
/>
```

- **Controlled** — pass `value=` (`[]` when empty), not `defaultValue`. The component renders "X/N đã chọn" on the trigger.
- Convert empty array to `undefined` (`next.length > 0 ? next : undefined`) — same reason as `SearchInput`: keeps the URL clean.
- The ring activates whenever the array has at least one value: `search.actionGroups && search.actionGroups.length > 0`.
- Options are plain `{ value, label }` — `label` is a string here (the popover renders checkboxes, not badge pills).
- No `key=` needed (the component is controlled, no internal seed drift).

## Control 5 — `DateRangeFilter` (date / datetime range)

For "from / to" date filters (audit logs, reports), use `DateRangeFilter`. It pops a draft editor with two `DatePickerTime` inputs and only commits when the user clicks "Áp dụng".

```tsx
import { DateRangeFilter } from '@/components/common/date-range-filter';

<DateRangeFilter
  className={cn((search.from || search.to) && 'ring')}
  from={search.from ?? null}
  to={search.to ?? null}
  onChange={({ from, to }) =>
    updateSearch({ from: from ?? undefined, to: to ?? undefined, page: 0 })
  }
/>
```

- **Controlled** — pass `from` / `to` as ISO datetime strings (or `null` when empty). The component handles the draft state internally.
- One `onChange` covers both fields. Convert `null` → `undefined` for the URL.
- The ring activates if **either** bound is set.
- Internal validation prevents `from > to` — you don't need to re-validate on the call site.

## Control 6 — Custom controls

Any control that doesn't fit the five above (a custom toggle, a slider, a date pickup with no range) should still:

1. Be **uncontrolled** if it has internal state (use a `key=` to re-seed from the URL after external changes).
2. Be **controlled** if the parent owns the state — `MultiSelectPopover` and `DateRangeFilter` are controlled.
3. Apply `cn('<width>', search.field && 'ring')` on the trigger so the active state is universal.
4. Call `updateSearch({ field: value | undefined, page: 0 })` on commit and `{ field: undefined, page: 0 }` on clear.
5. Never store `''` or `null` on a string-typed field — use `undefined`.

---

# Adding a new filter — checklist

1. Add the field to the contract's search query schema (`searchXxx.query`).
2. For an entity filter, create the async-search-options helper (repository-pattern skill).
3. Add the control inline in `xxx-table-search.tsx`. Pick the writer: text → `updateSearchDebounced`, discrete → `updateSearch`.
4. Pick the fixed width from the sizing table.
5. `onCommit`/`onClear` pass `{ field: value | undefined, page: 0 }`.
6. `className={cn('<width>', search.field && 'ring')}`.
7. Enum select → option labels are `<AppBadge value={value} />`; add the `key={...}` remount line.
8. Place it in reading order: free text → entity comboboxes → enum selects → array/range filters.

# Anti-patterns

- ❌ Splitting controls into per-file components — one `xxx-table-search.tsx`, all inline.
- ❌ `label: 'Đang xét duyệt'` on an enum select — use `<AppBadge value={value} />`.
- ❌ Raw `<Select>` + `"__all__"` sentinel — use `CommitSelect` (clearable + pending built in).
- ❌ `SearchInput.onInputChange` → `updateSearch` — a navigation per keystroke. Use `updateSearchDebounced`.
- ❌ `CommitSelect` / `AsyncSearchCombobox` → `updateSearchDebounced` — 300 ms of pointless latency. Use `updateSearch`.
- ❌ Forgetting `page: 0` on commit or clear (URL-synced shape).
- ❌ Setting a cleared value to `''` or `null` — use `undefined`. Same for empty arrays — use `undefined`, not `[]`.
- ❌ `value=` (controlled) on `SearchInput` — breaks ESC-clear and autofocus.
- ❌ `key` on `AsyncSearchCombobox` keyed to its own value — unmounts it mid-interaction. Only key it on a dependent filter.
- ❌ Per-filter custom colours for the active state — use `ring`.
- ❌ `MultiSelectPopover` with `defaultValue=` — it's controlled, pass `value=`.
- ❌ `DateRangeFilter` with separate `onFromChange` / `onToChange` props — there's only one `onChange`.
- ❌ Inventing a fake `defaultOption={{ label: "User #${id}" }}` to hydrate an `AsyncSearchCombobox` — use `defaultKeyOption` with the generated cache key instead.

# How to use this filter bar from a route

The bar receives its props from the route component (URL-synced shape):

```tsx
// src/routes/app/<entity>/index.tsx
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

`XDataTable` forwards the three props to `<XTableSearch>` inside its `toolbar`. The bar never reads the URL directly — `useUrlSearch` is called once at the route. See [`url-sync-debounce.md`](url-sync-debounce.md) for the full route wiring.
