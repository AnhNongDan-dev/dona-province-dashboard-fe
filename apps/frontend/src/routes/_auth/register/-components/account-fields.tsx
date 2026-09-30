import { ErrorCode } from "@repo/zod-schemas/src/api/error.schema";
import type { CredentialPolicy } from "@repo/zod-schemas/src/entity/central-auth-schema";
import { usernameAvailabilitySchema } from "@repo/zod-schemas/src/entity/registration-schema";
import { useEffect, useRef, useState } from "react";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { clientAPI } from "@/config/clientAPI.config";

export const USERNAME_REASON: Record<string, string> = {
  TAKEN: "Tên đăng nhập đã có người dùng.",
  RESERVED: "Tên này được hệ thống giữ lại, hãy chọn tên khác.",
  INVALID: "Tên đăng nhập không hợp lệ.",
};

// Khớp giới hạn displayName của BE (1–100 ký tự).
const DISPLAY_NAME_MAX = 100;

/** Họ tên + tên đăng nhập (kiểm trùng khi gõ); báo lên form khi cả hai hợp lệ. */
export function AccountFields({
  policy,
  ensureRegId,
  displayName,
  setDisplayName,
  username,
  setUsername,
  serverError,
  onValidity,
}: {
  policy: CredentialPolicy | null;
  /** Phiên đăng ký chỉ được mở khi user thật sự bắt đầu (gõ tên đăng nhập). */
  ensureRegId: () => Promise<string | null>;
  displayName: string;
  setDisplayName: (v: string) => void;
  username: string;
  setUsername: (v: string) => void;
  serverError: string | null;
  onValidity: (valid: boolean) => void;
}) {
  const rule = policy?.username;
  const pattern = rule?.pattern ? new RegExp(rule.pattern) : null;
  const formatOk = !pattern || pattern.test(username);
  const availability = useUsernameAvailability(ensureRegId, formatOk && username ? username : null);
  const nameOk = displayName.trim().length > 0 && displayName.trim().length <= DISPLAY_NAME_MAX;
  const usernameError =
    serverError ??
    (username && !formatOk
      ? "Tên đăng nhập chưa đúng quy tắc bên dưới."
      : availability.status === "unavailable"
        ? USERNAME_REASON[availability.reason]
        : null);
  const valid =
    nameOk && !!username && formatOk && !usernameError && availability.status !== "checking";
  useEffect(() => onValidity(valid), [valid, onValidity]);

  return (
    <>
      <Field data-invalid={!nameOk && displayName !== ""}>
        <FieldLabel htmlFor="displayName">Họ và tên</FieldLabel>
        <Input
          id="displayName"
          value={displayName}
          maxLength={DISPLAY_NAME_MAX}
          autoComplete="name"
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
        {rule?.pattern && (
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
    </>
  );
}

type Availability =
  | { status: "idle" | "checking" | "available" | "skipped" }
  | { status: "unavailable"; reason: string };

/** Kiểm khi user ngừng gõ 400ms. Quá 30 lần / phiên (RATE_LIMITED) thì thôi, để lúc hoàn tất kiểm. */
function useUsernameAvailability(
  ensureRegId: () => Promise<string | null>,
  username: string | null,
): Availability {
  const [state, setState] = useState<Availability>({ status: "idle" });
  const stopped = useRef(false);
  const ensure = useRef(ensureRegId);
  ensure.current = ensureRegId;

  useEffect(() => {
    if (!username || stopped.current) {
      setState({ status: stopped.current ? "skipped" : "idle" });
      return;
    }
    let active = true;
    setState({ status: "checking" });
    const timer = setTimeout(async () => {
      const regId = await ensure.current();
      if (!active) return;
      if (!regId) return setState({ status: "skipped" });
      const res = await clientAPI.Registration.checkRegistrationUsername({
        params: { regId },
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
  }, [username]);

  return state;
}
