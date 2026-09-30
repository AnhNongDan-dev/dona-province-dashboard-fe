import { ErrorCode } from "@repo/zod-schemas/src/api/error.schema";
import type { ErrorResponse } from "@repo/zod-schemas/src/api/response";
import { LogoutMode } from "@repo/zod-schemas/src/entity/central-auth-schema";
import {
  type Registration,
  type RegistrationDraft,
  RegistrationState,
  registrationSchema,
  registrationSubmitResultSchema,
  registrationVerifyResultSchema,
} from "@repo/zod-schemas/src/entity/registration-schema";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import z from "zod";
import { isNewPasswordReady, NewPasswordFields } from "@/components/auth/new-password-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { clientAPI } from "@/config/clientAPI.config";
import { formatSeconds, useCountdown, useSecondsUntil } from "@/hooks/use-countdown";
import { errorMessage, errorParam } from "@/lib/api-error";
import { broadcast, loadSession, logout } from "@/lib/central-session";
import {
  isValidEmail,
  isValidPhone,
  normalizePhone,
  PHONE_FORMAT_ERROR,
} from "@/lib/contact-validation";
import { useSession } from "@/lib/session-store";
import { credentialPolicyRepository } from "@/repositories/credentialPolicy.repository";
import { ErrorAlert } from "../link/-components/tx-parts";
import { AccountFields, USERNAME_REASON } from "./-components/account-fields";
import { REG_GONE_CODES, shortRetry } from "./-lib";

// Tự đăng ký tài khoản Thành Đoàn Đồng Nai Central. /register mở từ trang đăng
// nhập (giữ `req`) hoặc từ giao dịch liên kết của hệ thống cũ (`linkTx`). Vào trang là mở phiên
// đăng ký, regId lên URL để tải lại dựng được. Gửi form → BE gửi mã tới email ngầm → nhập mã
// = tạo tài khoản + đăng nhập. Mật khẩu / email rõ chỉ nằm trong bộ nhớ tab.
export const Route = createFileRoute("/_auth/register/{-$regId}")({
  validateSearch: z.object({
    linkTx: z.guid().optional().catch(undefined),
    req: z.string().optional().catch(undefined),
  }),
  loader: () => credentialPolicyRepository().loader(),
  component: RegisterPage,
});

const LINK_TX_CODES: string[] = [
  ErrorCode.LinkTxNotFound,
  ErrorCode.LinkTxExpired,
  ErrorCode.LinkTxInvalidState,
  ErrorCode.LegacyAuthTooOld,
];

/** Mã nào cũng được khi phiên đã COMPLETED — BE trả lại kết quả lần đầu, không kiểm mã. */
const REPLAY_CODE = "000000";

type FieldErrors = Partial<Record<"email" | "phone" | "username", string>>;
type Verified = z.infer<typeof registrationVerifyResultSchema>;

function RegisterPage() {
  const { regId } = Route.useParams();
  const { linkTx } = Route.useSearch();
  const session = useSession();

  // Đang có phiên, vào đăng ký độc lập → hỏi rõ thay vì âm thầm đổi tài khoản.
  if (session?.authenticated && session.identity && !regId && !linkTx) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Bạn đang đăng nhập</CardTitle>
          <CardDescription>
            Đang đăng nhập với tên{" "}
            <span className="font-medium text-foreground">{session.identity.displayName}</span> (
            {session.identity.maskedLoginId}). Muốn tạo tài khoản mới, hãy đăng xuất trước.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button asChild>
            <a href="/">Về cổng tổng hợp</a>
          </Button>
          <Button variant="outline" onClick={() => void logout(LogoutMode.LOGOUT)}>
            Đăng xuất để đăng ký tài khoản mới
          </Button>
        </CardContent>
      </Card>
    );
  }
  return <RegisterFlow />;
}

