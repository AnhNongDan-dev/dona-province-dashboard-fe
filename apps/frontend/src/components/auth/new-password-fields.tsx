import type { CredentialPolicy } from "@repo/zod-schemas/src/entity/central-auth-schema";
import { PasswordInput } from "@/components/auth/password-input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";

// Luật chỉ BE kiểm được (không nằm trong chính sách mật khẩu công khai): chỉ hiện khi BE trả trong
// errors[].code.
const SERVER_ONLY_LABEL: Record<string, string> = {
  NOT_SAME_AS_CURRENT: "Khác mật khẩu hiện tại",
};

/**
 * Điều kiện kiểm được ở trình duyệt, theo mã luật của chính sách mật khẩu (cùng mã với
 * errors[].code của BE). username = null khi FE không biết username (quên mật khẩu bằng email) →
 * luật NOT_CONTAIN_USERNAME để BE kiểm.
 */
function ruleChecks(policy: CredentialPolicy["password"], username: string | null) {
  const known: Record<string, { label: string; ok: (p: string) => boolean }> = {
    MIN_LENGTH: {
      label: `Ít nhất ${policy.minLength} ký tự`,
      ok: (p) => p.length >= policy.minLength,
    },
    MAX_LENGTH: {
      label: `Tối đa ${policy.maxLength} ký tự`,
      ok: (p) => p.length > 0 && p.length <= policy.maxLength,
    },
    LOWERCASE: { label: "Có chữ thường (a–z)", ok: (p) => /[a-z]/.test(p) },
    UPPERCASE: { label: "Có chữ hoa (A–Z)", ok: (p) => /[A-Z]/.test(p) },
    DIGIT: { label: "Có chữ số (0–9)", ok: (p) => /\d/.test(p) },
    NOT_CONTAIN_USERNAME: {
      label: "Không chứa tên đăng nhập",
      ok: (p) => !username || (p.length > 0 && !p.toLowerCase().includes(username.toLowerCase())),
    },
  };
  // Mã lạ (BE thêm luật mới): hiện tên mã, để BE kiểm.
  return policy.rules.map((code) => ({
    code,
    ...(known[code] ?? { label: code, ok: () => true }),
  }));
}

/** Đủ điều kiện để gửi: đạt mọi luật kiểm được, nhập lại khớp, không còn lỗi BE chưa sửa. */
export function isNewPasswordReady(
  policy: CredentialPolicy | null,
  username: string | null,
  password: string,
  confirm: string,
  serverCodes: string[],
) {
  const checks = policy ? ruleChecks(policy.password, username) : [];
  return (
    password.length > 0 &&
    confirm === password &&
    serverCodes.length === 0 &&
    checks.every((c) => c.ok(password))
  );
}

/**
 * Ô mật khẩu mới + nhập lại + danh sách điều kiện đạt / chưa đạt (đăng ký, trang Bảo mật, quên mật
 * khẩu).
 */
export function NewPasswordFields({
  policy,
  username,
  password,
  setPassword,
  confirm,
  setConfirm,
  serverCodes,
  serverLabels,
  label = "Mật khẩu mới",
}: {
  policy: CredentialPolicy | null;
  username: string | null;
  password: string;
  setPassword: (v: string) => void;
  confirm: string;
  setConfirm: (v: string) => void;
  /** errors[].code của PASSWORD_POLICY_VIOLATION; caller xóa khi user sửa mật khẩu. */
  serverCodes: string[];
  /** Đổi nhãn luật chỉ BE kiểm được theo ngữ cảnh (vd. màn đổi mật khẩu tạm). */
  serverLabels?: Record<string, string>;
  /** Nhãn ô mật khẩu (đăng ký: "Mật khẩu"); ô nhập lại theo cùng nhãn. */
  label?: string;
}) {
  const checks = policy ? ruleChecks(policy.password, username) : [];
  const serverOnly = serverCodes.filter((c) => !checks.some((k) => k.code === c));

  return (
    <>
      <Field>
        <FieldLabel htmlFor="new-password">{label}</FieldLabel>
        <PasswordInput
          id="new-password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <ul className="flex flex-col gap-0.5 text-sm">
          {checks.map((c) => {
            const failed = serverCodes.includes(c.code);
            const ok = c.ok(password) && !failed;
            return (
              <li
                key={c.code}
                className={
                  ok ? "text-green-600" : failed ? "text-destructive" : "text-muted-foreground"
                }
              >
                {ok ? "✓" : "○"} {c.label}
              </li>
            );
          })}
          {serverOnly.map((code) => (
            <li key={code} className="text-destructive">
              ○ {serverLabels?.[code] ?? SERVER_ONLY_LABEL[code] ?? code}
            </li>
          ))}
        </ul>
      </Field>
      <Field data-invalid={confirm !== "" && confirm !== password}>
        <FieldLabel htmlFor="confirm-password">Nhập lại {label.toLowerCase()}</FieldLabel>
        <PasswordInput
          id="confirm-password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {confirm !== "" && confirm !== password && (
          <FieldError>Mật khẩu nhập lại chưa khớp.</FieldError>
        )}
      </Field>
    </>
  );
}
