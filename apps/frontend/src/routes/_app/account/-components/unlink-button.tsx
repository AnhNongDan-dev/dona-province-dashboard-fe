import { ErrorCode } from "@repo/zod-schemas/src/api/error.schema";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { clientAPI } from "@/config/clientAPI.config";
import { errorMessage } from "@/lib/api-error";
import {
  findMyConnectionsRepository,
  type MyConnectionDTO,
} from "@/repositories/findMyConnections.repository";

function blockedReason(reason: string | null, providerName: string) {
  return reason === "PROVIDER_SSO_ONLY"
    ? `${providerName} chỉ còn đăng nhập bằng Thành Đoàn Đồng Nai Central; hủy liên kết sẽ khiến bạn mất quyền vào hệ thống này. Liên hệ quản trị nếu cần.`
    : "Không thể hủy liên kết hệ thống này. Liên hệ quản trị nếu cần.";
}

/** D17 — cần xác thực lại (S2 tự mở và gửi lại một lần). */
export function UnlinkButton({
  connection: c,
  account,
}: {
  connection: MyConnectionDTO;
  account: MyConnectionDTO["accounts"][number];
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  if (!account.canUnlink) {
    // Lý do hiện thành chữ (không giấu trong tooltip) để đọc được cả bằng bàn phím / trình đọc màn hình.
    const reasonId = `unlink-blocked-${account.linkId}`;
    return (
      <div className="flex max-w-56 flex-col items-end gap-1 text-right">
        <Button size="sm" variant="outline" disabled aria-describedby={reasonId}>
          Hủy liên kết
        </Button>
        <p id={reasonId} className="text-xs text-muted-foreground">
          {blockedReason(account.unlinkBlockedReason, c.providerName)}
        </p>
      </div>
    );
  }

  async function unlink() {
    setPending(true);
    const res = await clientAPI.Connection.unlinkMyConnection({
      params: { linkId: account.linkId },
    });
    setPending(false);
    setOpen(false);
    if (res.success) {
      toast.success(`Đã hủy liên kết ${c.providerName}.`);
    } else if (res.errorCode === ErrorCode.UnlinkNotAllowed) {
      toast.error(blockedReason(String(res.data?.reason ?? ""), c.providerName));
    } else if (res.errorCode === ErrorCode.ReauthRequired) {
      toast.error("Cần xác nhận lại mật khẩu để hủy liên kết.");
    } else {
      toast.error(errorMessage(res));
    }
    if (res.success || res.errorCode === ErrorCode.ConnectionNotFound) {
      void findMyConnectionsRepository().invalidate();
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Hủy liên kết
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hủy liên kết {c.providerName}?</AlertDialogTitle>
          <AlertDialogDescription>
            Bạn sẽ bị đăng xuất khỏi {c.providerName} trên mọi thiết bị và không vào được{" "}
            {c.providerName} bằng Thành Đoàn Đồng Nai Central nữa. Bạn vẫn đăng nhập{" "}
            {c.providerName} bằng tài khoản cũ như trước và có thể liên kết lại bất cứ lúc nào.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Không</AlertDialogCancel>
          <Button variant="destructive" disabled={pending} onClick={() => void unlink()}>
            {pending && <Spinner />}
            Hủy liên kết
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
