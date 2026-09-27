import { ErrorCode } from "@repo/zod-schemas/src/api/error.schema";
import type { ErrorResponse } from "@repo/zod-schemas/src/api/response";
import { type LoginContext, LogoutMode } from "@repo/zod-schemas/src/entity/central-auth-schema";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import z from "zod";
import { SystemLogo } from "@/components/auth/system-logo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { clientAPI } from "@/config/clientAPI.config";
import { formatSeconds, useCountdown } from "@/hooks/use-countdown";
import { errorMessage, errorParam } from "@/lib/api-error";
import { broadcast, loadSession, logout } from "@/lib/central-session";
import { sessionStore, useSession } from "@/lib/session-store";

// S1 — đăng nhập Central. `req` là mã opaque do BE sinh ở /oauth2/authorize.
// FE không bao giờ tự dựng URL chuyển hướng: chỉ đi tới redirectUrl / continueUrl / returnUrl của BE.
export const Route = createFileRoute("/_auth/login")({
  validateSearch: z.object({
    req: z.string().optional().catch(undefined),
    switched: z.boolean().optional().catch(undefined),
  }),
  beforeLoad: ({ search }) => {
    if (!search.req && sessionStore.get()?.authenticated) throw redirect({ to: "/" });
  },
  loaderDeps: ({ search }) => ({ req: search.req }),
  loader: ({ deps }) =>
    deps.req ? clientAPI.CentralAuth.getLoginContext({ query: { req: deps.req } }) : null,
  component: LoginPage,
});

// Phiên ẩn danh của tab đã cũ (hết 30 phút / tab khác cấp phiên mới) → lấy token mới, gửi lại MỘT lần (Q19).
const STALE_TOKEN_CODES: string[] = [
  ErrorCode.CsrfInvalid,
  ErrorCode.SessionChanged,
  ErrorCode.SessionExpired,
];

function LoginPage() {
  const { req, switched } = Route.useSearch();
  const context = Route.useLoaderData();
  const session = useSession();

  if (context && !context.success) return <LoginRequestError res={context} />;
  const ctx = context?.data ?? null;

  if (ctx?.continueUrl && session?.authenticated && session.identity) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Bạn đang đăng nhập</CardTitle>
          <CardDescription>
            Đang đăng nhập với tên{" "}
            <span className="font-medium text-foreground">{session.identity.displayName}</span> (
            {session.identity.maskedLoginId}).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button asChild>
            <a href={ctx.continueUrl}>Tiếp tục vào {ctx.clientName}</a>
          </Button>
          <Button variant="outline" onClick={() => void logout(LogoutMode.SWITCH_USER)}>
            Đăng nhập tài khoản khác
          </Button>
        </CardContent>
      </Card>
    );
  }

  return <LoginForm req={req ?? null} ctx={ctx} switched={!!switched} />;
}

