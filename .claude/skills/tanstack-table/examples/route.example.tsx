// SEED ONLY — not compiled or linted. A portable template, not production code.
// No in-tree twin yet — this repo has no table pages. Closest lint-checked ELP-fe sources:
//   ELP-fe/apps/frontend/src/routes/admin/users/index.tsx
//
// Template for: src/routes/app/<entity>/index.tsx
//
// The route's only jobs:
//   1. validateSearch with the Zod contract query.
//   2. Run useUrlSearch(Route) — the entire URL <-> state contract.
//   3. Forward search (+ page/size defaults) and the writers to the data table.
//
// No useEffect, no useNavigate, no isSearchEqual guard. The route loader gates
// permissions ONLY — never call the search repository here.

import { widgetContract } from "@repo/zod-schemas/src/api-contract/widget.contract";
import { createFileRoute } from "@tanstack/react-router";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import { useUrlSearch } from "@/hooks/use-url-search";
import { requirePermission } from "@/repositories/currentUser.repository";
import { WidgetDataTable } from "@/routes/app/widgets/-components/widget-data-table";

export const Route = createFileRoute("/app/widgets/")({
  component: RouteComponent,
  validateSearch: widgetContract.searchWidgets.query,
  loader: async () => {
    await requirePermission("view:widget");
  },
});

function RouteComponent() {
  // `search` reflects the URL — it IS the source of truth, no local mirror.
  // `updateSearch` writes the URL immediately (pagination, sort, dropdowns).
  // `updateSearchDebounced` waits 300 ms then writes (free-text inputs only).
  const { search, updateSearch, updateSearchDebounced } = useUrlSearch(Route);

  return (
    <>
      <AppBreadcrumbs />
      <div className="flex flex-col gap-4">
        <WidgetDataTable
          search={{ ...search, page: search.page ?? 0, size: search.size ?? 20 }}
          updateSearch={updateSearch}
          updateSearchDebounced={updateSearchDebounced}
        />
      </div>
    </>
  );
}
