import { ErrorCode } from "@repo/zod-schemas/src/api/error.schema";
import type { CredentialPolicy } from "@repo/zod-schemas/src/entity/central-auth-schema";
import {
  LinkAction,
  LinkIntent,
  OtpChannel,
  usernameAvailabilitySchema,
} from "@repo/zod-schemas/src/entity/link-transaction-schema";
import { useEffect, useRef, useState } from "react";
import { isNewPasswordReady, NewPasswordFields } from "@/components/auth/new-password-fields";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { clientAPI } from "@/config/clientAPI.config";
import { broadcast, loadSession } from "@/lib/central-session";
import type { Wizard } from "../-lib";
import { OtpChannelBlock } from "./otp-channel";
import { ErrorAlert, LegacyAccountCard, TxShell } from "./tx-parts";

type Step = "question" | "profile" | "password" | "contacts";

const USERNAME_REASON: Record<string, string> = {
  TAKEN: "Tên đăng nhập đã có người dùng.",
  RESERVED: "Tên này được hệ thống giữ lại, hãy chọn tên khác.",
  INVALID: "Tên đăng nhập không hợp lệ.",
};

/**
 * F7 — tạo tài khoản SSO từ tài khoản cũ đã xác minh. Họ tên / username / password chỉ nằm trong
 * bộ nhớ tab tới lúc gọi D15 (reload thì nhập lại); kênh đã xác minh giữ ở D9.
 */
export function CreateFlow({ w, onCancel }: { w: Wizard; onCancel: () => void }) {
  const { tx } = w;
  const [step, setStep] = useState<Step>("question");
  const [displayName, setDisplayName] = useState(tx.legacyAccount?.displayName ?? "");
  const [username, setUsername] = useState(tx.suggestedUsername ?? "");
  const [password, setPassword] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [passwordCodes, setPasswordCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function switchToLink() {
    const res = await clientAPI.LinkTransaction.switchLinkIntent({
      params: { txId: w.txId },
      body: { intent: LinkIntent.LINK },
    });
    if (res.success) w.setTx(res.data);
    else setError(w.fail(res));
  }

  async function create() {
    setPending(true);
    setError(null);
    const res = await clientAPI.LinkTransaction.createIdentity({
      params: { txId: w.txId },
      body: { username, displayName: displayName.trim(), password },
    });
    if (res.success) {
      // User đã được đăng nhập bằng identity mới → tab lấy token mới, báo các tab khác.
      await loadSession().catch(() => null);
      broadcast("changed");
      await w.reload(); // → COMPLETED
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
    setError(w.fail(res));
  }

  const common = { tx, onExpire: () => void w.reload() };

  if (step === "question") {
    return (
      <TxShell {...common} title="Bạn đã có tài khoản SSO chưa?">
        <LegacyAccountCard tx={tx} />
        <div className="flex flex-col gap-2 text-sm">
          <p>
            Mỗi người chỉ cần <strong>một</strong> tài khoản SSO để vào tất cả hệ thống.
          </p>
          <p>
            Nếu bạn <strong>đã từng</strong> đăng nhập bằng SSO ở bất kỳ hệ thống nào, hãy liên kết
            vào tài khoản đó — đừng tạo thêm.
          </p>
        </div>
        <ErrorAlert message={error} />
        {w.can(LinkAction.SWITCH_TO_LINK) && (
          <Button onClick={() => void switchToLink()}>Tôi đã có — Liên kết vào tài khoản đó</Button>
        )}
        <Button variant="outline" onClick={() => setStep("profile")}>
          Tôi chưa có — Tạo tài khoản mới
        </Button>
        <p className="text-xs text-muted-foreground">
          Lỡ tạo trùng? Bạn có thể gộp hai tài khoản sau trong mục Tài khoản của tôi.
        </p>
        {w.can(LinkAction.CANCEL) && (
          <Button variant="ghost" onClick={onCancel}>
            Hủy
          </Button>
        )}
      </TxShell>
    );
  }

  if (step === "profile") {
    return (
      <TxShell {...common} title="Tạo tài khoản SSO" description="Bước 1/3 — Thông tin tài khoản">
        <ProfileStep
          w={w}
          displayName={displayName}
          setDisplayName={setDisplayName}
          username={username}
          setUsername={(v) => {
            setUsername(v);
            setUsernameError(null);
          }}
          serverError={usernameError}
          onBack={() => setStep("question")}
          onNext={() => setStep("password")}
        />
      </TxShell>
    );
  }

  if (step === "password") {
    return (
      <TxShell {...common} title="Tạo tài khoản SSO" description="Bước 2/3 — Mật khẩu">
        <PasswordStep
          policy={w.policy}
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
      </TxShell>
    );
  }

  return (
    <TxShell
      {...common}
      title="Tạo tài khoản SSO"
      description="Bước 3/3 — Xác minh số điện thoại (bắt buộc) và email (tùy chọn)"
    >
      <div className="flex flex-col gap-1">
        <div className="text-sm font-medium">Số điện thoại di động (bắt buộc)</div>
        <OtpChannelBlock w={w} channel={OtpChannel.SMS} />
      </div>
      <div className="flex flex-col gap-1">
        <div className="text-sm font-medium">Email (tùy chọn)</div>
        <OtpChannelBlock w={w} channel={OtpChannel.EMAIL} />
      </div>
      <ErrorAlert message={error} />
      {!w.can(LinkAction.CREATE_IDENTITY) && (
        <p className="text-sm text-muted-foreground">
          Cần xác minh số điện thoại để tạo tài khoản.
        </p>
      )}
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setStep("password")}>
          Quay lại
        </Button>
        <Button
          className="flex-1"
          disabled={pending || !w.can(LinkAction.CREATE_IDENTITY)}
          onClick={() => void create()}
        >
          {pending && <Spinner />}
          Tạo tài khoản
        </Button>
      </div>
    </TxShell>
  );
}

function ProfileStep({
  w,
  displayName,
  setDisplayName,
  username,
  setUsername,
  serverError,
  onBack,
  onNext,
}: {
  w: Wizard;
  displayName: string;
  setDisplayName: (v: string) => void;
  username: string;
  setUsername: (v: string) => void;
  serverError: string | null;
  onBack: () => void;
  onNext: () => void;
}) {
  const rule = w.policy?.username;
  const pattern = rule ? new RegExp(rule.pattern) : null;
  const formatOk = !pattern || pattern.test(username);
  const availability = useUsernameAvailability(w.txId, formatOk && username ? username : null);
  const nameOk = displayName.trim().length > 0 && displayName.trim().length <= 255;
  const usernameError =
    serverError ??
    (username && !formatOk
      ? "Tên đăng nhập chưa đúng quy tắc bên dưới."
      : availability.status === "unavailable"
        ? USERNAME_REASON[availability.reason]
        : null);

  return (
    <FieldGroup>
      <LegacyAccountCard tx={w.tx} />
      <Field data-invalid={!nameOk && displayName !== ""}>
        <FieldLabel htmlFor="displayName">Họ và tên</FieldLabel>
        <Input
          id="displayName"
          value={displayName}
          maxLength={255}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </Field>
      <Field data-invalid={!!usernameError}>
        <FieldLabel htmlFor="username">Tên đăng nhập</FieldLabel>
        <Input
          id="username"
          value={username}
          autoComplete="username"
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
        />
        {rule && (
          <FieldDescription>
            {rule.minLength}–{rule.maxLength} ký tự, chỉ gồm {rule.allowedChars}
            {rule.mustStartWithLetter && ", bắt đầu bằng chữ cái"}. Không đổi được sau khi tạo.
          </FieldDescription>
        )}
        {usernameError ? (
          <FieldError>{usernameError}</FieldError>
        ) : availability.status === "checking" ? (
          <FieldDescription>Đang kiểm tra…</FieldDescription>
        ) : availability.status === "available" ? (
          <FieldDescription className="text-green-600">Tên đăng nhập dùng được.</FieldDescription>
        ) : null}
      </Field>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack}>
          Quay lại
        </Button>
        <Button
          className="flex-1"
          disabled={
            !nameOk ||
            !username ||
            !formatOk ||
            !!usernameError ||
            availability.status === "checking"
          }
          onClick={onNext}
        >
          Tiếp tục
        </Button>
      </div>
    </FieldGroup>
  );
}

