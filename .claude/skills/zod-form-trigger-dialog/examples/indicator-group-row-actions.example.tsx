// The CALL SITE — a row-action dropdown that uses the edit trigger-dialog.
// Trimmed to the essentials; see examples/README.md for porting notes.
import { IconDots } from "@tabler/icons-react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import PermissionCheck from "@/components/permission-check";
import { IndicatorGroupEditDialog } from "./indicator-group-edit.dialog.example";

// `indicatorGroup` would come from the table row; `confirmDelete` is an alert+AsyncButton flow.
export function IndicatorGroupRowActions({ indicatorGroup, confirmDelete }: any) {
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
        {/*
          The edit trigger wraps a PLAIN <DropdownMenuItem> — note there is NO
          onSelect={(e) => e.preventDefault()}. The imperative openZodFormDialog mounts
          the dialog at the app root, independent of this menu, so it is fine (and correct)
          for the menu to close on click. Preventing default here would leave the menu
          stuck open behind the dialog.
        */}
        <IndicatorGroupEditDialog indicatorGroup={indicatorGroup}>
          <DropdownMenuItem>
            <Pencil /> Cập nhật
          </DropdownMenuItem>
        </IndicatorGroupEditDialog>
        <PermissionCheck permission="INDICATOR_GROUP_DELETE">
          <DropdownMenuItem variant="destructive" onClick={confirmDelete}>
            <Trash2 /> Xoá
          </DropdownMenuItem>
        </PermissionCheck>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
