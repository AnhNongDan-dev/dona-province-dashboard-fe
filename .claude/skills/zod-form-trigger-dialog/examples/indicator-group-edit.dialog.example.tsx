// Canonical EDIT trigger-dialog. Colocated next to the route as
// `-indicator-group-edit.dialog.tsx`. See examples/README.md for porting notes.
import { Slot } from "@radix-ui/react-slot";
import { indicatorGroupContract } from "@repo/zod-schemas/src/api-contract/indicator-group.contract";
import type { IndicatorGroup } from "@repo/zod-schemas/src/entity/indicator-group-schema";
import type { ReactElement } from "react";
import { toast } from "sonner";
import { openZodFormDialog } from "@/components/global/zod-form.dialog";
import PermissionCheck from "@/components/permission-check";
import { clientAPI } from "@/config/clientAPI.config";
import {
  invalidateAllListIndicatorGroupsQueries,
  listIndicatorGroupsRepository,
} from "@/repositories/listIndicatorGroups.repository";

const formSchema = indicatorGroupContract.updateIndicatorGroup.body;

interface Props {
  children: ReactElement;
  // The entity is passed in via a TYPED, NARROWED prop — exactly the fields the form
  // needs, nothing more. Not a store, not context. The Pick<> makes the contract explicit
  // and lets TypeScript flag a caller that doesn't have the data.
  indicatorGroup: Pick<IndicatorGroup, "id" | "name" | "parentId" | "description">;
}

export function IndicatorGroupEditDialog({ children, indicatorGroup }: Props) {
  return (
    <PermissionCheck permission="INDICATOR_GROUP_UPDATE">
      <Slot onClick={() => openIndicatorGroupEditDialog(indicatorGroup)}>{children}</Slot>
    </PermissionCheck>
  );
}

async function openIndicatorGroupEditDialog(indicatorGroup: Props["indicatorGroup"]) {
  const all = await listIndicatorGroupsRepository().loader();
  // A node cannot be its own parent — exclude self from the options.
  const parents = all
    .filter((a) => a.id !== indicatorGroup.id)
    .map((a) => ({ value: a.id, label: a.name }));

  openZodFormDialog({
    title: "Cập nhật nhóm chỉ tiêu",
    schema: formSchema,
    // defaultValues filled from the passed-in entity — the form opens pre-populated.
    defaultValues: {
      name: indicatorGroup.name,
      parentId: indicatorGroup.parentId,
      description: indicatorGroup.description,
      clearParent: null,
    },
    displayOptions: {
      name: { label: "Tên nhóm chỉ tiêu", colSpan: 6 },
      parentId: { label: "Nhóm chỉ tiêu cha", colSpan: 6, selectOptions: parents },
      description: { label: "Mô tả", colSpan: 6 },
      clearParent: { hidden: true },
    },
    // contractAPI is where you can merge form output with a derived field before the
    // request — here clearParent is computed from whether the user cleared parentId.
    contractAPI: (body) =>
      clientAPI.IndicatorGroup.updateIndicatorGroup({
        params: { indicatorGroupId: indicatorGroup.id },
        body: { ...body, clearParent: body.parentId == null },
      }),
    onSuccess: async () => {
      toast.success("Đã cập nhật nhóm chỉ tiêu");
      await invalidateAllListIndicatorGroupsQueries();
    },
    submitBtn: { text: "Lưu thay đổi" },
  });
}
