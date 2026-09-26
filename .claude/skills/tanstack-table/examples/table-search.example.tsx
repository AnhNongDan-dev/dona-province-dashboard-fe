// =============================================================================
// SEED ONLY — not compiled or linted. A portable template, not production code.
//
// No in-tree twin yet — this repo has no table pages. Closest lint-checked ELP-fe sources:
//   ELP-fe/apps/frontend/src/routes/admin/users/-components/users-table-search.tsx
//   ELP-fe/apps/frontend/src/routes/admin/categories/-components/categories-table-search.tsx
//
// Template for: src/routes/app/<entity>/-components/<entity>-table-search.tsx
// =============================================================================
//
// THE RULES (read these before you copy a snippet)
//
//   1. One file, all controls inline. There is NO per-control file split.
//
//   2. Pick the writer by input kind:
//        - SearchInput (free text)           → updateSearchDebounced (300 ms)
//        - CommitSelect / Combobox / popover → updateSearch (immediate)
//
//   3. Every commit AND clear passes `page: 0` (URL-synced shape only). A
//      user on page 4 of the old filter must not land on an empty page 4
//      of the new one.
//
//   4. Active state is universal: `cn('<width>', search.field && 'ring')`.
//      No per-filter colours. For arrays: `search.field && search.field.length > 0`.
//      For date ranges:  `search.from || search.to`.
//
//   5. Enum option labels are <AppBadge value={...} /> — never plain strings.
//
//   6. Cleared values are `undefined`, never `''` / `null` / `[]`. Keeps the URL
//      clean and reflects the contract's `.optional()` shape.
//
//   7. Sizing (fixed widths so the row wraps predictably — no flex-1):
//        SearchInput                w-72
//        AsyncSearchCombobox        w-64 (w-72 when it replaces SearchInput)
//        CommitSelect (status/role) w-44 / w-48
//        CommitSelect (short enum)  w-36 / w-40
//        MultiSelectPopover         default (min-w-44)
//        DateRangeFilter            default (min-w-64)
//
//   8. Reading order: free text → entity comboboxes → enum selects → array/range.
//
// =============================================================================
// HOW TO USE THIS FILE — wiring it into a route
// =============================================================================
//
//   // src/routes/app/<entity>/index.tsx
//   export const Route = createFileRoute('/app/<entity>/')({
//     component: RouteComponent,
//     validateSearch: xContract.searchX.query,
//     loader: async () => { await requirePermission('view:x'); },
//   });
//
//   function RouteComponent() {
//     const { search, updateSearch, updateSearchDebounced } = useUrlSearch(Route);
//     return (
//       <XDataTable
//         search={{ ...search, page: search.page ?? 0, size: search.size ?? 20 }}
//         updateSearch={updateSearch}
//         updateSearchDebounced={updateSearchDebounced}
//       />
//     );
//   }
//
//   // <XDataTable> forwards the three props to <XTableSearch> inside its `toolbar`.
//   // The filter bar never reads the URL directly — useUrlSearch is called once
//   // at the route. See references/url-sync-debounce.md for the full mechanics.
//
// =============================================================================

import { WIDGET_STATUS_OPTIONS } from "@repo/zod-schemas/src/entity/widget-schema";
import { useMemo } from "react";
import { AppBadge } from "@/components/common/app-badge";
import AsyncSearchCombobox from "@/components/common/async-search-combobox";
import CommitSelect from "@/components/common/commit-select";
import { DateRangeFilter } from "@/components/common/date-range-filter";
import { MultiSelectPopover } from "@/components/common/multi-select-popover";
import SearchInput from "@/components/common/search-input";
import { cn } from "@/lib/utils";
import {
  generateWidgetOwnerKey,
  widgetOwnerSearchOptionsFn,
} from "@/repositories/async-search-options/widget-owner-search-options";
import type { SearchWidgetsQuery } from "@/repositories/searchWidgets.repository";
// Shared user-picker helper — drop this in when a filter is "by user".
import {
  generateUserKey,
  renderUserComboboxOption,
  searchUsersForCombobox,
  USER_COMBOBOX_SEARCH_PLACEHOLDER,
} from "@/repositories/searchUsersForCombobox.repository";

interface Props {
  search: SearchWidgetsQuery;
  updateSearch: (part: Partial<SearchWidgetsQuery>) => void;
  // Drop `updateSearchDebounced` if the bar has no SearchInput.
  updateSearchDebounced: (part: Partial<SearchWidgetsQuery>) => void;
}

