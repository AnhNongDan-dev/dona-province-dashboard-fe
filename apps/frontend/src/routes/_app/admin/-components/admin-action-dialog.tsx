import { ErrorCode } from "@repo/zod-schemas/src/api/error.schema";
import type { IResponse } from "@repo/zod-schemas/src/api/response";
import {
  ADMIN_REASON_MAX_LENGTH,
  adminReasonBodySchema,
} from "@repo/zod-schemas/src/entity/admin-schema";
import type { NotifiedClient } from "@repo/zod-schemas/src/entity/central-auth-schema";
import { type FormEvent, type ReactNode, useState } from "react";
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
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api-error";

// Lỗi làm thao tác không còn hợp lệ với tài khoản đang xem → đóng hộp, trang đọc lại chi tiết tài
// khoản.
const STALE_TARGET_CODES: string[] = [
  ErrorCode.UserNotFound,
  ErrorCode.AdminTargetForbidden,
  ErrorCode.IdentityMerged,
  ErrorCode.ConnectionNotFound,
];

/** "Đã gửi yêu cầu đăng xuất tới: A, B." — để admin biết hệ thống nào đã được báo. */
export function notifiedText(clients: NotifiedClient[]) {
  return clients.length
    ? `Đã gửi yêu cầu đăng xuất tới: ${clients.map((c) => c.clientName).join(", ")}.`
    : undefined;
}

/**
 * Hộp xác nhận cho mọi thao tác ghi của admin (khóa / mở khóa / cấp lại mật khẩu / đăng xuất mọi
 * phiên / hủy liên kết): nêu hệ quả + lý do bắt buộc (1–500).
 * REAUTH_REQUIRED → clientAPI tự mở hộp xác thực lại và gửi lại đúng một lần (chỉ khi BE đã từ chối
 * thao tác, nên an toàn cả với cấp lại mật khẩu không idempotent). Không tự thử lại khi lỗi mạng.
 */
export function AdminActionDialog<T>({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = true,
  networkErrorText,
  action,
  onSuccess,
  onStale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  /** Mất response (lỗi mạng): câu riêng cho thao tác không idempotent. */
  networkErrorText?: string;
  action: (reason: string) => Promise<IResponse<T>>;
  onSuccess: (data: T) => void;
  /** Tài khoản / liên kết đã đổi ở nơi khác → đọc lại dữ liệu. */
  onStale: () => void;
}) {
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function setOpen(next: boolean) {
    if (pending) return;
    if (!next) {
      setReason("");
      setReasonError(null);
      setError(null);
    }
    onOpenChange(next);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = adminReasonBodySchema.safeParse({ reason });
    if (!parsed.success) return setReasonError(parsed.error.issues[0]?.message ?? null);
    setPending(true);
    setError(null);
    const res = await action(parsed.data.reason);
    setPending(false);

    if (res.success) {
      setReason("");
      onOpenChange(false);
      return onSuccess(res.data);
    }
    const fieldError = res.errors.find((er) => er.fieldName === "reason");
    if (res.errorCode === ErrorCode.ValidationError && fieldError) {
      return setReasonError(fieldError.message);
    }
    if (res.errorCode === ErrorCode.ReauthRequired) {
      return setError("Cần xác nhận lại mật khẩu của bạn để thực hiện thao tác này.");
    }
    if (res.errorCode === ErrorCode.ServiceUnavailable && networkErrorText) {
      return setError(networkErrorText);
    }
    if (res.errorCode === ErrorCode.AdminForbidden) {
      // Khu quản trị tự đóng khi trạng thái phiên được đọc lại (clientAPI → onAdminLost).
      return onOpenChange(false);
    }
    if (STALE_TARGET_CODES.includes(res.errorCode)) {
      setReason("");
      onOpenChange(false);
      toast.error(
        res.errorCode === ErrorCode.IdentityMerged
          ? "Tài khoản đã được gộp vào tài khoản khác. Thao tác trên tài khoản giữ lại."
          : errorMessage(res),
      );
      return onStale();
    }
    setError(errorMessage(res));
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-2">{description}</div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field data-invalid={!!reasonError}>
            <FieldLabel htmlFor="admin-reason">Lý do (bắt buộc)</FieldLabel>
            <Textarea
              id="admin-reason"
              value={reason}
              maxLength={ADMIN_REASON_MAX_LENGTH}
              aria-invalid={!!reasonError}
              onChange={(e) => {
                setReason(e.target.value);
                setReasonError(null);
              }}
            />
            <FieldDescription>
              Lưu vĩnh viễn trong nhật ký quản trị, người dùng không thấy. {reason.length}/
              {ADMIN_REASON_MAX_LENGTH}
            </FieldDescription>
            {reasonError && <FieldError>{reasonError}</FieldError>}
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={pending}>
              Không
            </AlertDialogCancel>
            <Button
              type="submit"
              variant={destructive ? "destructive" : "default"}
              disabled={pending}
            >
              {pending && <Spinner />}
              {confirmLabel}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
