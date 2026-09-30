import { ErrorCode } from "@repo/zod-schemas/src/api/error.schema";
import {
  accountSecuritySchema,
  type PendingContact,
} from "@repo/zod-schemas/src/entity/account-center-schema";
import { OtpChannel } from "@repo/zod-schemas/src/entity/link-transaction-schema";
import { format } from "date-fns";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { clientAPI } from "@/config/clientAPI.config";
import { formatSeconds, useCountdown, useSecondsUntil } from "@/hooks/use-countdown";
import { errorMessage, errorParam } from "@/lib/api-error";
import {
  isValidEmail,
  isValidPhone,
  normalizePhone,
  PHONE_FORMAT_ERROR,
} from "@/lib/contact-validation";
import { type MySecurityDTO, mySecurityRepository } from "@/repositories/mySecurity.repository";
import { useStartMerge } from "./merge-card";

// Mục Liên lạc. Email là định danh chính: đổi bằng mã gửi tới email mới, không
// gỡ; gửi mã cần xác thực lại (hộp xác thực lại tự mở). SĐT chỉ là thông tin tự khai, không xác
// minh.

/** Response xác minh email là thông tin bảo mật mới → ghi thẳng vào cache, khỏi gọi lại. */
const applySecurity = (data: unknown) =>
  mySecurityRepository().updateCache(accountSecuritySchema.parse(data));

export function ContactsCard({ security }: { security: MySecurityDTO }) {
  const email = security.contacts.find((c) => c.channel === OtpChannel.EMAIL) ?? null;
  const pending = security.pendingContacts.find((c) => c.channel === OtpChannel.EMAIL) ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Liên lạc</CardTitle>
        <CardDescription>
          Email là định danh chính: dùng để đăng nhập và lấy lại mật khẩu. Số điện thoại chỉ là
          thông tin liên hệ, không bắt buộc.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <EmailRow current={email} pending={pending} />
        <PhoneRow phone={security.phone} />
      </CardContent>
    </Card>
  );
}

function EmailRow({
  current,
  pending,
}: {
  current: MySecurityDTO["contacts"][number] | null;
  pending: PendingContact | null;
}) {
  const [editing, setEditing] = useState(false);
  const open = editing || !!pending;

  return (
    <div className="flex flex-col gap-2 border-b pb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-muted-foreground">Email</div>
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
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            {current ? "Đổi" : "Thêm email"}
          </Button>
        )}
      </div>
      {open && (
        <ContactOtpForm pending={pending} replacing={!!current} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}

/** SĐT tự khai: sửa / xóa trực tiếp, không mã, không cần xác thực lại. */
function PhoneRow({ phone }: { phone: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(next: string | null) {
    if (next !== null && !isValidPhone(next)) return setError(PHONE_FORMAT_ERROR);
    setBusy(true);
    setError(null);
    const res = await clientAPI.AccountCenter.updateMyPhone({ body: { phone: next } });
    setBusy(false);
    if (res.success) {
      mySecurityRepository().updateCache({ phone: res.data.phone });
      setEditing(false);
      return toast.success(next ? "Đã lưu số điện thoại." : "Đã xóa số điện thoại.");
    }
    const field = res.errors.find((e) => e.fieldName === "phone");
    setError(field?.message ?? (field ? PHONE_FORMAT_ERROR : errorMessage(res)));
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-muted-foreground">Số điện thoại</div>
          <div className={phone ? "font-medium" : "text-muted-foreground"}>
            {phone ?? "Chưa khai"}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setValue(phone ?? "");
            setError(null);
            setEditing(true);
          }}
        >
          {phone ? "Sửa" : "Thêm số điện thoại"}
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = normalizePhone(value);
        void save(v === "" ? null : v);
      }}
      noValidate
      className="flex flex-col gap-2 rounded-md bg-muted/40 p-3"
    >
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor="phone">Số điện thoại</FieldLabel>
        <Input
          id="phone"
          type="tel"
          autoComplete="tel"
          placeholder="09xxxxxxxx"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
        <FieldDescription>
          Chỉ để liên hệ — không dùng để đăng nhập hay lấy lại mật khẩu.
        </FieldDescription>
        {error && <FieldError>{error}</FieldError>}
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy && <Spinner />}
          Lưu
        </Button>
        {phone && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void save(null)}
          >
            Xóa số
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Hủy
        </Button>
      </div>
    </form>
  );
}

/**
 * Thêm / đổi email: nhập địa chỉ → [Gửi mã] (BE gửi mã tới địa chỉ mới) → nhập mã. Mã đang chờ lấy
 * từ pendingContacts (reload vẫn dựng lại được). `onClose` null = bắt buộc (màn thêm email): không có
 * nút Hủy / Đóng.
 */
export function ContactOtpForm({
  pending,
  replacing,
  onClose,
}: {
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

  async function send(value: string) {
    const dest = value.trim();
    if (!isValidEmail(dest)) return setError("Email không hợp lệ");
    setBusy(true);
    setError(null);
    setUsedByOther(false);
    const res = await clientAPI.AccountCenter.addMyContact({
      body: { channel: OtpChannel.EMAIL, destination: dest },
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
        ? "Email không hợp lệ hoặc trùng với email hiện tại."
        : res.errorCode === ErrorCode.ReauthRequired
          ? "Cần xác nhận lại mật khẩu để đổi email."
          : errorMessage(res),
    );
  }

  async function verify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!code.trim()) return setError("Vui lòng nhập mã xác minh");
    setBusy(true);
    setError(null);
    const res = await clientAPI.AccountCenter.verifyMyContact({
      body: { channel: OtpChannel.EMAIL, code: code.trim() },
    });
    setBusy(false);
    if (res.success) {
      applySecurity(res.data);
      toast.success(replacing ? "Đã đổi email." : "Đã thêm email.");
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
      Có thể bạn có một tài khoản Thành Đoàn Đồng Nai Central khác dùng email này.{" "}
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
          <FieldLabel htmlFor="contact-email">{replacing ? "Email mới" : "Email"}</FieldLabel>
          <Input
            id="contact-email"
            name="destination"
            type="email"
            autoComplete="email"
            defaultValue={destination}
            autoFocus
          />
          <FieldDescription>
            Mã xác minh sẽ được gửi tới email này
            {replacing ? "; sau khi xác minh, email mới sẽ thay email hiện tại." : "."}
          </FieldDescription>
          {error && <FieldError>{error}</FieldError>}
        </Field>
        {hint}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={busy || lock.secondsLeft > 0}>
            {busy && <Spinner />}
            {lock.secondsLeft > 0 ? `Thử lại sau ${formatSeconds(lock.secondsLeft)}` : "Lưu"}
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
        <FieldLabel htmlFor="code-email">Mã xác minh</FieldLabel>
        <FieldDescription>
          Đã gửi mã tới {pending.maskedDestination}, hết hạn lúc{" "}
          {format(pending.expiresAt, "HH:mm")}. Không thấy thư? Kiểm tra thư mục Spam / Quảng cáo.
        </FieldDescription>
        <Input
          id="code-email"
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
          Dùng email khác
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