// Mock option set for the multi-select example. In real code this comes from
// the entity-schema package, same as WIDGET_STATUS_OPTIONS.
const WIDGET_TAG_OPTIONS = [
  { value: "FEATURED", label: "Nổi bật" },
  { value: "ARCHIVED", label: "Lưu trữ" },
] as const;

export function WidgetsTableSearch({ search, updateSearch, updateSearchDebounced }: Props) {
  // ─────────────────────────────────────────────────────────────────────────
  // Enum option lists — built once with useMemo.
  // Labels MUST be <AppBadge>; users identify statuses by colour app-wide.
  // ─────────────────────────────────────────────────────────────────────────
  const statusOptions = useMemo(
    () =>
      WIDGET_STATUS_OPTIONS.map((opt) => ({
        value: opt.value,
        label: <AppBadge value={opt.value} />,
      })),
    [],
  );

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {/* ════════════════════════════════════════════════════════════════════
          Control 1 — SearchInput (free text)
          ────────────────────────────────────────────────────────────────────
          - Uncontrolled (defaultValue + internal ref). NEVER pass `value=`,
            it breaks ESC-clear and autofocus.
          - Wired to updateSearchDebounced — 300 ms after the last keystroke.
          - `q || undefined` keeps the URL clean (`?` not `?query=`).
          ─────────────────────────────────────────────────────────────────── */}
      <SearchInput
        className={cn("w-72", search.query && "ring")}
        defaultValue={search.query}
        placeholder="Tìm theo tên widget"
        onInputChange={(q) => updateSearchDebounced({ query: q || undefined, page: 0 })}
      />

      {/* ════════════════════════════════════════════════════════════════════
          Control 2 — AsyncSearchCombobox (entity picker)
          ────────────────────────────────────────────────────────────────────
          - Pairs with an async-search-options helper (repository-pattern skill).
          - `defaultKeyOption` hydrates the label from the URL on first render
            via the localStorage cache. NEVER invent a fake `defaultOption`
            label like `"Owner #${id}"`.
          - DO NOT add `key=` keyed to its own value — that unmounts the
            combobox mid-interaction. Only key it on a dependent filter
            (see Control 2b).
          ─────────────────────────────────────────────────────────────────── */}
      <AsyncSearchCombobox
        className={cn("w-64", search.ownerId && "ring")}
        placeholder="Chọn người sở hữu"
        onSearch={(query) => widgetOwnerSearchOptionsFn({ query })}
        defaultKeyOption={search.ownerId ? generateWidgetOwnerKey(search.ownerId) : undefined}
        onCommit={async (opt) => updateSearch({ ownerId: opt.data.id, page: 0 })}
        onClear={async () => updateSearch({ ownerId: undefined, page: 0 })}
      />

      {/* ════════════════════════════════════════════════════════════════════
          Control 2a — User picker (shared helper)
          ────────────────────────────────────────────────────────────────────
          Used when the filter is "by user" (report approvals, audit-logs,
          data-entry assignments). The custom `renderOption` shows name + phone + ID — a single
          user search hits multiple identifying fields.
          ─────────────────────────────────────────────────────────────────── */}
      <AsyncSearchCombobox
        className={cn("w-64", search.actorUserId && "ring")}
        placeholder="Người thực hiện"
        searchPlaceholder={USER_COMBOBOX_SEARCH_PLACEHOLDER}
        onSearch={searchUsersForCombobox}
        renderOption={renderUserComboboxOption}
        defaultKeyOption={search.actorUserId ? generateUserKey(search.actorUserId) : undefined}
        onCommit={async (opt) => updateSearch({ actorUserId: opt.data.id, page: 0 })}
        onClear={async () => updateSearch({ actorUserId: undefined, page: 0 })}
      />

      {/* ════════════════════════════════════════════════════════════════════
          Control 2b — Dependent combobox
          ────────────────────────────────────────────────────────────────────
          - `key` is on the PARENT filter, NOT its own value.
          - `disabled` until the parent is set.
          - On parent commit, clear the child in the SAME updateSearch call
            (see how `ownerId` commit could clear `widgetId` if they were
            dependent).
          Typical example: reports-table-search.tsx — province → district.
          ─────────────────────────────────────────────────────────────────── */}
      <AsyncSearchCombobox
        key={`widget-${search.ownerId ?? "__empty__"}`}
        className={cn("w-64", search.widgetId && "ring")}
        placeholder="Chọn widget"
        disabled={!search.ownerId}
        onSearch={(query) => widgetOwnerSearchOptionsFn({ query, ownerId: search.ownerId })}
        defaultKeyOption={search.widgetId ? generateWidgetOwnerKey(search.widgetId) : undefined}
        onCommit={async (opt) => updateSearch({ widgetId: opt.data.id, page: 0 })}
        onClear={async () => updateSearch({ widgetId: undefined, page: 0 })}
      />

      {/* ════════════════════════════════════════════════════════════════════
          Control 3 — CommitSelect (enum / status)
          ────────────────────────────────────────────────────────────────────
          - Re-keyed on its own value so an external URL change (preset link,
            manual URL edit) re-seeds the visible badge. `__empty__` is the
            stable empty-state key.
          - `onClear` is REQUIRED — without it the trailing × clear affordance
            doesn't render.
          - Pending state (`animate-pulse cursor-wait`) is internal to the
            component while the async `onCommit` resolves.
          ─────────────────────────────────────────────────────────────────── */}
      <CommitSelect
        key={`status-${search.status ?? "__empty__"}`}
        className={cn("w-44", search.status && "ring")}
        placeholder="Trạng thái"
        defaultValue={search.status}
        options={statusOptions}
        onCommit={async (opt) => updateSearch({ status: opt.value, page: 0 })}
        onClear={async () => updateSearch({ status: undefined, page: 0 })}
      />

      {/* ════════════════════════════════════════════════════════════════════
          Control 3a — CommitSelect with custom label
          ────────────────────────────────────────────────────────────────────
          When the enum value alone isn't a friendly label (e.g. role names,
          a "Tất cả / Đạt / Không đạt" filter), pass the label as <AppBadge>
          children OR as plain text. `value` still drives the badge colour.

          Real example: users-table-search.tsx (UserRole) and
          level-result-table-search.tsx (PASS/FAIL filter).
          ─────────────────────────────────────────────────────────────────── */}
      <CommitSelect
        key={`role-${search.role ?? "__empty__"}`}
        className={cn("w-48", search.role && "ring")}
        placeholder="Vai trò"
        defaultValue={search.role}
        options={useMemo(
          () =>
            Object.values({ ADMIN: "ADMIN", STAFF: "STAFF" } as const).map((value) => ({
              value,
              // <AppBadge value=> keeps the colour; children override the text.
              label: <AppBadge value={value}>{value === "ADMIN" ? "Quản trị" : "Nhân viên"}</AppBadge>,
            })),
          [],
        )}
        onCommit={async (opt) => updateSearch({ role: opt.value, page: 0 })}
        onClear={async () => updateSearch({ role: undefined, page: 0 })}
      />

      {/* ════════════════════════════════════════════════════════════════════
          Control 3b — CommitSelect with a plain-string label
          ────────────────────────────────────────────────────────────────────
          Allowed ONLY when the values aren't backend enums tracked by
          BADGE_CONFIG (e.g. a UI-only "Tất cả / Đạt / Không đạt" toggle).
          For any backend enum, use <AppBadge> (Controls 3 / 3a).
          ─────────────────────────────────────────────────────────────────── */}
      <CommitSelect
        key={`result-${search.result ?? "__empty__"}`}
        className={cn("w-40", search.result && search.result !== "ALL" && "ring")}
        placeholder="Kết quả"
        defaultValue={search.result ?? "ALL"}
        options={[
          { value: "ALL", label: "Tất cả" },
          { value: "PASS", label: "Đạt" },
          { value: "FAIL", label: "Không đạt" },
        ]}
        onCommit={async (opt) => updateSearch({ result: opt.value, page: 0 })}
        onClear={async () => updateSearch({ result: undefined, page: 0 })}
      />

      {/* ════════════════════════════════════════════════════════════════════
          Control 4 — MultiSelectPopover (array filter)
          ────────────────────────────────────────────────────────────────────
          - CONTROLLED: pass `value=` (`[]` when empty), not `defaultValue`.
          - Trigger shows "X/N đã chọn".
          - Convert empty array → undefined to keep the URL clean.
          - Active condition: `field && field.length > 0`.
          - No `key=` (controlled — no internal seed drift).
          ─────────────────────────────────────────────────────────────────── */}
      <MultiSelectPopover
        className={cn(search.tags && search.tags.length > 0 && "ring")}
        placeholder="Nhóm thẻ"
        value={search.tags ?? []}
        onChange={(next) =>
          updateSearch({ tags: next.length > 0 ? next : undefined, page: 0 })
        }
        options={WIDGET_TAG_OPTIONS}
      />

      {/* ════════════════════════════════════════════════════════════════════
          Control 5 — DateRangeFilter (date / datetime range)
          ────────────────────────────────────────────────────────────────────
          - CONTROLLED: `from` / `to` as ISO datetime strings (or null).
          - One onChange covers both fields.
          - Internal draft + "Áp dụng" / "Xoá" buttons — you don't validate
            from <= to on the call site, the component does it.
          - Active condition: `from || to` (either bound triggers the ring).
          ─────────────────────────────────────────────────────────────────── */}
      <DateRangeFilter
        className={cn((search.from || search.to) && "ring")}
        from={search.from ?? null}
        to={search.to ?? null}
        onChange={({ from, to }) =>
          updateSearch({ from: from ?? undefined, to: to ?? undefined, page: 0 })
        }
      />
    </div>
  );
}

