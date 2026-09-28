import { ErrorCode } from "@repo/zod-schemas/src/api/error.schema";
import {
  accountSecuritySchema,
  type PendingContact,
} from "@repo/zod-schemas/src/entity/account-center-schema";
import { OtpChannel } from "@repo/zod-schemas/src/entity/link-transaction-schema";
import { format } from "date-fns";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { clientAPI } from "@/config/clientAPI.config";
import { formatSeconds, useCountdown, useSecondsUntil } from "@/hooks/use-countdown";
import { errorMessage, errorParam } from "@/lib/api-error";
import { isValidContact, normalizeContact } from "@/lib/contact-validation";
import { type MySecurityDTO, mySecurityRepository } from "@/repositories/mySecurity.repository";
import { useStartMerge } from "./merge-card";

// S12a / S12c — kênh liên lạc (D24 / D20c). Mỗi tài khoản tối đa 1 SĐT + 1 email (TASK-005 Q4).
// Email là định danh chính (TASK-008): chỉ đổi, không gỡ; SĐT tùy chọn, gỡ được.
// Gửi mã / gỡ cần xác thực lại (S2 tự mở).
const LABEL = { [OtpChannel.SMS]: "Số điện thoại", [OtpChannel.EMAIL]: "Email" } as const;
type Channel = (typeof OtpChannel)[keyof typeof OtpChannel];

/** Response D24 verify / D20c là D20a mới → ghi thẳng vào cache, khỏi gọi lại. */
const applySecurity = (data: unknown) =>
  mySecurityRepository().updateCache(accountSecuritySchema.parse(data));

export function ContactsCard({ security }: { security: MySecurityDTO }) {
  const find = (ch: Channel) => security.contacts.find((c) => c.channel === ch) ?? null;
  const pending = (ch: Channel) => security.pendingContacts.find((c) => c.channel === ch) ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Kênh liên lạc</CardTitle>
        <CardDescription>
          Dùng để đăng nhập và lấy lại mật khẩu. Email là định danh chính của tài khoản; số điện
          thoại tùy chọn.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {[OtpChannel.EMAIL, OtpChannel.SMS].map((ch) => (
          <ContactRow key={ch} channel={ch} current={find(ch)} pending={pending(ch)} />
        ))}
      </CardContent>
    </Card>
  );
}

