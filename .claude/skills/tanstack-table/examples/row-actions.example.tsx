// SEED ONLY — not compiled or linted. A portable template, not production code.
// No in-tree twin yet — this repo has no table pages. Closest lint-checked ELP-fe sources:
//   ELP-fe/apps/frontend/src/routes/admin/users/-components/user-row-actions.tsx
//
// Template for: src/routes/app/<entity>/-components/<entity>-row-actions.tsx
//
// Row actions are their OWN component, taking the row entity as a prop. The
// data-table's actions column is just: cell: ({ row }) => <WidgetRowActions widget={row.original} />
//   - All handler logic lives INSIDE this component (no row callbacks, no tableData).
//   - Navigation -> <DropdownMenuLinkItem>.   Edit -> <XEditDialog>.
//   - Destructive/state-change -> showAlert + <AsyncButton>; check res.success;
//     then toast + invalidate(). Confirm-button variant matches the action.
//   - Permission gating: per-item <PermissionCheck> for distinct permissions;
//     whole-cell `return null` when one check governs the whole menu.

import type { WidgetDetail, WidgetItem } from "@repo/zod-schemas/src/entity/widget-schema";
import { IconDots } from "@tabler/icons-react";
import { Ban, CircleCheck, Eye, Pencil } from "lucide-react";
import { toast } from "sonner";
import { AsyncButton } from "@/components/async-button";
import { DropdownMenuLinkItem } from "@/components/common/dropdown-menu-link-item";
import { showAlert } from "@/components/global/global-alert.dialog.";
import PermissionCheck from "@/components/permission-check";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { clientAPI } from "@/config/clientAPI.config";
import { widgetDetailRepository } from "@/repositories/widgetDetail.repository";
import { invalidateAllSearchWidgetsQueries } from "@/repositories/searchWidgets.repository";
import { WidgetEditDialog } from "@/routes/app/widgets/-components/widget-edit.dialog";

interface Props {
  // Accept the list type AND the detail type — this component is reused on the detail page.
  widget: WidgetItem | WidgetDetail;
}

export function WidgetRowActions({ widget }: Props) {
  const isActive = widget.status === "ACTIVE";

  // Refresh this row's detail cache AND every search page — a mutation can move rows.
  async function invalidate() {
    await Promise.all([
      widgetDetailRepository(widget.id).invalidate(),
      invalidateAllSearchWidgetsQueries(),
    ]);
  }

  async function toggleStatus() {
    const res = await clientAPI.Widget.updateWidgetStatus({
      params: { widgetId: widget.id },
      body: { status: isActive ? "INACTIVE" : "ACTIVE" },
    });
    if (res.success) {
      toast.success(isActive ? "Đã vô hiệu hóa widget" : "Đã kích hoạt widget");
      await invalidate();
    } else toast.error(res.message, { id: res.errorCode });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground data-[state=open]:bg-muted"
        >
          <IconDots />
          <span className="sr-only">Mở menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {/* Navigation — DropdownMenuLinkItem closes the menu naturally. */}
        <DropdownMenuLinkItem to="/app/widgets/$id" params={{ id: String(widget.id) }}>
          <Eye /> Xem chi tiết
        </DropdownMenuLinkItem>

        {/* Edit — wrap the item in the trigger-dialog component. */}
        <WidgetEditDialog widget={widget}>
          <DropdownMenuItem>
            <Pencil /> Cập nhật
          </DropdownMenuItem>
        </WidgetEditDialog>

        <DropdownMenuSeparator />

        {/* Destructive/state-change — gated by its own permission, confirmed via showAlert. */}
        <PermissionCheck permission="change_status:widget">
          <DropdownMenuItem
            variant={isActive ? "destructive" : "default"}
            onClick={() =>
              showAlert({
                title: isActive ? "Vô hiệu hóa widget?" : "Kích hoạt widget?",
                description: isActive
                  ? "Widget sẽ không còn hiển thị với người dùng."
                  : "Widget sẽ có thể hoạt động trở lại.",
                footer: (setOpen) => (
                  <AsyncButton
                    // The confirm-button variant MATCHES the action — red only when destructive.
                    variant={isActive ? "destructive" : "default"}
                    onClick={async () => {
                      await toggleStatus();
                      setOpen(false);
                    }}
                  >
                    Xác nhận
                  </AsyncButton>
                ),
              })
            }
          >
            {isActive ? <Ban /> : <CircleCheck />}
            {isActive ? "Vô hiệu hóa" : "Kích hoạt"}
          </DropdownMenuItem>
        </PermissionCheck>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