function RegisterFlow() {
  const { regId: urlRegId } = Route.useParams();
  const { linkTx, req } = Route.useSearch();
  const navigate = useNavigate();

  const [reg, setRegState] = useState<Registration | null>(null);
  const [gone, setGone] = useState(false);
  const [outOfSends, setOutOfSends] = useState(false);
  const [loadError, setLoadError] = useState<ErrorResponse | null>(null);
  const [editing, setEditing] = useState(false);
  const [unattached, setUnattached] = useState<{ message: string; redirectUrl: string } | null>(
    null,
  );
  // Lỗi khi nhập mã cần quay lại form (tên đăng nhập / email bị chiếm trong lúc chờ mã).
  const [carried, setCarried] = useState<FieldErrors>({});
  const started = useRef(false);

  const setReg = useCallback((r: Registration) => {
    setRegState(r);
    if (r.state === RegistrationState.EXPIRED) setGone(true);
  }, []);

  const reload = useCallback(
    async (regId: string) => {
      const res = await clientAPI.Registration.getRegistration({ params: { regId } });
      if (res.success) return setReg(registrationSchema.parse(res.data));
      if (REG_GONE_CODES.includes(res.errorCode)) setGone(true);
      else setLoadError(res);
    },
    [setReg],
  );

  /**
   * Đi tiếp khi tài khoản đã tạo (nhập mã thành công, hoặc gọi lại bước nhập mã cho phiên đã
   * COMPLETED).
   */
  const finish = useCallback(async (data: Verified, lt: Registration["linkTransaction"]) => {
    // Tài khoản mới đã đăng nhập → tab lấy token mới, báo các tab khác.
    await loadSession().catch(() => null);
    broadcast("changed");
    if (lt && !data.linkTransactionAttached) {
      return setUnattached({
        message: `Chưa liên kết được với ${lt.providerName} — hãy liên kết ở mục Liên kết tài khoản.`,
        redirectUrl: data.redirectUrl,
      });
    }
    window.location.assign(data.redirectUrl);
  }, []);

  // Vào trang: có regId → đọc phiên đăng ký, chưa có → mở phiên đăng ký.
  // biome-ignore lint/correctness/useExhaustiveDependencies: chỉ chạy lúc vào trang
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (urlRegId) return void reload(urlRegId);
    void (async () => {
      const res = await clientAPI.Registration.createRegistration({
        body: { req: req ?? null, linkTxId: linkTx ?? null },
      });
      if (res.success) {
        const r = registrationSchema.parse(res.data);
        setReg(r);
        void navigate({
          to: "/register/{-$regId}",
          params: { regId: r.regId },
          search: (s) => s,
          replace: true,
        });
        return;
      }
      // Giao dịch liên kết không dùng được (hết hạn, sai bước, xác minh cũ > 5 phút…) →
      // về /link để màn giao dịch nói rõ và cho xác minh lại.
      if (linkTx && LINK_TX_CODES.includes(res.errorCode)) {
        void navigate({ to: "/link/$txId", params: { txId: linkTx }, replace: true });
      } else setLoadError(res);
    })();
  }, []);

  // Tải lại sau khi đã tạo tài khoản → gọi lại bước nhập mã (idempotent) rồi đi tiếp.
  useEffect(() => {
    if (reg?.state !== RegistrationState.COMPLETED) return;
    void (async () => {
      const res = await clientAPI.Registration.verifyRegistration({
        params: { regId: reg.regId },
        body: { code: REPLAY_CODE },
      });
      if (res.success) {
        return finish(registrationVerifyResultSchema.parse(res.data), reg.linkTransaction);
      }
      setUnattached({ message: errorMessage(res), redirectUrl: "/" });
    })();
  }, [reg, finish]);

  /**
   * Lỗi chung của gửi thông tin / nhập mã / gửi lại mã: phiên mất, sai bước, hết lượt gửi. Trả true
   * nếu đã xử lý.
   */
  const handleCommon = (res: ErrorResponse) => {
    if (REG_GONE_CODES.includes(res.errorCode)) {
      setGone(true);
      return true;
    }
    if (res.errorCode === ErrorCode.RegistrationInvalidState) {
      if (reg) void reload(reg.regId);
      return true;
    }
    return false;
  };

  if (gone) return <RegistrationGone />;
  if (outOfSends) return <RegistrationGone outOfSends />;
  if (loadError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Không mở được trang đăng ký</CardTitle>
          <CardDescription>{errorMessage(loadError)}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={() => window.location.reload()}>
            Thử lại
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (unattached) return <RegistrationDone unattached={unattached} />;
  if (!reg || reg.state === RegistrationState.COMPLETED) {
    return (
      <div className="flex justify-center p-6">
        <Spinner />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="items-center text-center">
        <img
          src="/huy-hieu-doan.png"
          alt="Huy hiệu Đoàn TNCS Hồ Chí Minh"
          className="mx-auto size-20 object-contain"
        />
        <CardTitle className="text-xl">Đăng ký tài khoản</CardTitle>
        <CardDescription>
          Tài khoản Thành Đoàn Đồng Nai Central — một tài khoản cho các hệ thống của Thành Đoàn Đồng
          Nai.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {reg.linkTransaction && (
          <Alert>
            <AlertDescription>
              <span>
                Đăng ký rồi liên kết với tài khoản{" "}
                <span className="font-semibold">{reg.linkTransaction.legacyUsername}</span> ở{" "}
                <span className="font-semibold">{reg.linkTransaction.providerName}</span>.
              </span>
            </AlertDescription>
          </Alert>
        )}
        {reg.draft && !editing ? (
          <CodeStep
            reg={reg}
            draft={reg.draft}
            onCommon={handleCommon}
            onOutOfSends={() => setOutOfSends(true)}
            onDraft={(draft) => setReg({ ...reg, draft })}
            onEdit={() => setEditing(true)}
            onBackToForm={(errors) => {
              setCarried(errors);
              setEditing(true);
            }}
            onVerified={(data) => finish(data, reg.linkTransaction)}
          />
        ) : (
          <FormStep
            reg={reg}
            req={req}
            carried={carried}
            onCommon={handleCommon}
            onOutOfSends={() => setOutOfSends(true)}
            onCancelEdit={reg.draft ? () => setEditing(false) : null}
            onSubmitted={(draft) => {
              setCarried({});
              setEditing(false);
              setReg({ ...reg, draft });
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}

function FormStep({
  reg,
  req,
  carried,
  onCommon,
  onOutOfSends,
  onCancelEdit,
  onSubmitted,
}: {
  reg: Registration;
  req: string | undefined;
  /** Đang sửa thông tin khi đã có mã → cho quay lại màn nhập mã mà không gửi mã mới. */
  onCancelEdit: (() => void) | null;
  carried: FieldErrors;
  onCommon: (res: ErrorResponse) => boolean;
  onOutOfSends: () => void;
  onSubmitted: (draft: RegistrationDraft) => void;
}) {
  const policy = credentialPolicyRepository().useQuery().data ?? null;
  const lt = reg.linkTransaction;
  // [Sửa thông tin] → điền lại họ tên / tên đăng nhập / SĐT; email + mật khẩu nhập lại.
  const [displayName, setDisplayName] = useState(
    reg.draft?.displayName ?? lt?.legacyDisplayName ?? "",
  );
  const [username, setUsername] = useState(reg.draft?.username ?? lt?.suggestedUsername ?? "");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState(reg.draft?.phone ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [accountOk, setAccountOk] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(carried);
  const [emailTaken, setEmailTaken] = useState(false);
  const [passwordCodes, setPasswordCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const lock = useCountdown();

  const regId = reg.regId;
  const ensureRegId = useCallback(() => Promise.resolve(regId), [regId]);
  const setField = (k: keyof FieldErrors, v: string | undefined) =>
    setFieldErrors((e) => ({ ...e, [k]: v }));

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const mail = email.trim();
    const tel = normalizePhone(phone);
    const local: FieldErrors = {
      email: isValidEmail(mail) ? undefined : "Email không hợp lệ",
      phone: tel && !isValidPhone(tel) ? PHONE_FORMAT_ERROR : undefined,
    };
    if (local.email || local.phone) return setFieldErrors((f) => ({ ...f, ...local }));

    setPending(true);
    setError(null);
    setEmailTaken(false);
    const res = await clientAPI.Registration.submitRegistration({
      params: { regId },
      body: {
        displayName: displayName.trim(),
        username,
        email: mail,
        phone: tel || null,
        password,
      },
    });
    setPending(false);
    if (res.success) {
      const r = registrationSubmitResultSchema.parse(res.data);
      return onSubmitted({
        displayName: displayName.trim(),
        username,
        maskedEmail: r.maskedEmail,
        phone: tel || null,
        expiresAt: r.expiresAt,
        resendAvailableAt: r.resendAvailableAt,
        sendsRemaining: r.sendsRemaining,
      });
    }
    if (onCommon(res)) return;
    const byField = (name: string) => res.errors.find((x) => x.fieldName === name);
    switch (res.errorCode) {
      case ErrorCode.ContactAlreadyUsed:
        setEmailTaken(true);
        return setField("email", "Email đã có tài khoản.");
      case ErrorCode.UsernameTaken:
        return setField("username", USERNAME_REASON.TAKEN);
      case ErrorCode.UsernamePolicyViolation:
        return setField(
          "username",
          USERNAME_REASON[byField("username")?.code ?? "INVALID"] ?? USERNAME_REASON.INVALID,
        );
      case ErrorCode.PasswordPolicyViolation:
        return setPasswordCodes(res.errors.map((x) => x.code));
      case ErrorCode.ValidationError: {
        const mailErr = byField("email");
        const phoneErr = byField("phone");
        if (mailErr || phoneErr) {
          return setFieldErrors((f) => ({
            ...f,
            email: mailErr ? "Email không hợp lệ" : f.email,
            phone: phoneErr ? PHONE_FORMAT_ERROR : f.phone,
          }));
        }
        break;
      }
      case ErrorCode.OtpTooManyAttempts:
        return onOutOfSends();
      case ErrorCode.RateLimited:
        {
          const wait = shortRetry(errorParam(res, "retryAfterSeconds", "number"));
          if (wait) lock.start(wait);
        }
        break;
    }
    setError(errorMessage(res));
  }

  const passwordOk = isNewPasswordReady(policy, username, password, confirm, passwordCodes);
  const ready = accountOk && email.trim() !== "" && passwordOk;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <FieldGroup>
        <AccountFields
          policy={policy}
          ensureRegId={ensureRegId}
          displayName={displayName}
          setDisplayName={setDisplayName}
          username={username}
          setUsername={(v) => {
            setUsername(v);
            setField("username", undefined);
          }}
          serverError={fieldErrors.username ?? null}
          onValidity={setAccountOk}
        />
        <Field data-invalid={!!fieldErrors.email}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="ten@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setField("email", undefined);
              setEmailTaken(false);
            }}
          />
          <FieldDescription>
            Dùng để đăng nhập và lấy lại mật khẩu. Mã xác minh sẽ được gửi tới email này.
          </FieldDescription>
          {fieldErrors.email && <FieldError>{fieldErrors.email}</FieldError>}
          {emailTaken && (
            <span className="flex flex-wrap gap-3 text-sm">
              {lt ? (
                <Link
                  to="/link/$txId"
                  params={{ txId: lt.txId }}
                  state={{ loginId: email.trim(), preferLogin: true }}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  Đăng nhập để liên kết
                </Link>
              ) : (
                <Link
                  to="/login"
                  search={{ req }}
                  state={{ loginId: email.trim() }}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  Đăng nhập
                </Link>
              )}
              <Link to="/forgot-password" className="underline-offset-4 hover:underline">
                Quên mật khẩu?
              </Link>
            </span>
          )}
        </Field>
        <Field data-invalid={!!fieldErrors.phone}>
          <FieldLabel htmlFor="phone">Số điện thoại (không bắt buộc)</FieldLabel>
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            placeholder="09xxxxxxxx"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setField("phone", undefined);
            }}
          />
          {fieldErrors.phone && <FieldError>{fieldErrors.phone}</FieldError>}
        </Field>
        <NewPasswordFields
          policy={policy}
          username={username}
          password={password}
          setPassword={(v) => {
            setPassword(v);
            setPasswordCodes([]);
          }}
          confirm={confirm}
          setConfirm={setConfirm}
          serverCodes={passwordCodes}
          label="Mật khẩu"
        />
      </FieldGroup>

      <ErrorAlert message={error} />
      <Button type="submit" className="w-full" disabled={pending || !ready || lock.secondsLeft > 0}>
        {pending && <Spinner />}
        {lock.secondsLeft > 0 ? `Thử lại sau ${formatSeconds(lock.secondsLeft)}` : "Đăng ký"}
      </Button>
      {onCancelEdit && (
        <Button type="button" variant="ghost" className="w-full" onClick={onCancelEdit}>
          Quay lại nhập mã đã gửi
        </Button>
      )}
      <p className="text-center text-sm text-muted-foreground">
        Đã có tài khoản?{" "}
        {lt ? (
          <Link
            to="/link/$txId"
            params={{ txId: lt.txId }}
            state={{ preferLogin: true }}
            className="text-foreground underline-offset-4 hover:underline"
          >
            Đăng nhập để liên kết
          </Link>
        ) : (
          <Link
            to="/login"
            search={{ req }}
            className="text-foreground underline-offset-4 hover:underline"
          >
            Đăng nhập
          </Link>
        )}
      </p>
    </form>
  );
}

function CodeStep({
  reg,
  draft,
  onCommon,
  onOutOfSends,
  onDraft,
  onEdit,
  onBackToForm,
  onVerified,
}: {
  reg: Registration;
  draft: RegistrationDraft;
  onCommon: (res: ErrorResponse) => boolean;
  onOutOfSends: () => void;
  onDraft: (draft: RegistrationDraft) => void;
  onEdit: () => void;
  onBackToForm: (errors: FieldErrors) => void;
  onVerified: (data: Verified) => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useCountdown();
  const resendIn = useSecondsUntil(draft.resendAvailableAt);

  async function verify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!code.trim()) return setError("Vui lòng nhập mã xác minh");
    setBusy(true);
    setError(null);
    const res = await clientAPI.Registration.verifyRegistration({
      params: { regId: reg.regId },
      body: { code: code.trim() },
    });
    if (res.success) {
      await onVerified(registrationVerifyResultSchema.parse(res.data));
      return; // giữ busy tới khi rời trang
    }
    setBusy(false);
    if (onCommon(res)) return;
    switch (res.errorCode) {
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
        setExpired(true);
        break;
      case ErrorCode.UsernameTaken:
        return onBackToForm({ username: USERNAME_REASON.TAKEN });
      case ErrorCode.ContactAlreadyUsed:
        return onBackToForm({ email: "Email vừa được dùng cho một tài khoản khác." });
      case ErrorCode.RateLimited:
        {
          const wait = shortRetry(errorParam(res, "retryAfterSeconds", "number"));
          if (wait) lock.start(wait);
        }
        break;
    }
    setError(errorMessage(res));
  }

  async function resend() {
    setBusy(true);
    setError(null);
    const res = await clientAPI.Registration.resendRegistrationCode({
      params: { regId: reg.regId },
    });
    setBusy(false);
    if (res.success) {
      const r = registrationSubmitResultSchema.parse(res.data);
      setCode("");
      setExpired(false);
      return onDraft({ ...draft, ...r });
    }
    if (onCommon(res)) return;
    if (res.errorCode === ErrorCode.OtpTooManyAttempts) return onOutOfSends();
    if (res.errorCode === ErrorCode.RateLimited) {
      {
        const wait = shortRetry(errorParam(res, "retryAfterSeconds", "number"));
        if (wait) lock.start(wait);
      }
    }
    setError(errorMessage(res));
  }

  const canResend = draft.sendsRemaining > 0;

  return (
    <form onSubmit={verify} noValidate className="flex flex-col gap-4">
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor="code">Mã xác minh</FieldLabel>
        <FieldDescription>
          Đã gửi mã 6 số tới{" "}
          <span className="font-medium text-foreground">{draft.maskedEmail}</span>, hết hạn lúc{" "}
          {format(draft.expiresAt, "HH:mm")}.
        </FieldDescription>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={10}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoFocus
        />
        {error && <FieldError>{error}</FieldError>}
        <FieldDescription>Không thấy mã? Kiểm tra thư mục Spam / Quảng cáo.</FieldDescription>
      </Field>
      <Button type="submit" className="w-full" disabled={busy || expired || lock.secondsLeft > 0}>
        {busy && <Spinner />}
        {lock.secondsLeft > 0 ? `Thử lại sau ${formatSeconds(lock.secondsLeft)}` : "Xác nhận"}
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        {canResend ? (
          <Button
            type="button"
            variant={expired ? "default" : "outline"}
            size="sm"
            disabled={busy || resendIn > 0 || lock.secondsLeft > 0}
            onClick={() => void resend()}
          >
            {resendIn > 0 ? `Gửi lại mã sau ${formatSeconds(resendIn)}` : "Gửi lại mã"}
          </Button>
        ) : (
          <span className="text-muted-foreground">Đã hết lượt gửi lại mã.</span>
        )}
        <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={onEdit}>
          Sửa thông tin
        </Button>
      </div>
    </form>
  );
}

function RegistrationGone({ outOfSends = false }: { outOfSends?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{outOfSends ? "Đã hết lượt gửi mã" : "Phiên đăng ký đã hết hạn"}</CardTitle>
        <CardDescription>
          {outOfSends
            ? "Đã hết lượt gửi mã cho lần đăng ký này — vui lòng đăng ký lại sau."
            : "Việc đăng ký phải hoàn tất trong 30 phút, trên đúng trình duyệt đã bắt đầu. Hãy đăng ký lại."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="w-full">
          <a href="/register">Đăng ký lại</a>
        </Button>
      </CardContent>
    </Card>
  );
}

/** Tài khoản đã tạo nhưng giao dịch liên kết hỏng giữa chừng (hoặc gọi lại bước nhập mã lỗi). */
function RegistrationDone({
  unattached,
}: {
  unattached: { message: string; redirectUrl: string };
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Đã đăng ký tài khoản</CardTitle>
        <CardDescription>
          Tài khoản Thành Đoàn Đồng Nai Central của bạn đã được tạo và đang đăng nhập.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <ErrorAlert message={unattached.message} />
        <Button asChild>
          <a href={unattached.redirectUrl}>Tiếp tục</a>
        </Button>
      </CardContent>
    </Card>
  );
}
