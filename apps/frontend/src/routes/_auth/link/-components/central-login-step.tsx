import { ErrorCode } from "@repo/zod-schemas/src/api/error.schema";
import { LinkAction } from "@repo/zod-schemas/src/entity/link-transaction-schema";
import { Link, useRouterState } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { PasswordInput } from "@/components/auth/password-input";
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
 * Liên kết từ hệ thống cũ, bước "Đăng nhập tài khoản Central muốn liên kết" (FRESH_LOGIN). Form
 * luôn trống, kể cả khi trình duyệt đang có phiên của ai đó; chỉ điền sẵn email user vừa nhập ở
 * trang đăng ký (history state, không lên URL).
 */
export function CentralLoginStep({ w, onCancel }: { w: Wizard; onCancel: () => void }) {
  const { tx } = w;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const lock = useCountdown();
  const suggestedLoginId = useRouterState({ select: (s) => s.location.state.loginId });

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
    // PROVIDER_ALREADY_LINKED. Đọc lại trạng thái phiên để tab có token mới, rồi báo các tab khác.
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

  return (
    <TxShell
      tx={tx}
      title="Liên kết với tài khoản Thành Đoàn Đồng Nai Central"
      description="Đăng nhập tài khoản Thành Đoàn Đồng Nai Central bạn muốn liên kết. Hãy đăng nhập đúng tài khoản của chính bạn."
      onExpire={() => void w.reload()}
    >
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
          <Field data-invalid={!!fieldError}>
            <FieldLabel htmlFor="loginId">Tên đăng nhập hoặc email</FieldLabel>
            <Input
              id="loginId"
              name="loginId"
              autoComplete="username"
              defaultValue={suggestedLoginId ?? ""}
              autoFocus
            />
          </Field>
          <Field data-invalid={!!fieldError}>
            <FieldLabel htmlFor="password">Mật khẩu</FieldLabel>
            <PasswordInput id="password" name="password" autoComplete="current-password" />
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
      {w.can(LinkAction.REGISTER) && (
        <p className="text-sm text-muted-foreground">
          Chưa có tài khoản Thành Đoàn Đồng Nai Central?{" "}
          <Link
            to="/register/{-$regId}"
            search={{ linkTx: w.txId }}
            className="text-foreground underline-offset-4 hover:underline"
          >
            Đăng ký
          </Link>
        </p>
      )}
      {w.can(LinkAction.CANCEL) && (
        <Button variant="outline" onClick={onCancel}>
          Hủy
        </Button>
      )}
    </TxShell>
  );
}
