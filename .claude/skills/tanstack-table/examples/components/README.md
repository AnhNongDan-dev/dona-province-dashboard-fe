# Filter-Bar Components — Drop-In Sources

The filter bar in `xxx-table-search.tsx` is built from 5 custom controls + supporting helpers. This folder ships the **real source code** so another project can copy them in and start writing tables immediately.

Every file here is the production source, with project-specific imports left as-is (`@/components/ui/*` for shadcn, `@/lib/utils` for `cn`). If your alias is different, adjust the imports.

## What to copy

| File | Drop into | Purpose |
|---|---|---|
| [`search-input.tsx`](search-input.tsx) | `src/components/common/search-input.tsx` | Free-text search box |
| [`commit-select.tsx`](commit-select.tsx) | `src/components/common/commit-select.tsx` | Enum/status dropdown |
| [`async-search-combobox.tsx`](async-search-combobox.tsx) | `src/components/common/async-search-combobox.tsx` | Entity picker |
| [`multi-select-popover.tsx`](multi-select-popover.tsx) | `src/components/common/multi-select-popover.tsx` | Array filter |
| [`date-range-filter.tsx`](date-range-filter.tsx) | `src/components/common/date-range-filter.tsx` | Date/datetime range |
| [`clear-input-button.tsx`](clear-input-button.tsx) | `src/components/common/clear-input-button.tsx` | × button used by SearchInput / CommitSelect / AsyncSearchCombobox |
| [`select-trigger.tsx`](select-trigger.tsx) | `src/components/common/select-trigger.tsx` | shadcn SelectTrigger wrapper that swaps the chevron for a custom icon (Spinner / ×) |
| [`date-picker-time.tsx`](date-picker-time.tsx) | `src/components/common/date-picker-time.tsx` | Calendar + time input combo used by DateRangeFilter |
| [`../hooks/use-debounced-value.ts`](../hooks/use-debounced-value.ts) | `src/hooks/use-debounced-value.ts` | 300 ms debounce — used by AsyncSearchCombobox |
| [`../hooks/use-mobile.ts`](../hooks/use-mobile.ts) | `src/hooks/use-mobile.ts` | Mobile breakpoint hook — used by SearchInput, DatePickerTime |

Total: 8 files in `components/common/`, 2 in `hooks/`.

## Dependency graph

Read top-to-bottom — each row depends on the rows below it.

```
SearchInput            → InputGroup, ClearInputButton, useIsMobile
CommitSelect           → Select, buttonVariants, Spinner, SelectTrigger, ClearInputButton
AsyncSearchCombobox    → Popover, Command, InputGroup, Badge, Spinner,
                         ClearInputButton, useDebouncedValue, zod
MultiSelectPopover     → Popover, Button, Checkbox
DateRangeFilter        → Popover, Button, DatePickerTime
DatePickerTime         → Popover, Button, ButtonGroup, Calendar, Input, useIsMobile,
                         (project helpers — see "What to replace" below)
ClearInputButton       → Button
SelectTrigger          → Select (shadcn)
```

If you only need a subset (e.g. no date filter), drop `DateRangeFilter` + `DatePickerTime` and you can skip the calendar primitive.

## Shadcn primitives required

The components import from `@/components/ui/*`. Install these via the shadcn CLI before copying:

| Primitive | Used by |
|---|---|
| `button` (+ `buttonVariants`) | All controls, helpers |
| `input` | DatePickerTime |
| `input-group` (+ `InputGroupInput`, `InputGroupAddon`) | SearchInput, AsyncSearchCombobox |
| `select` (+ `SelectContent`, `SelectItem`, `SelectValue`, `SelectTrigger`) | CommitSelect, SelectTrigger wrapper |
| `popover` | AsyncSearchCombobox, MultiSelectPopover, DateRangeFilter, DatePickerTime |
| `command` (+ `CommandInput`, `CommandItem`, `CommandList`, `CommandEmpty`) | AsyncSearchCombobox |
| `badge` | AsyncSearchCombobox (multiple mode) |
| `checkbox` | MultiSelectPopover |
| `calendar` | DatePickerTime |
| `button-group` | DatePickerTime |
| `spinner` | CommitSelect, AsyncSearchCombobox |

Plus `cn` from `@/lib/utils` (the standard shadcn helper). Plus npm packages: `react`, `lucide-react`, `zod` (for AsyncSearchCombobox's option-schema validation), `date-fns` (for DateRangeFilter / DatePickerTime).

## What to replace in the destination project

Two files contain project-specific helpers that don't generalize. Both are inside `date-picker-time.tsx`:

- **`convertDateTimeVietnam` from `@/utils/datetime-vietnam`** — handles Asia/Saigon timezone arithmetic and returns a `{ day, month, year, hours, minutes, seconds }` parsed form alongside a `Date`. If your project doesn't need timezone-pinned dates, replace with native `Date` accessors (`d.getHours()`, etc.). If it does, port the helper or swap for `date-fns-tz`.
- **`logger` from `@/lib/client-logger`** — a thin wrapper around `console.log`. Strip the 3 `logger.info(...)` calls or wire in your own logger.

Everything else is portable as-is.

## After copying — using them

The 5 controls are wired into the filter bar inside `xxx-table-search.tsx`. See:

- [`../table-search.example.tsx`](../table-search.example.tsx) — every control with inline comments, plus the 2 prop-shape variants (URL-synced vs local-state).
- [`../../references/table-search.md`](../../references/table-search.md) — the reference: writer choice, sizing, ring-on-active rule, anti-patterns.

The filter bar's parent (the route + data-table component) is in [`../route.example.tsx`](../route.example.tsx) and [`../data-table.example.tsx`](../data-table.example.tsx).
