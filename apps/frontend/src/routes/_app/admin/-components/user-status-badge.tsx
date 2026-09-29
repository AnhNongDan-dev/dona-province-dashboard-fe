import { USER_STATUS_LABEL, UserStatus } from "@repo/zod-schemas/src/entity/admin-schema";
import { Badge } from "@/components/ui/badge";

const VARIANT: Partial<Record<string, "secondary" | "destructive" | "outline">> = {
  [UserStatus.ACTIVE]: "secondary",
  [UserStatus.LOCKED]: "destructive",
};

export function UserStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={VARIANT[status] ?? "outline"}>
      {USER_STATUS_LABEL[status as UserStatus] ?? status}
    </Badge>
  );
}
