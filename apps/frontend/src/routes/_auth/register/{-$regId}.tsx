import { ErrorCode } from "@repo/zod-schemas/src/api/error.schema";
import type { ErrorResponse } from "@repo/zod-schemas/src/api/response";
import { LogoutMode } from "@repo/zod-schemas/src/entity/central-auth-schema";
import { OtpChannel } from "@repo/zod-schemas/src/entity/link-transaction-schema";
import {
  type Registration,
  RegistrationAction,
  RegistrationState,
  registrationCompleteResultSchema,
  registrationSchema,
} from "@repo/zod-schemas/src/entity/registration-schema";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import z from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { clientAPI } from "@/config/clientAPI.config";
import { errorMessage } from "@/lib/api-error";
import { broadcast, loadSession, logout } from "@/lib/central-session";
import { useSession } from "@/lib/session-store";
import { credentialPolicyRepository } from "@/repositories/credentialPolicy.repository";
import { ErrorAlert } from "../link/-components/tx-parts";
import { OtpChannelBlock } from "./-components/otp-channel";
import { PasswordStep, ProfileStep, USERNAME_REASON } from "./-components/register-steps";
import { REG_GONE_CODES, type RegWizard } from "./-lib";

// Tự đăng ký tài khoản Thành Đoàn Đồng Nai Central (TASK-007). /register mở từ trang đăng nhập
// (giữ `req`) hoặc từ giao dịch liên kết của hệ thống cũ (`linkTx`). Phiên đăng ký chỉ được mở khi
// user thật sự bắt đầu; mở xong regId lên URL để tải lại vẫn dựng được. Họ tên / tên đăng nhập /
// mật khẩu chỉ nằm trong bộ nhớ tab; SĐT / email đã xác minh giữ ở phiên đăng ký.
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

type Step = "profile" | "password" | "contacts";