function LoginRequestError({ res }: { res: ErrorResponse }) {
  const expired = res.errorCode === ErrorCode.LoginRequestExpired;
  const returnUrl = errorParam(res, "returnUrl", "string");
  const clientName = errorParam(res, "clientName", "string");

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {expired ? "Yêu cầu đăng nhập đã hết hạn" : "Không tải được trang đăng nhập"}
        </CardTitle>
        <CardDescription>
          {expired
            ? "Hãy quay lại hệ thống bạn đang dùng và bấm đăng nhập lại."
            : errorMessage(res)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!expired ? (
          <Button className="w-full" onClick={() => window.location.reload()}>
            Thử lại
          </Button>
        ) : returnUrl ? (
          <Button asChild className="w-full">
            <a href={returnUrl}>Quay lại {clientName ?? "hệ thống"}</a>
          </Button>
        ) : (
          <Button asChild className="w-full">
            <a href="/">Về trang chủ</a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

type FieldErrors = Partial<Record<"loginId" | "password", string>>;

function LoginForm({
  req,
  ctx,
  switched,
}: {
  req: string | null;
  ctx: LoginContext | null;
  switched: boolean;
}) {
  const [personalDevice, setPersonalDevice] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const lock = useCountdown();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const loginId = String(form.get("loginId") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const missing: FieldErrors = {
      ...(!loginId && { loginId: "Vui lòng nhập tên đăng nhập, email hoặc số điện thoại" }),
      ...(!password && { password: "Vui lòng nhập mật khẩu" }),
    };
    setFieldErrors(missing);
    setError(null);
    if (Object.keys(missing).length) return;

    setPending(true);
    const body = { req, loginId, password, personalDevice };
    let res = await clientAPI.CentralAuth.login({ body });
    if (
      !res.success &&
      STALE_TOKEN_CODES.includes(res.errorCode) &&
      !sessionStore.get()?.authenticated
    ) {
      const fresh = await loadSession().catch(() => null);
      // Tab khác vừa đăng nhập → tải lại để hiện "Bạn đang đăng nhập" thay vì đăng nhập đè.
      if (fresh?.authenticated) return window.location.reload();
      if (fresh) res = await clientAPI.CentralAuth.login({ body });
    }

    if (res.success) {
      broadcast("changed");
      window.location.assign(res.data.redirectUrl); // giữ pending tới khi rời trang
      return;
    }

    setPending(false);
    if (res.errorCode === ErrorCode.RateLimited) {
      lock.start(errorParam(res, "retryAfterSeconds", "number") ?? 60);
    }
    if (res.errorCode === ErrorCode.ValidationError && res.errors.length) {
      setFieldErrors(
        Object.fromEntries(res.errors.map((er) => [er.fieldName, er.message])) as FieldErrors,
      );
      return;
    }
    setError(errorMessage(res));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Đăng nhập</CardTitle>
        {ctx && (
          <CardDescription className="flex items-center gap-2">
            <SystemLogo name={ctx.clientName} logoUrl={ctx.clientLogoUrl} />
            <span>
              để tiếp tục vào <span className="font-medium text-foreground">{ctx.clientName}</span>
            </span>
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {switched && (
          <Alert>
            <AlertDescription>Phiên của người dùng trước đã kết thúc.</AlertDescription>
          </Alert>
        )}
        {ctx?.forceLogin && (
          <Alert>
            <AlertDescription>{ctx.clientName} yêu cầu đăng nhập lại để tiếp tục.</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              {error}
              {lock.secondsLeft > 0 && ` Thử lại sau ${formatSeconds(lock.secondsLeft)}.`}
            </AlertDescription>
          </Alert>
        )}
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <Field data-invalid={!!fieldErrors.loginId}>
              <FieldLabel htmlFor="loginId">Tên đăng nhập, email hoặc số điện thoại</FieldLabel>
              <Input
                id="loginId"
                name="loginId"
                autoComplete="username"
                autoFocus
                aria-invalid={!!fieldErrors.loginId}
              />
              {fieldErrors.loginId && <FieldError>{fieldErrors.loginId}</FieldError>}
            </Field>
            <Field data-invalid={!!fieldErrors.password}>
              <FieldLabel htmlFor="password">Mật khẩu</FieldLabel>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!fieldErrors.password}
              />
              {fieldErrors.password && <FieldError>{fieldErrors.password}</FieldError>}
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id="personalDevice"
                checked={personalDevice}
                onCheckedChange={(v) => setPersonalDevice(v === true)}
              />
              <FieldLabel htmlFor="personalDevice" className="font-normal">
                Đây là máy cá nhân của tôi
              </FieldLabel>
            </Field>
            <Button type="submit" disabled={pending || lock.secondsLeft > 0}>
              {pending && <Spinner />}
              Đăng nhập
            </Button>
          </FieldGroup>
        </form>
        <p className="text-sm text-muted-foreground">
          Quên mật khẩu? Liên hệ quản trị đơn vị để được cấp lại mật khẩu.
        </p>
      </CardContent>
    </Card>
  );
}