type Availability =
  | { status: "idle" | "checking" | "available" | "skipped" }
  | { status: "unavailable"; reason: string };

/** D23 khi user ngừng gõ 400ms. Quá 30 lần (RATE_LIMITED) thì thôi kiểm, để D15 kiểm lần cuối. */
function useUsernameAvailability(txId: string, username: string | null): Availability {
  const [state, setState] = useState<Availability>({ status: "idle" });
  const stopped = useRef(false);

  useEffect(() => {
    if (!username || stopped.current) {
      setState({ status: stopped.current ? "skipped" : "idle" });
      return;
    }
    let active = true;
    setState({ status: "checking" });
    const timer = setTimeout(async () => {
      const res = await clientAPI.LinkTransaction.checkUsernameAvailability({
        params: { txId },
        query: { username },
      });
      if (!active) return;
      if (!res.success) {
        if (res.errorCode === ErrorCode.RateLimited) stopped.current = true;
        return setState({ status: "skipped" });
      }
      const data = usernameAvailabilitySchema.parse(res.data);
      setState(
        data.available
          ? { status: "available" }
          : { status: "unavailable", reason: data.reason ?? "INVALID" },
      );
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [txId, username]);

  return state;
}

function PasswordStep({
  policy,
  username,
  password,
  setPassword,
  serverCodes,
  onBack,
  onNext,
}: {
  policy: CredentialPolicy | null;
  username: string;
  password: string;
  setPassword: (v: string) => void;
  serverCodes: string[];
  onBack: () => void;
  onNext: () => void;
}) {
  const [confirm, setConfirm] = useState(password);

  return (
    <FieldGroup>
      <NewPasswordFields
        policy={policy}
        username={username}
        password={password}
        setPassword={setPassword}
        confirm={confirm}
        setConfirm={setConfirm}
        serverCodes={serverCodes}
      />
      {serverCodes.length > 0 && (
        <ErrorAlert message="Mật khẩu chưa đạt yêu cầu — xem các điều kiện ở trên." />
      )}
      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack}>
          Quay lại
        </Button>
        <Button
          className="flex-1"
          disabled={!isNewPasswordReady(policy, username, password, confirm, serverCodes)}
          onClick={onNext}
        >
          Tiếp tục
        </Button>
      </div>
    </FieldGroup>
  );
}
