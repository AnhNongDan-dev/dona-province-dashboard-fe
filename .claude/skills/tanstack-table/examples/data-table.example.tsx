// SEED ONLY — not compiled or linted. A portable template, not production code.
// No in-tree twin yet — this repo has no table pages. Closest lint-checked ELP-fe sources:
//   ELP-fe/apps/frontend/src/routes/admin/users/-components/user-data-table.tsx
//
// Template for: src/routes/app/<entity>/-components/<entity>-data-table.tsx
//
// The table shell. Responsibilities:
//   - COLUMN_MAP: labels + visibility meta (module-level constant).
//   - Fetch via searchXRepository(search).useQuery().
//   - useSortState BEFORE useDataTable — the columns useMemo needs handleSort.
//   - columns: an inline useMemo<ColumnDef> — NOT a buildColumns() factory.
//   - useDataTable owns the TanStack mechanics; never call useReactTable directly.
//   - <DataTable> renders the shell; the toolbar holds <XTableSearch> + actions.
//   - Row actions are a self-contained <WidgetRowActions> — no row callbacks,
//     no tableData augmentation; `items` is passed straight to useDataTable.

import type { WidgetItem } from "@repo/zod-schemas/src/entity/widget-schema";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useMemo } from "react";
import { AppBadge } from "@/components/common/app-badge";
import type { ColumnMeta } from "@/components/common/column-visibility-toggle";
import { ColumnVisibilityToggle } from "@/components/common/column-visibility-toggle";
import { DataTable, SortableHeader, useDataTable, useSortState } from "@/components/common/data-table";
import { DateDisplay } from "@/components/common/date-display";
import { Button } from "@/components/ui/button";
import { type SearchWidgetsQuery, searchWidgetsRepository } from "@/repositories/searchWidgets.repository";
import { WidgetCreateDialog } from "@/routes/app/widgets/-components/widget-create.dialog";
import { WidgetRowActions } from "@/routes/app/widgets/-components/widget-row-actions";
import { WidgetsTableSearch } from "@/routes/app/widgets/-components/widgets-table-search";

// Labels for the "Ẩn/hiện cột" menu + visibility meta. Every column appears here.
const COLUMN_MAP: Record<string, ColumnMeta> = {
  stt: { header: "STT", enableHiding: false },
  name: { header: "Tên", enableHiding: false },
  status: { header: "Trạng thái" },
  createdAt: { header: "Tạo lúc", defaultVisible: false }, // hidden until the user shows it
  updatedAt: { header: "Cập nhật lúc", defaultVisible: false },
};

interface Props {
  search: Required<Pick<SearchWidgetsQuery, "page" | "size">> & SearchWidgetsQuery;
  updateSearch: (part: Partial<SearchWidgetsQuery>) => void;
  updateSearchDebounced: (part: Partial<SearchWidgetsQuery>) => void;
}

export function WidgetDataTable({ search, updateSearch, updateSearchDebounced }: Props) {
  const {
    data: { items, total },
    isFetching,
    isLoading,
  } = searchWidgetsRepository(search).useQuery();

  // MUST precede useDataTable — the columns useMemo below captures handleSort.
  const { sortState, handleSort } = useSortState({ search, updateSearch });

  const columns = useMemo<ColumnDef<WidgetItem>[]>(
    () => [
      {
        id: "stt",
        header: "STT",
        enableHiding: false,
        cell: ({ row }) => search.page * search.size + row.index + 1,
      },
      {
        accessorKey: "name",
        header: () => (
          <SortableHeader label="Tên" field="name" sortState={sortState} onSort={handleSort} />
        ),
        cell: ({ row }) => (
          <Link
            to="/app/widgets/$id"
            params={{ id: String(row.original.id) }}
            className="font-medium hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: "status",
        header: "Trạng thái",
        cell: ({ row }) => <AppBadge value={row.original.status} />,
      },
      {
        accessorKey: "createdAt",
        header: () => (
          <SortableHeader
            label="Tạo lúc"
            field="createdAt"
            sortState={sortState}
            onSort={handleSort}
          />
        ),
        cell: ({ row }) => <DateDisplay date={row.original.createdAt} />,
      },
      {
        accessorKey: "updatedAt",
        header: "Cập nhật lúc",
        cell: ({ row }) => <DateDisplay date={row.original.updatedAt} />,
      },
      {
        id: "actions",
        enableHiding: false,
        cell: ({ row }) => <WidgetRowActions widget={row.original} />,
      },
    ],
    [search.page, search.size, sortState, handleSort],
  );

  // useDataTable owns manualPagination/manualSorting, getRowId, pageCount,
  // the auto-jump-to-last-page effect, and column-visibility persistence.
  const { table, columnMap } = useDataTable<WidgetItem>({
    data: items,
    columns,
    columnMap: COLUMN_MAP,
    tableName: "admin-widgets", // unique localStorage key for column visibility
    search: { page: search.page, size: search.size, sort: search.sort },
    total,
    isFetching,
    updateSearch,
  });

  // `<DataTable>` is the root — never wrap it in a card with background + padding;
  // it already renders its own table border, and the page owns outer spacing.
  return (
    <DataTable
      table={table}
      columns={columns}
      isFetching={isFetching}
      isLoading={isLoading}
      toolbar={
        <div className="flex flex-wrap items-start gap-2">
          {/* Left: filters wrap among themselves */}
          <div className="flex flex-1 flex-wrap gap-2 items-center min-w-0">
            <WidgetsTableSearch
              search={search}
              updateSearch={updateSearch}
              updateSearchDebounced={updateSearchDebounced}
            />
          </div>
          {/* Right: pinned right, never wraps with filters */}
          <div className="flex shrink-0 gap-2 items-center ml-auto">
            <ColumnVisibilityToggle table={table} columnMap={columnMap} />
            <WidgetCreateDialog>
              <Button size="sm">
                <Plus />
                <span className="hidden sm:inline">Tạo widget</span>
              </Button>
            </WidgetCreateDialog>
          </div>
        </div>
      }
    />
  );
}
