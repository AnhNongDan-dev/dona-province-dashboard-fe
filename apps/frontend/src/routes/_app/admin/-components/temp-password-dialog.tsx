import { format } from "date-fns";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type TempPasswordResult = {
  username: string;
  temporaryPassword: string;
  expiresAt: Date;
  note?: string;
};

/**
 * Hiện mật khẩu tạm (cấp lại mật khẩu) đúng một lần. Chỉ nằm trong state của trang cho tới khi đóng
 * hộp — không URL, không storage, không cache truy vấn, không log. Đóng là mất, không mở lại được.
 */
export function TempPasswordDialog({
  result,
  onClose,
}: {
  result: TempPasswordResult | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.temporaryPassword);
    setCopied(true);
  }

  return (
    <Dialog
      open={!!result}
      onOpenChange={(open) => {
        if (open) return;
        setCopied(false);
        onClose();
      }}
    >
      <DialogContent
        // Tránh đóng nhầm khi bấm ra ngoài: đóng là mất mật khẩu.
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Mật khẩu tạm của {result?.username}</DialogTitle>
          <DialogDescription>
            Mật khẩu này chỉ hiện một lần. Đóng hộp này là không xem lại được — muốn có mật khẩu
            khác thì phải cấp lại.
          </DialogDescription>
        </DialogHeader>
        {result && (
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md border bg-muted px-3 py-2 font-mono text-lg tracking-wider select-all">
                {result.temporaryPassword}
              </code>
              <Button variant="outline" onClick={() => void copy()}>
                {copied ? <Check /> : <Copy />}
                {copied ? "Đã sao chép" : "Sao chép"}
              </Button>
            </div>
            <Alert>
              <AlertDescription>
                Chỉ đưa mật khẩu này cho chính chủ tài khoản sau khi đã xác minh danh tính. Mật khẩu
                hết hạn lúc {format(result.expiresAt, "HH:mm dd/MM/yyyy")}; người dùng phải đổi ở
                lần đăng nhập đầu.
              </AlertDescription>
            </Alert>
            {result.note && <p className="text-muted-foreground">{result.note}</p>}
          </div>
        )}
        <DialogFooter>
          <Button
            onClick={() => {
              setCopied(false);
              onClose();
            }}
          >
            Đã chuyển cho người dùng, đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
