import { ErrorCode } from "@repo/zod-schemas/src/api/error.schema";
import { LinkAction, LinkIntent } from "@repo/zod-schemas/src/entity/link-transaction-schema";
import { type FormEvent, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { clientAPI } from "@/config/clientAPI.config";
import { formatSeconds, useCountdown } from "@/hooks/use-countdown";
import { errorParam } from "@/lib/api-error";
import { broadcast, loadSession } from "@/lib/central-session";
import type { Wizard } from "../-lib";
import { ErrorAlert, LegacyAccountCard, TxShell } from "./tx-parts";

/**
 * F5 bước "Đăng nhập tài khoản SSO muốn liên kết" (FRESH_LOGIN). Form luôn trống, kể cả khi
 * trình duyệt đang có phiên của ai đó; chỉ điền sẵn suggestedLoginId (email/SĐT user vừa chứng
 * minh sở hữu ở nhánh tạo mới).
 */
export function CentralLoginStep({ w, onCancel }: { w: Wizard; onCancel: () => void }) {
  const { tx } = w;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const lock = useCountdown();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const loginId = String(form.get("loginId") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (!loginId || !password) return setFieldError("Vui lòng nhập đủ định danh và mật khẩu");

    setFieldError(null);
    setError(null);
    setPending(true);
    const res = await clientAPI.LinkTransaction.centralLoginLinkTransaction({
      params: { txId: w.txId },
      body: { loginId, password },
    });
    // Password đúng thì phiên đã đổi sang người vừa đăng nhập — kể cả khi BE trả
    // PROVIDER_ALREADY_LINKED. Đọc lại D1 để tab có token mới, rồi báo các tab khác.
    if (res.success || res.errorCode === ErrorCode.ProviderAlreadyLinked) {
      await loadSession().catch(() => null);
      broadcast("changed");
    }
    setPending(false);
    if (res.success) return w.setTx(res.data);

    if (res.errorCode === ErrorCode.RateLimited) {
      lock.start(errorParam(res, "retryAfterSeconds", "number") ?? 60);
    }
    setError(w.fail(res));
  }

  async function switchToCreate() {
    const res = await clientAPI.LinkTransaction.switchLinkIntent({
      params: { txId: w.txId },
      body: { intent: LinkIntent.CREATE },
    });
    if (res.success) {
      w.setNotice(null);
      w.setTx(res.data);
    } else setError(w.fail(res));
  }

  return (
    <TxShell
      tx={tx}
      title="Liên kết với tài khoản SSO"
      description="Đăng nhập tài khoản SSO bạn muốn liên kết. Hãy đăng nhập đúng tài khoản SSO của chính bạn."
      onExpire={() => void w.reload()}
    >
      <LegacyAccountCard tx={tx} />
      {w.notice && (
        <Alert>
          <AlertDescription>{w.notice}</AlertDescription>
        </Alert>
      )}
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
          <Field data-invalid={!!fieldError}>
            <FieldLabel htmlFor="loginId">Tên đăng nhập, email hoặc số điện thoại</FieldLabel>
            <Input
              id="loginId"
              name="loginId"
              autoComplete="username"
              defaultValue={tx.suggestedLoginId ?? ""}
              autoFocus
            />
          </Field>
          <Field data-invalid={!!fieldError}>
            <FieldLabel htmlFor="password">Mật khẩu SSO</FieldLabel>
            <Input id="password" name="password" type="password" autoComplete="current-password" />
            {fieldError && <FieldError>{fieldError}</FieldError>}
          </Field>
          <Button
            type="submit"
            disabled={pending || lock.secondsLeft > 0 || !w.can(LinkAction.CENTRAL_LOGIN)}
          >
            {pending && <Spinner />}
            Đăng nhập và tiếp tục
          </Button>
        </FieldGroup>
      </form>
      {w.can(LinkAction.SWITCH_TO_CREATE) && (
        <Button variant="link" className="h-auto p-0" onClick={() => void switchToCreate()}>
          Tôi chưa có tài khoản SSO — tạo mới
        </Button>
      )}
      {w.can(LinkAction.CANCEL) && (
        <Button variant="outline" onClick={onCancel}>
          Hủy
        </Button>
      )}
    </TxShell>
  );
}