function RegisterFlow() {
  const { regId: urlRegId } = Route.useParams();
  const { linkTx, req } = Route.useSearch();
  const policy = credentialPolicyRepository().useQuery().data ?? null;
  const session = useSession();
  const navigate = useNavigate();

  const [reg, setRegState] = useState<Registration | null>(null);
  const [gone, setGone] = useState(false);
  const [loadError, setLoadError] = useState<ErrorResponse | null>(null);
  const [step, setStep] = useState<Step>("profile");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [passwordCodes, setPasswordCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [existing, setExisting] = useState<{ loginId: string | null } | null>(null);
  const [unattached, setUnattached] = useState<{ message: string; redirectUrl: string } | null>(
    null,
  );

  const regIdRef = useRef<string | null>(urlRegId ?? null);
  const opening = useRef<Promise<string | null> | null>(null);

  const setReg = useCallback((r: Registration) => {
    regIdRef.current = r.regId;
    setRegState(r);
    if (r.state === RegistrationState.EXPIRED) setGone(true);
    // Đến từ hệ thống cũ → điền sẵn (chỉ khi user chưa gõ gì).
    const lt = r.linkTransaction;
    if (lt) {
      setDisplayName((v) => v || lt.legacyDisplayName || "");
      setUsername((v) => v || lt.suggestedUsername || "");
    }
  }, []);

  const reload = useCallback(async () => {
    const regId = regIdRef.current;
    if (!regId) return;
    const res = await clientAPI.Registration.getRegistration({ params: { regId } });
    if (res.success) return setReg(registrationSchema.parse(res.data));
    if (REG_GONE_CODES.includes(res.errorCode)) setGone(true);
    else setLoadError(res);
  }, [setReg]);

  const ensureRegId = useCallback((): Promise<string | null> => {
    if (regIdRef.current) return Promise.resolve(regIdRef.current);
    opening.current ??= (async () => {
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
        return r.regId;
      }
      opening.current = null;
      // Giao dịch liên kết không dùng được (hết hạn, sai bước, xác minh cũ > 5 phút…) →
      // về /link để màn giao dịch nói rõ và cho xác minh lại.
      if (linkTx && LINK_TX_CODES.includes(res.errorCode)) {
        void navigate({ to: "/link/$txId", params: { txId: linkTx }, replace: true });
      } else setLoadError(res);
      return null;
    })();
    return opening.current;
  }, [req, linkTx, navigate, setReg]);

  // Tải lại trang có regId → đọc phiên; đến từ hệ thống cũ → mở phiên ngay để điền sẵn.
  // biome-ignore lint/correctness/useExhaustiveDependencies: chỉ chạy lúc vào trang
  useEffect(() => {
    if (regIdRef.current) void reload();
    else if (linkTx) void ensureRegId();
  }, []);

  if (gone) return <RegistrationGone />;
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
  // Có regId / linkTx mà chưa đọc xong phiên.
  if (!reg && (urlRegId || linkTx)) {
    return (
      <div className="flex justify-center p-6">
        <Spinner />
      </div>
    );
  }
  if (reg?.state === RegistrationState.COMPLETED || unattached) {
    return <RegistrationDone reg={reg} unattached={unattached} />;
  }

  const lt = reg?.linkTransaction ?? null;

  async function next() {
    setPending(true);
    const id = await ensureRegId();
    setPending(false);
    if (id) setStep("password");
  }

  async function complete(r: Registration) {
    setPending(true);
    setError(null);
    const res = await clientAPI.Registration.completeRegistration({
      params: { regId: r.regId },
      body: { displayName: displayName.trim(), username, password },
    });
    if (res.success) {
      const data = registrationCompleteResultSchema.parse(res.data);
      // Tài khoản mới đã được đăng nhập → tab lấy token mới, báo các tab khác.
      await loadSession().catch(() => null);
      broadcast("changed");
      if (lt && !data.linkTransactionAttached) {
        setPending(false);
        return setUnattached({
          message: `Chưa liên kết được với ${lt.providerName} — hãy liên kết ở mục Liên kết tài khoản.`,
          redirectUrl: data.redirectUrl,
        });
      }
      window.location.assign(data.redirectUrl); // giữ pending tới khi rời trang
      return;
    }
    setPending(false);
    if (res.errorCode === ErrorCode.UsernameTaken) {
      setUsernameError(USERNAME_REASON.TAKEN);
      return setStep("profile");
    }
    if (res.errorCode === ErrorCode.UsernamePolicyViolation) {
      setUsernameError(
        USERNAME_REASON[res.errors[0]?.code ?? "INVALID"] ?? USERNAME_REASON.INVALID,
      );
      return setStep("profile");
    }
    if (res.errorCode === ErrorCode.PasswordPolicyViolation) {
      setPasswordCodes(res.errors.map((e) => e.code));
      return setStep("password");
    }
    if (
      res.errorCode === ErrorCode.ContactAlreadyUsed ||
      res.errorCode === ErrorCode.EmailVerificationRequired
    ) {
      void reload();
    }
    setError(w?.fail(res) ?? errorMessage(res));
  }

  function goLogin() {
    const loginId = existing?.loginId ?? undefined;
    if (lt) {
      void navigate({
        to: "/link/$txId",
        params: { txId: lt.txId },
        state: { loginId, preferLogin: true },
      });
    } else {
      void navigate({ to: "/login", search: { req }, state: { loginId } });
    }
  }

  const w: RegWizard | null = reg && {
    reg,
    policy,
    setReg,
    reload,
    fail: (res) => {
      if (REG_GONE_CODES.includes(res.errorCode)) setGone(true);
      if (res.errorCode === ErrorCode.RegistrationInvalidState) void reload();
      return errorMessage(res);
    },
    can: (action) => reg.allowedActions.includes(action),
    onExistingIdentity: (loginId) => setExisting({ loginId }),
  };

  const stepNo = { profile: 1, password: 2, contacts: 3 }[step];
  const stepName = {
    profile: "Thông tin tài khoản",
    password: "Mật khẩu",
    contacts: "Xác minh email (bắt buộc) và số điện thoại (tùy chọn)",
  }[step];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Đăng ký tài khoản Thành Đoàn Đồng Nai Central</CardTitle>
        <CardDescription>
          Bước {stepNo}/3 — {stepName}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {lt && (
          <Alert>
            <AlertDescription>
              <span>
                Đăng ký rồi liên kết với tài khoản{" "}
                <span className="font-semibold">{lt.legacyUsername}</span> ở{" "}
                <span className="font-semibold">{lt.providerName}</span>.
              </span>
            </AlertDescription>
          </Alert>
        )}
        {session?.authenticated && session.identity && (
          <Alert>
            <AlertDescription>
              <span>
                Bạn đang đăng nhập với tên{" "}
                <span className="font-semibold">{session.identity.displayName}</span>. Đăng ký xong,
                trình duyệt sẽ chuyển sang tài khoản mới.
              </span>
            </AlertDescription>
          </Alert>
        )}

        {step === "profile" && (
          <ProfileStep
            policy={policy}
            ensureRegId={ensureRegId}
            displayName={displayName}
            setDisplayName={setDisplayName}
            username={username}
            setUsername={(v) => {
              setUsername(v);
              setUsernameError(null);
            }}
            serverError={usernameError}
            pending={pending}
            onNext={() => void next()}
          />
        )}
        {step === "password" && (
          <PasswordStep
            policy={policy}
            username={username}
            password={password}
            setPassword={(v) => {
              setPassword(v);
              setPasswordCodes([]);
            }}
            serverCodes={passwordCodes}
            onBack={() => setStep("profile")}
            onNext={() => setStep("contacts")}
          />
        )}
        {step === "contacts" && w && (
          <>
            {existing && (
              <Alert>
                <AlertDescription className="flex flex-col gap-2">
                  <span>
                    Email / số điện thoại này đã gắn với một tài khoản Thành Đoàn Đồng Nai Central —
                    nhiều khả năng bạn đã có tài khoản. Hãy đăng nhập bằng tài khoản đó
                    {lt ? " để liên kết" : ""}. Nếu không phải của bạn, hãy dùng email / số khác.
                  </span>
                  <span className="flex gap-3">
                    <Button size="sm" onClick={goLogin}>
                      Đăng nhập
                    </Button>
                    <Button asChild size="sm" variant="link" className="h-auto p-0">
                      <Link to="/forgot-password">Quên mật khẩu?</Link>
                    </Button>
                  </span>
                </AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col gap-1">
              <div className="text-sm font-medium">Email (bắt buộc)</div>
              <OtpChannelBlock w={w} channel={OtpChannel.EMAIL} />
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-sm font-medium">Số điện thoại di động (tùy chọn)</div>
              <OtpChannelBlock w={w} channel={OtpChannel.SMS} />
            </div>
            <ErrorAlert message={error} />
            {!w.can(RegistrationAction.COMPLETE) && (
              <p className="text-sm text-muted-foreground">Cần xác minh email để đăng ký.</p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("password")}>
                Quay lại
              </Button>
              <Button
                className="flex-1"
                disabled={pending || !w.can(RegistrationAction.COMPLETE)}
                onClick={() => void complete(w.reg)}
              >
                {pending && <Spinner />}
                Đăng ký
              </Button>
            </div>
          </>
        )}
        {step === "profile" && (
          <p className="text-sm text-muted-foreground">
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
        )}
      </CardContent>
    </Card>
  );
}

function RegistrationGone() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Phiên đăng ký đã hết hạn</CardTitle>
        <CardDescription>
          Việc đăng ký phải hoàn tất trong 30 phút, trên đúng trình duyệt đã bắt đầu. Hãy đăng ký
          lại.
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

/** Đã đăng ký xong: tải lại sau khi hoàn tất, hoặc giao dịch liên kết hỏng giữa chừng. */
function RegistrationDone({
  reg,
  unattached,
}: {
  reg: Registration | null;
  unattached: { message: string; redirectUrl: string } | null;
}) {
  const lt = reg?.linkTransaction;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Đã đăng ký tài khoản</CardTitle>
        <CardDescription>
          Tài khoản Thành Đoàn Đồng Nai Central của bạn đã được tạo và đang đăng nhập.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {unattached ? (
          <>
            <ErrorAlert message={unattached.message} />
            <Button asChild>
              <a href={unattached.redirectUrl}>Tiếp tục</a>
            </Button>
          </>
        ) : lt ? (
          <Button asChild>
            <a href={`/link/${lt.txId}`}>Tiếp tục liên kết với {lt.providerName}</a>
          </Button>
        ) : (
          <Button asChild>
            <a href="/">Về cổng tổng hợp</a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
