import { ErrorCode } from "@repo/zod-schemas/src/api/error.schema";
import { LogoutMode } from "@repo/zod-schemas/src/entity/central-auth-schema";
import { LinkAction } from "@repo/zod-schemas/src/entity/link-transaction-schema";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { clientAPI } from "@/config/clientAPI.config";
import { formatSeconds, useCountdown } from "@/hooks/use-countdown";
import { useLogout } from "@/hooks/use-logout";
import { errorParam } from "@/lib/api-error";
import type { Wizard } from "../-lib";
import { AccountCard, ErrorAlert, LegacyAccountCard, TxShell } from "./tx-parts";

/**
 * F6 bước REAUTH_CURRENT — "liên kết vào chính tôi": thẻ chủ phiên cố định, chỉ nhập password.
 * Token không đổi. Người đang ngồi máy không phải chủ phiên → hủy giao dịch rồi đổi người dùng.
 */
export function ReauthCurrentStep({ w, onCancel }: { w: Wizard; onCancel: () => void }) {
  const { tx } = w;
  const runLogout = useLogout();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useCountdown();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    if (!password) return setError("Vui lòng nhập mật khẩu");

    setPending(true);
    setError(null);
    const res = await clientAPI.LinkTransaction.centralLoginLinkTransaction({
      params: { txId: w.txId },
      body: { loginId: null, password },
    });
    setPending(false);
    if (res.success) return w.setTx(res.data);

    if (res.errorCode === ErrorCode.RateLimited) {
      lock.start(errorParam(res, "retryAfterSeconds", "number") ?? 60);
    }
    const left = errorParam(res, "attemptsRemaining", "number");
    setError(
      res.errorCode === ErrorCode.InvalidLoginCredentials && left !== null
        ? `Mật khẩu không đúng. Còn ${left} lần thử.`
        : w.fail(res),
    );
  }

  async function notMe() {
    // BE chốt: hủy giao dịch TRƯỚC, rồi mới đổi người dùng.
    await clientAPI.LinkTransaction.cancelLinkTransaction({ params: { txId: w.txId } });
    await runLogout(LogoutMode.SWITCH_USER);
  }

  return (
    <TxShell
      tx={tx}
      title={`Liên kết tài khoản ${tx.provider.name}`}
      description="Nhập mật khẩu SSO của bạn để xác nhận chính bạn đang liên kết."
      onExpire={() => void w.reload()}
    >
      {tx.centralIdentity && (
        <AccountCard
          label="Tài khoản SSO đang đăng nhập"
          primary={tx.centralIdentity.displayName}
          secondary={tx.centralIdentity.maskedLoginId}
        />
      )}
      <LegacyAccountCard tx={tx} />
      <ErrorAlert
        message={
          error &&
          (lock.secondsLeft > 0
            ? `${error} Thử lại sau ${formatSeconds(lock.secondsLeft)}.`
            : error)
        }
      />
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="password">Mật khẩu SSO</FieldLabel>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              autoFocus
            />
            {error === "Vui lòng nhập mật khẩu" && <FieldError>{error}</FieldError>}
          </Field>
          <Button
            type="submit"
            disabled={pending || lock.secondsLeft > 0 || !w.can(LinkAction.CENTRAL_LOGIN)}
          >
            {pending && <Spinner />}
            Xác nhận và tiếp tục
          </Button>
        </FieldGroup>
      </form>
      <Button variant="link" className="h-auto p-0" onClick={() => void notMe()}>
        Không phải bạn? Đổi người dùng
      </Button>
      {w.can(LinkAction.CANCEL) && (
        <Button variant="outline" onClick={onCancel}>
          Hủy
        </Button>
      )}
    </TxShell>
  );
}
