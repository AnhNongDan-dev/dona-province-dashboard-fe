import { ErrorCode } from "@repo/zod-schemas/src/api/error.schema";
import {
  type PasswordReset,
  passwordResetSchema,
} from "@repo/zod-schemas/src/entity/account-center-schema";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { isNewPasswordReady, NewPasswordFields } from "@/components/auth/new-password-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { clientAPI } from "@/config/clientAPI.config";
import { formatSeconds, useCountdown, useSecondsUntil } from "@/hooks/use-countdown";
import { errorMessage, errorParam } from "@/lib/api-error";
import { credentialPolicyRepository } from "@/repositories/credentialPolicy.repository";

// Quên mật khẩu. resetId chỉ giữ trong bộ nhớ tab (không lên URL / lịch sử trình
// duyệt) và gắn với phiên ẩn danh của trình duyệt này — reload thì bắt đầu lại.
export const Route = createFileRoute("/_auth/forgot-password")({
  loader: () => credentialPolicyRepository().loader(),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [reset, setReset] = useState<PasswordReset | null>(null);
  return reset ? (
    <CompleteStep reset={reset} setReset={setReset} />
  ) : (
    <RequestStep onRequested={setReset} />
  );
}

function RequestStep({ onRequested }: { onRequested: (r: PasswordReset) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const lock = useCountdown();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const loginId = String(new FormData(e.currentTarget).get("loginId") ?? "").trim();
    if (!loginId) return setError("Vui lòng nhập tên đăng nhập hoặc email");

    setPending(true);
    setError(null);
    const res = await clientAPI.PasswordReset.requestPasswordReset({ body: { loginId } });
    setPending(false);
    // Luôn cùng một phản hồi dù định danh có tồn tại hay không → luôn sang bước 2.
    if (res.success) return onRequested(passwordResetSchema.parse(res.data));
    if (res.errorCode === ErrorCode.RateLimited) {
      lock.start(errorParam(res, "retryAfterSeconds", "number") ?? 60);
    }
    setError(errorMessage(res));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quên mật khẩu</CardTitle>
        <CardDescription>
          Nhập tên đăng nhập hoặc email của tài khoản. Mã xác minh được gửi tới email của tài khoản.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <Field data-invalid={!!error}>
              <FieldLabel htmlFor="loginId">Tên đăng nhập hoặc email</FieldLabel>
              <Input id="loginId" name="loginId" autoComplete="username" autoFocus />
              {error && (
                <FieldError>
                  {error}
                  {lock.secondsLeft > 0 && ` Thử lại sau ${formatSeconds(lock.secondsLeft)}.`}
                </FieldError>
              )}
            </Field>
            <Button type="submit" disabled={pending || lock.secondsLeft > 0}>
              {pending && <Spinner />}
              Gửi mã xác minh
            </Button>
          </FieldGroup>
        </form>
        <Button asChild variant="link" className="h-auto self-start p-0">
          <Link to="/login">Quay lại đăng nhập</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function CompleteStep({
  reset,
  setReset,
}: {
  reset: PasswordReset;
  setReset: (r: PasswordReset | null) => void;
}) {
  const navigate = useNavigate();
  const { data: policy } = credentialPolicyRepository().useQuery();
  const [code, setCode] = useState("");
  const [codeAccepted, setCodeAccepted] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [serverCodes, setServerCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dead, setDead] = useState(false);
  const [pending, setPending] = useState(false);
  const expiresIn = useSecondsUntil(reset.expiresAt);
  const resendIn = useSecondsUntil(reset.resendAvailableAt);

  const gone = dead || expiresIn === 0;

  async function resend() {
    const res = await clientAPI.PasswordReset.resendPasswordReset({
      params: { resetId: reset.resetId },
    });
    if (res.success) {
      const next = passwordResetSchema.pick({ resendAvailableAt: true }).parse(res.data);
      setReset({ ...reset, ...next });
      setCode("");
      setCodeAccepted(false);
      return toast.success("Đã gửi mã mới. Mã cũ không còn dùng được.");
    }
    if (res.errorCode === ErrorCode.OtpExpired || res.errorCode === ErrorCode.OtpTooManyAttempts) {
      setDead(true);
    }
    toast.error(errorMessage(res));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!code.trim()) return setError("Vui lòng nhập mã xác minh");
    setPending(true);
    setError(null);
    const res = await clientAPI.PasswordReset.completePasswordReset({
      params: { resetId: reset.resetId },
      body: { code: code.trim(), newPassword: password },
    });
    setPending(false);
    // Không tự đăng nhập (máy dùng chung) — BE đã hủy mọi phiên của tài khoản.
    if (res.success) return navigate({ to: "/login", search: { reset: true } });

    switch (res.errorCode) {
      case ErrorCode.PasswordPolicyViolation:
        // Mã đã đúng (BE kiểm mã trước): giữ nguyên ô mã, chỉ sửa mật khẩu.
        setCodeAccepted(true);
        return setServerCodes(res.errors.map((er) => er.code));
      case ErrorCode.OtpInvalid: {
        const left = errorParam(res, "attemptsRemaining", "number");
        return setError(
          left === null
            ? "Mã xác minh không đúng."
            : `Mã xác minh không đúng. Còn ${left} lần thử.`,
        );
      }
      case ErrorCode.OtpExpired:
      case ErrorCode.OtpTooManyAttempts:
        return setDead(true);
      default:
        setError(errorMessage(res));
    }
  }

  if (gone) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Mã xác minh đã hết hạn</CardTitle>
          <CardDescription>
            Mã đã hết hạn, bị khóa do nhập sai nhiều lần, hoặc trang đã được mở lại. Hãy bắt đầu
            lại.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={() => setReset(null)}>
            Bắt đầu lại
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Đặt mật khẩu mới</CardTitle>
        <CardDescription>
          Nếu thông tin bạn nhập khớp với một tài khoản có email đã xác minh, mã xác minh đã được
          gửi tới đó.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <Field data-invalid={!!error}>
              <FieldLabel htmlFor="code">Mã xác minh</FieldLabel>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                disabled={codeAccepted}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
              />
              {error && <FieldError>{error}</FieldError>}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Còn {formatSeconds(expiresIn)} để hoàn tất</span>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-xs"
                  disabled={resendIn > 0}
                  onClick={() => void resend()}
                >
                  {resendIn > 0 ? `Gửi lại mã sau ${formatSeconds(resendIn)}` : "Gửi lại mã"}
                </Button>
              </div>
            </Field>
            <NewPasswordFields
              policy={policy}
              username={null}
              password={password}
              setPassword={(v) => {
                setPassword(v);
                setServerCodes([]);
              }}
              confirm={confirm}
              setConfirm={setConfirm}
              serverCodes={serverCodes}
            />
            {serverCodes.length > 0 && (
              <Alert variant="destructive">
                <AlertDescription>
                  Mật khẩu mới chưa đạt yêu cầu — xem các điều kiện ở trên.
                </AlertDescription>
              </Alert>
            )}
            <Button
              type="submit"
              disabled={
                pending || !isNewPasswordReady(policy, null, password, confirm, serverCodes)
              }
            >
              {pending && <Spinner />}
              Đặt mật khẩu mới
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
