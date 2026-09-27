import { ErrorCode } from "@repo/zod-schemas/src/api/error.schema";
import {
  LinkAction,
  OtpChannel,
  otpVerifyResultSchema,
} from "@repo/zod-schemas/src/entity/link-transaction-schema";
import { format } from "date-fns";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { clientAPI } from "@/config/clientAPI.config";
import { formatSeconds, useCountdown, useSecondsUntil } from "@/hooks/use-countdown";
import { errorParam } from "@/lib/api-error";
import { isValidContact, normalizeContact } from "@/lib/contact-validation";
import type { Wizard } from "../-lib";

const LABEL = { [OtpChannel.SMS]: "Số điện thoại", [OtpChannel.EMAIL]: "Email" } as const;

const SWITCHED_NOTICE = {
  [OtpChannel.SMS]:
    'Số điện thoại này đã gắn với một tài khoản SSO — nhiều khả năng bạn đã có tài khoản. Hãy đăng nhập tài khoản đó để liên kết. Nếu số này không phải của bạn, chọn "Tôi chưa có tài khoản SSO — tạo mới" và dùng số khác.',
  [OtpChannel.EMAIL]:
    'Email này đã gắn với một tài khoản SSO — nhiều khả năng bạn đã có tài khoản. Hãy đăng nhập tài khoản đó để liên kết. Nếu email này không phải của bạn, chọn "Tôi chưa có tài khoản SSO — tạo mới" và dùng email khác.',
} as const;

/**
 * Một kênh liên lạc trong F7: nhập → gửi mã → nhập mã. Trạng thái (đã xác minh / mã đang chờ)
 * lấy từ D9 nên reload vẫn dựng lại được; riêng giá trị chưa che chỉ nằm trong bộ nhớ tab —
 * mất thì muốn gửi lại phải nhập lại.
 */
export function OtpChannelBlock({ w, channel }: { w: Wizard; channel: OtpChannel }) {
  const { tx } = w;
  const label = LABEL[channel];
  const verified = tx.verifiedContacts?.find((c) => c.channel === channel);
  const pending = tx.pendingOtps?.find((c) => c.channel === channel);

  const [editing, setEditing] = useState(!verified && !pending);
  const [destination, setDestination] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useCountdown();
  const resendIn = useSecondsUntil(pending?.resendAvailableAt ?? null);

  async function send(value: string) {
    const dest = normalizeContact(channel, value);
    if (!isValidContact(channel, dest)) {
      return setError(
        channel === OtpChannel.SMS
          ? "Số điện thoại di động không hợp lệ (10 số, đầu 03/05/07/08/09)"
          : "Email không hợp lệ",
      );
    }
    setBusy(true);
    setError(null);
    const res = await clientAPI.LinkTransaction.sendLinkOtp({
      params: { txId: w.txId },
      body: { channel, destination: dest },
    });
    setBusy(false);
    if (res.success) {
      setDestination(dest);
      setEditing(false);
      setCode("");
      return w.reload(); // pendingOtps + allowedActions mới
    }
    if (res.errorCode === ErrorCode.RateLimited) {
      lock.start(errorParam(res, "retryAfterSeconds", "number") ?? 60);
    }
    setError(res.errorCode === ErrorCode.ValidationError ? `${label} không hợp lệ` : w.fail(res));
  }

  async function verify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!code.trim()) return setError("Vui lòng nhập mã xác minh");
    setBusy(true);
    setError(null);
    const res = await clientAPI.LinkTransaction.verifyLinkOtp({
      params: { txId: w.txId },
      body: { channel, code: code.trim() },
    });
    setBusy(false);
    if (res.success) {
      const result = otpVerifyResultSchema.parse(res.data);
      setCode("");
      if (result.contactBelongsToExistingIdentity) w.setNotice(SWITCHED_NOTICE[channel]);
      return w.setTx(result.transaction);
    }
    if (res.errorCode === ErrorCode.OtpInvalid) {
      const left = errorParam(res, "attemptsRemaining", "number");
      return setError(
        left === null ? "Mã xác minh không đúng." : `Mã xác minh không đúng. Còn ${left} lần thử.`,
      );
    }
    setError(w.fail(res));
    // Mã hết hạn / bị khóa thì không còn trong pendingOtps → đọc lại để hiện ô gửi mã mới.
    if (res.errorCode === ErrorCode.OtpExpired || res.errorCode === ErrorCode.OtpTooManyAttempts) {
      await w.reload();
    }
  }

  const canSend = w.can(LinkAction.SEND_OTP);
  const lockedFor = Math.max(lock.secondsLeft, resendIn);

  // Đã xác minh, không đang đổi.
  if (verified && !editing && !pending) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
        <span>
          ✓ {label}: <span className="font-medium">{verified.maskedDestination}</span> đã xác minh
        </span>
        {canSend && (
          <Button variant="link" className="h-auto p-0" onClick={() => setEditing(true)}>
            Đổi
          </Button>
        )}
      </div>
    );
  }

  // Có mã đang chờ nhập.
  if (pending && !editing) {
    return (
      <form onSubmit={verify} noValidate className="flex flex-col gap-2 rounded-md border p-3">
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor={`otp-${channel}`}>Mã xác minh {label.toLowerCase()}</FieldLabel>
          <FieldDescription>
            Đã gửi mã tới {pending.maskedDestination}, hết hạn lúc{" "}
            {format(pending.expiresAt, "HH:mm")}.
          </FieldDescription>
          <Input
            id={`otp-${channel}`}
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          {error && <FieldError>{error}</FieldError>}
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={busy || !w.can(LinkAction.VERIFY_OTP)}>
            {busy && <Spinner />}
            Xác minh
          </Button>
          {destination && canSend && pending.sendsRemaining > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || lockedFor > 0}
              onClick={() => void send(destination)}
            >
              {lockedFor > 0 ? `Gửi lại sau ${formatSeconds(lockedFor)}` : "Gửi lại mã"}
            </Button>
          )}
          {canSend && (
            <Button
              type="button"
              size="sm"
              variant="link"
              className="h-auto p-0"
              onClick={() => setEditing(true)}
            >
              Dùng {channel === OtpChannel.SMS ? "số" : "email"} khác
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Còn {pending.sendsRemaining} lần gửi mã cho {label.toLowerCase()} này.
        </p>
      </form>
    );
  }

  // Nhập số / email để gửi mã.
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send(String(new FormData(e.currentTarget).get("destination") ?? ""));
      }}
      noValidate
      className="flex flex-col gap-2 rounded-md border p-3"
    >
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor={`dest-${channel}`}>{label}</FieldLabel>
        <Input
          id={`dest-${channel}`}
          name="destination"
          type={channel === OtpChannel.SMS ? "tel" : "email"}
          autoComplete={channel === OtpChannel.SMS ? "tel" : "email"}
          placeholder={channel === OtpChannel.SMS ? "09xxxxxxxx" : "ten@example.com"}
          defaultValue={destination}
        />
        {error && <FieldError>{error}</FieldError>}
      </Field>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={busy || !canSend || lock.secondsLeft > 0}>
          {busy && <Spinner />}
          {lock.secondsLeft > 0
            ? `Gửi mã sau ${formatSeconds(lock.secondsLeft)}`
            : "Gửi mã xác minh"}
        </Button>
        {(verified || pending) && (
          <Button
            type="button"
            size="sm"
            variant="link"
            className="h-auto p-0"
            onClick={() => {
              setEditing(false);
              setError(null);
            }}
          >
            Thôi, giữ {pending ? "mã đã gửi" : verified?.maskedDestination}
          </Button>
        )}
      </div>
    </form>
  );
}