// =============================================================================
// VARIANT — LOCAL-STATE FILTER (no URL sync)
// =============================================================================
//
// Used when the filter sits inside a tab/section that owns its own paginated
// state. Typical examples (none exist yet):
//   - apps/frontend/src/routes/app/my-reports/-components/my-reports-table-search.tsx
//   - a "Báo cáo được giao" tab inside a district detail page
//
// Differences from URL-synced:
//   - Props: `{ filters, onChange }` instead of `{ search, updateSearch, updateSearchDebounced }`
//   - `onChange` is plain setState-style; no `page: 0` because the parent
//     resets the page index when filters change.
//   - Every OTHER rule still applies (uncontrolled controls, ring on active,
//     <AppBadge> labels, undefined-not-empty).
//
// export interface MyReportsFilters {
//   keyword?: string;
//   status?: ReportStatus;
// }
//
// interface Props {
//   filters: MyReportsFilters;
//   onChange: (part: Partial<MyReportsFilters>) => void;
// }
//
// export function MyReportsTableSearch({ filters, onChange }: Props) {
//   const statusOptions = useMemo(
//     () => REPORT_STATUS_OPTIONS.map((opt) => ({
//       value: opt.value, label: <AppBadge value={opt.value} />,
//     })),
//     [],
//   );
//   return (
//     <div className="flex flex-wrap items-center gap-2">
//       <SearchInput
//         className={cn("w-72", filters.keyword && "ring")}
//         defaultValue={filters.keyword}
//         placeholder="Tìm theo mã/tên báo cáo"
//         onInputChange={(q) => onChange({ keyword: q || undefined })}
//       />
//       <CommitSelect
//         key={`status-${filters.status ?? "__empty__"}`}
//         className={cn("w-48", filters.status && "ring")}
//         placeholder="Trạng thái"
//         defaultValue={filters.status}
//         options={statusOptions}
//         onCommit={async (opt) => onChange({ status: opt.value })}
//         onClear={async () => onChange({ status: undefined })}
//       />
//     </div>
//   );
// }
//
// =============================================================================
// VARIANT — NO SearchInput (combobox-as-primary-search)
// =============================================================================
//
// Some pages drop SearchInput entirely (e.g. a data-entry assignments page). The combobox
// widens to w-72 and the Props interface omits `updateSearchDebounced`:
//
// interface Props {
//   search: SearchAssignmentsQuery;
//   updateSearch: (part: Partial<SearchAssignmentsQuery>) => void;
// }
//
// <AsyncSearchCombobox
//   className={cn("w-72", search.assigneeUserId && "ring")}
//   placeholder="Lọc theo người được giao"
//   searchPlaceholder={USER_COMBOBOX_SEARCH_PLACEHOLDER}
//   onSearch={searchUsersForCombobox}
//   renderOption={renderUserComboboxOption}
//   defaultKeyOption={search.assigneeUserId ? generateUserKey(search.assigneeUserId) : undefined}
//   onCommit={async (opt) => updateSearch({ assigneeUserId: opt.data.id, page: 0 })}
//   onClear={async () => updateSearch({ assigneeUserId: undefined, page: 0 })}
// />
//
// =============================================================================
