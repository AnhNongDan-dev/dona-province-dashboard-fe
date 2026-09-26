// Canonical CREATE trigger-dialog. Colocated next to the route as
// `-indicator-group-create.dialog.tsx`. See examples/README.md for porting notes.
import { Slot } from "@radix-ui/react-slot";
import { indicatorGroupContract } from "@repo/zod-schemas/src/api-contract/indicator-group.contract";
import type { ReactElement } from "react";
import { toast } from "sonner";
import { openZodFormDialog } from "@/components/global/zod-form.dialog";
import PermissionCheck from "@/components/permission-check";
import { clientAPI } from "@/config/clientAPI.config";
import {
  invalidateAllListIndicatorGroupsQueries,
  listIndicatorGroupsRepository,
} from "@/repositories/listIndicatorGroups.repository";

const formSchema = indicatorGroupContract.createIndicatorGroup.body;

interface Props {
  // ReactElement (not ReactNode) — forces exactly one element so <Slot> has a single
  // child to merge its onClick onto. The trigger's own styling stays on the child.
  children: ReactElement;
}

export function IndicatorGroupCreateDialog({ children }: Props) {
  return (
    // PermissionCheck is the built-in gate: when the user lacks the permission the
    // whole trigger (and its child button) disappears — no separate guard at the call site.
    <PermissionCheck permission="INDICATOR_GROUP_CREATE">
      <Slot onClick={openIndicatorGroupCreateDialog}>{children}</Slot>
    </PermissionCheck>
  );
}

// Async opener: pre-fetch the dropdown options BEFORE opening, so the dialog paints
// with options ready instead of mounting-then-loading.
async function openIndicatorGroupCreateDialog() {
  const all = await listIndicatorGroupsRepository().loader();
  const parents = all.map((a) => ({ value: a.id, label: a.name }));

  openZodFormDialog({
    title: "Tạo nhóm chỉ tiêu",
    schema: formSchema,
    defaultValues: {
      name: "",
      parentId: null,
      description: null,
    },
    displayOptions: {
      name: { label: "Tên nhóm chỉ tiêu", colSpan: 6 },
      parentId: { label: "Nhóm chỉ tiêu cha", colSpan: 6, selectOptions: parents },
      description: { label: "Mô tả", colSpan: 6 },
    },
    contractAPI: (body) => clientAPI.IndicatorGroup.createIndicatorGroup({ body }),
    // onSuccess does toast + invalidate ONLY — never call close() (ZodForm closes itself).
    onSuccess: async () => {
      toast.success("Đã tạo nhóm chỉ tiêu");
      await invalidateAllListIndicatorGroupsQueries();
    },
    submitBtn: { text: "Tạo" },
  });
}
