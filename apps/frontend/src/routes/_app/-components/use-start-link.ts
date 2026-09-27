import { ErrorCode } from "@repo/zod-schemas/src/api/error.schema";
import { useState } from "react";
import { toast } from "sonner";
import { clientAPI } from "@/config/clientAPI.config";
import { errorMessage } from "@/lib/api-error";
import {
  findMyConnectionsRepository,
  type MyConnectionDTO,
} from "@/repositories/findMyConnections.repository";

/**
 * F6 — liên kết từ Account Center: D8 → điều hướng top-level tới legacyVerifyUrl (BE đã đặt cookie
 * gắn giao dịch với trình duyệt). User quay về /link/:txId sau khi xác minh ở hệ thống cũ.
 */
export function useStartLink() {
  const [redirecting, setRedirecting] = useState<string | null>(null);

  async function start(c: MyConnectionDTO) {
    setRedirecting(c.providerCode);
    const res = await clientAPI.LinkTransaction.createLinkTransaction({
      body: { providerCode: c.providerCode },
    });
    if (res.success) {
      window.location.assign(res.data.legacyVerifyUrl); // giữ trạng thái "Đang chuyển…" tới khi rời trang
      return;
    }
    setRedirecting(null);
    toast.error(errorMessage(res));
    // Đã liên kết ở tab khác / hệ thống vừa đổi trạng thái → danh sách đang cũ.
    if (res.errorCode === ErrorCode.ProviderAlreadyLinked) {
      void findMyConnectionsRepository().invalidate();
    }
  }

  return { start, redirecting };
}
