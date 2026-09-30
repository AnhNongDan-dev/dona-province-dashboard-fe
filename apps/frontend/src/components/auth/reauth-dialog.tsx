import { ErrorCode } from "@repo/zod-schemas/src/api/error.schema";
import { LogoutMode } from "@repo/zod-schemas/src/entity/central-auth-schema";
import { type FormEvent, useState } from "react";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { clientAPI } from "@/config/clientAPI.config";
import { formatSeconds, useCountdown } from "@/hooks/use-countdown";
import { useLogout } from "@/hooks/use-logout";
import { errorMessage, errorParam } from "@/lib/api-error";
import { closeReauth, useReauthOpen } from "@/lib/central-session";
import { useSession } from "@/lib/session-store";

/** Xác thực lại tại chỗ khi BE trả REAUTH_REQUIRED. Chỉ nhập password của chủ phiên. */
export function ReauthDialog() {
  const open = useReauthOpen();
  const identity = useSession()?.identity;
  const runLogout = useLogout();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const lock = useCountdown();

  if (!identity) return null;

  const close = (ok: boolean) => {
    setError(null);
    closeReauth(ok);
  };

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    if (!password) return setError("Vui lòng nhập mật khẩu");

    setPending(true);
    const res = await clientAPI.CentralAuth.reauthenticate({ body: { password } });
    setPending(false);
    if (res.success) return close(true);

    if (res.errorCode === ErrorCode.RateLimited) {
      lock.start(errorParam(res, "retryAfterSeconds", "number") ?? 60);
      return setError(errorMessage(res));
    }
    const remaining = errorParam(res, "attemptsRemaining", "number");
    setError(
      res.errorCode === ErrorCode.InvalidLoginCredentials && remaining !== null
        ? `Mật khẩu không đúng. Còn ${remaining} lần thử.`
        : errorMessage(res),
    );
  }

  function switchUser() {
    close(false);
    void runLogout(LogoutMode.SWITCH_USER);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close(false)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Xác nhận lại mật khẩu</DialogTitle>
          <DialogDescription>
            Thao tác này cần xác thực lại. Đang đăng nhập:{" "}
            <span className="font-medium text-foreground">{identity.displayName}</span> (
            {identity.maskedLoginId})
          </DialogDescription>
        </DialogHeader>
        <form id="reauth-form" onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="reauth-password">Mật khẩu</FieldLabel>
            <PasswordInput
              id="reauth-password"
              name="password"
              autoComplete="current-password"
              autoFocus
              aria-invalid={!!error}
            />
            {error && <FieldError>{error}</FieldError>}
          </Field>
        </form>
        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="link" className="px-0" onClick={switchUser}>
            Không phải bạn? Đổi người dùng
          </Button>
          <Button type="submit" form="reauth-form" disabled={pending || lock.secondsLeft > 0}>
            {pending && <Spinner />}
            {lock.secondsLeft > 0 ? `Thử lại sau ${formatSeconds(lock.secondsLeft)}` : "Xác nhận"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