function ContactRow({
  channel,
  current,
  pending,
}: {
  channel: Channel;
  current: MySecurityDTO["contacts"][number] | null;
  pending: PendingContact | null;
}) {
  const [editing, setEditing] = useState(false);
  const open = editing || !!pending;

  return (
    <div className="flex flex-col gap-2 border-b pb-4 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-muted-foreground">{LABEL[channel]}</div>
          {current ? (
            <div>
              <span className="font-medium">{current.maskedDestination}</span>{" "}
              <span className="text-muted-foreground">
                (đã xác minh {format(current.verifiedAt, "dd/MM/yyyy")})
              </span>
            </div>
          ) : (
            <div className="text-muted-foreground">Chưa có</div>
          )}
        </div>
        {!open && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              {current ? "Đổi" : `Thêm ${LABEL[channel].toLowerCase()}`}
            </Button>
            {/* Email là định danh chính → chỉ đổi (BE vẫn chặn gỡ bằng LAST_AUTH_METHOD). */}
            {current && channel === OtpChannel.SMS && <RemovePhoneButton />}
          </div>
        )}
      </div>
      {open && (
        <ContactOtpForm
          channel={channel}
          pending={pending}
          replacing={!!current}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

/**
 * Gửi mã → nhập mã. Mã đang chờ lấy từ pendingContacts (reload vẫn dựng lại được).
 * `onClose` null = bắt buộc (màn thêm email): không có nút Hủy / Đóng.
 */
export function ContactOtpForm({
  channel,
  pending,
  replacing,
  onClose,
}: {
  channel: Channel;
  pending: PendingContact | null;
  replacing: boolean;
  onClose: (() => void) | null;
}) {
  const [destination, setDestination] = useState("");
  const [enteringNew, setEnteringNew] = useState(!pending);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [usedByOther, setUsedByOther] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useCountdown();
  const resendIn = useSecondsUntil(pending?.resendAvailableAt ?? null);
  const merge = useStartMerge();
  const label = LABEL[channel].toLowerCase();

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
    setUsedByOther(false);
    const res = await clientAPI.AccountCenter.addMyContact({
      body: { channel, destination: dest },
    });
    setBusy(false);
    if (res.success) {
      setDestination(dest);
      setEnteringNew(false);
      setCode("");
      return mySecurityRepository().invalidate(); // pendingContacts mới
    }
    if (res.errorCode === ErrorCode.RateLimited) {
      lock.start(errorParam(res, "retryAfterSeconds", "number") ?? 60);
    }
    setError(
      res.errorCode === ErrorCode.ValidationError
        ? `${LABEL[channel]} không hợp lệ hoặc trùng với ${label} hiện tại.`
        : res.errorCode === ErrorCode.ReauthRequired
          ? "Cần xác nhận lại mật khẩu để thay đổi kênh liên lạc."
          : errorMessage(res),
    );
  }

  async function verify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!code.trim()) return setError("Vui lòng nhập mã xác minh");
    setBusy(true);
    setError(null);
    const res = await clientAPI.AccountCenter.verifyMyContact({
      body: { channel, code: code.trim() },
    });
    setBusy(false);
    if (res.success) {
      applySecurity(res.data);
      toast.success(replacing ? `Đã đổi ${label}.` : `Đã thêm ${label}.`);
      return onClose?.();
    }
    if (res.errorCode === ErrorCode.OtpInvalid) {
      const left = errorParam(res, "attemptsRemaining", "number");
      return setError(
        left === null ? "Mã xác minh không đúng." : `Mã xác minh không đúng. Còn ${left} lần thử.`,
      );
    }
    // CONTACT_ALREADY_USED hủy mã; OTP_EXPIRED / TOO_MANY cũng vậy → đọc lại pendingContacts.
    void mySecurityRepository().invalidate();
    setUsedByOther(res.errorCode === ErrorCode.ContactAlreadyUsed);
    setError(errorMessage(res));
  }

  const hint = usedByOther && (
    <p className="text-sm">
      Có thể bạn có một tài khoản Thành Đoàn Đồng Nai Central khác dùng {label} này.{" "}
      <Button
        variant="link"
        className="h-auto p-0"
        disabled={merge.starting}
        onClick={() => void merge.start()}
      >
        Gộp tài khoản
      </Button>
    </p>
  );

  if (!pending || enteringNew) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(String(new FormData(e.currentTarget).get("destination") ?? ""));
        }}
        noValidate
        className="flex flex-col gap-2 rounded-md bg-muted/40 p-3"
      >
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor={`contact-${channel}`}>
            {replacing ? `${LABEL[channel]} mới` : LABEL[channel]}
          </FieldLabel>
          <Input
            id={`contact-${channel}`}
            name="destination"
            type={channel === OtpChannel.SMS ? "tel" : "email"}
            autoComplete={channel === OtpChannel.SMS ? "tel" : "email"}
            defaultValue={destination}
            autoFocus
          />
          {replacing && (
            <FieldDescription>
              Sau khi xác minh, {label} mới sẽ thay {label} hiện tại.
            </FieldDescription>
          )}
          {error && <FieldError>{error}</FieldError>}
        </Field>
        {hint}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={busy || lock.secondsLeft > 0}>
            {busy && <Spinner />}
            {lock.secondsLeft > 0
              ? `Gửi mã sau ${formatSeconds(lock.secondsLeft)}`
              : "Gửi mã xác minh"}
          </Button>
          {(pending || onClose) && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={pending ? () => setEnteringNew(false) : (onClose ?? undefined)}
            >
              {pending ? "Thôi, nhập mã đã gửi" : "Hủy"}
            </Button>
          )}
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={verify} noValidate className="flex flex-col gap-2 rounded-md bg-muted/40 p-3">
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor={`code-${channel}`}>Mã xác minh</FieldLabel>
        <FieldDescription>
          Đã gửi mã tới {pending.maskedDestination}, hết hạn lúc{" "}
          {format(pending.expiresAt, "HH:mm")}. Còn {pending.sendsRemaining} lần gửi.
        </FieldDescription>
        <Input
          id={`code-${channel}`}
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoFocus
        />
        {error && <FieldError>{error}</FieldError>}
      </Field>
      {hint}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy && <Spinner />}
          Xác minh
        </Button>
        {destination && pending.sendsRemaining > 0 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || resendIn > 0 || lock.secondsLeft > 0}
            onClick={() => void send(destination)}
          >
            {resendIn > 0 ? `Gửi lại sau ${formatSeconds(resendIn)}` : "Gửi lại mã"}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="link"
          className="h-auto p-0"
          onClick={() => setEnteringNew(true)}
        >
          Dùng {channel === OtpChannel.SMS ? "số" : "email"} khác
        </Button>
        {onClose && (
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            Đóng
          </Button>
        )}
      </div>
    </form>
  );
}

/** D20c — chỉ SĐT gỡ được (cần xác thực lại). */
function RemovePhoneButton() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function remove() {
    setPending(true);
    const res = await clientAPI.AccountCenter.removeMyContact({
      params: { channel: OtpChannel.SMS },
    });
    setPending(false);
    setOpen(false);
    if (res.success) {
      applySecurity(res.data);
      return toast.success("Đã gỡ số điện thoại.");
    }
    toast.error(
      res.errorCode === ErrorCode.ReauthRequired
        ? "Cần xác nhận lại mật khẩu để gỡ số điện thoại."
        : errorMessage(res),
    );
    void mySecurityRepository().invalidate();
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Gỡ
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Gỡ số điện thoại?</AlertDialogTitle>
          <AlertDialogDescription>
            Bạn sẽ không đăng nhập hay lấy lại mật khẩu bằng số này được nữa. Một thông báo sẽ được
            gửi tới số này và email của bạn.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Không</AlertDialogCancel>
          <Button variant="destructive" disabled={pending} onClick={() => void remove()}>
            {pending && <Spinner />}
            Gỡ số điện thoại
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
