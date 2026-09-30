import { ERROR_DATA, ErrorCode, errorCodeZod } from "@repo/zod-schemas/src/api/error.schema";
import type { ErrorResponse } from "@repo/zod-schemas/src/api/response";
import { LogoutMode } from "@repo/zod-schemas/src/entity/central-auth-schema";
import {
  LinkAction,
  LinkOrigin,
  type LinkTransaction,
} from "@repo/zod-schemas/src/entity/link-transaction-schema";
import { type ReactNode, useEffect, useState } from "react";
import { SystemLogo } from "@/components/auth/system-logo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatSeconds } from "@/hooks/use-countdown";
import { useLogout } from "@/hooks/use-logout";
import { errorMessage, errorParam } from "@/lib/api-error";
import { msUntil, useSession } from "@/lib/session-store";
import type { Wizard } from "../-lib";

/** Khung chung mỗi bước: tên hệ thống xuất phát + đồng hồ đếm ngược hạn giao dịch. */
export function TxShell({
  tx,
  title,
  description,
  onExpire,
  children,
}: {
  tx: LinkTransaction;
  title: string;
  description?: ReactNode;
  /** Có thì hiện đếm ngược và gọi khi hết giờ (giao dịch còn đang chạy). */
  onExpire?: () => void;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <SystemLogo name={tx.provider.name} logoUrl={tx.provider.logoUrl} />
            {tx.provider.name}
          </span>
          {onExpire && <Countdown until={tx.expiresAt} onExpire={onExpire} />}
        </div>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

function Countdown({ until, onExpire }: { until: Date; onExpire: () => void }) {
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.ceil(msUntil(until) / 1000)));

  useEffect(() => {
    const timer = setInterval(() => {
      const left = Math.max(0, Math.ceil(msUntil(until) / 1000));
      setSeconds(left);
      if (left === 0) {
        clearInterval(timer);
        onExpire(); // BE là bên quyết hết hạn — đọc lại trạng thái giao dịch
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [until, onExpire]);

  return <span className="tabular-nums">Còn {formatSeconds(seconds)}</span>;
}

/** Thẻ một tài khoản (legacy hoặc Central) — dòng đơn vị chỉ hiện khi có. */
export function AccountCard({
  label,
  primary,
  secondary,
  tenantName,
}: {
  label: string;
  primary: string;
  secondary?: string;
  tenantName?: string | null;
}) {
  return (
    <div className="rounded-md border bg-muted/40 p-3 text-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{primary}</div>
      {secondary && <div>{secondary}</div>}
      {tenantName && <div className="text-muted-foreground">{tenantName}</div>}
    </div>
  );
}

export function LegacyAccountCard({ tx }: { tx: LinkTransaction }) {
  if (!tx.legacyAccount) return null;
  return (
    <AccountCard
      label={`Tài khoản ${tx.provider.name}`}
      primary={tx.legacyAccount.username}
      secondary={tx.legacyAccount.displayName}
      tenantName={tx.legacyAccount.tenantName}
    />
  );
}

export function ErrorAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert variant="destructive">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function BackToProvider({ tx, variant }: { tx: LinkTransaction; variant?: "outline" }) {
  // Liên kết từ Account Center: returnUrl luôn là /account/connections của chính Central.
  const label =
    tx.origin === LinkOrigin.ACCOUNT_CENTER
      ? "Về Liên kết tài khoản"
      : `Quay lại ${tx.provider.name}`;
  return tx.returnUrl ? (
    <Button asChild variant={variant}>
      <a href={tx.returnUrl}>{label}</a>
    </Button>
  ) : (
    <Button asChild variant={variant}>
      <a href="/">Về trang chủ</a>
    </Button>
  );
}

/** Đọc trạng thái giao dịch lỗi (không tìm thấy / hết hạn / không thuộc trình duyệt này). */
export function TxLoadError({ error, onRetry }: { error: ErrorResponse; onRetry: () => void }) {
  const gone =
    error.errorCode === ErrorCode.LinkTxNotFound || error.errorCode === ErrorCode.LinkTxExpired;
  const returnUrl = errorParam(error, "returnUrl", "string");

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {gone
            ? "Phiên liên kết đã hết hạn hoặc không thuộc trình duyệt này"
            : "Không tải được phiên liên kết"}
        </CardTitle>
        <CardDescription>
          {gone
            ? "Việc liên kết chỉ làm được trên đúng trình duyệt đã bắt đầu và trong 10 phút. Hãy quay lại hệ thống bạn đang dùng và bắt đầu lại."
            : errorMessage(error)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {!gone ? (
          <Button onClick={onRetry}>Thử lại</Button>
        ) : (
          <Button asChild>
            <a href={returnUrl ?? "/"}>{returnUrl ? "Bắt đầu lại" : "Về trang chủ"}</a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/** Chưa xác minh xong ở hệ thống cũ (hoặc xác minh lỗi, còn / hết lượt thử lại). */
export function AwaitingLegacy({ w, onCancel }: { w: Wizard; onCancel: () => void }) {
  const { tx } = w;
  const retry = w.can(LinkAction.RETRY_LEGACY_VERIFICATION) && tx.legacyVerifyUrl;
  const errorText = tx.lastErrorCode ? messageOf(tx.lastErrorCode) : null;

  return (
    <TxShell
      tx={tx}
      title={`Xác minh tài khoản ${tx.provider.name}`}
      onExpire={() => void w.reload()}
    >
      {errorText ? (
        <ErrorAlert
          message={
            retry
              ? errorText
              : `${errorText} Đã hết lượt xác minh, hãy bắt đầu lại từ ${tx.provider.name}.`
          }
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Đang chờ xác minh tài khoản tại {tx.provider.name}…
        </p>
      )}
      {retry && (
        <Button asChild>
          <a href={tx.legacyVerifyUrl!}>Xác minh lại</a>
        </Button>
      )}
      {!retry && errorText && <BackToProvider tx={tx} />}
      {w.can(LinkAction.CANCEL) && (
        <Button variant="outline" onClick={onCancel}>
          Hủy
        </Button>
      )}
    </TxShell>
  );
}

/** COMPLETED — reload trong 30 phút vẫn đọc được trạng thái giao dịch nên màn này dựng lại được. */
export function Completed({ tx }: { tx: LinkTransaction }) {
  return (
    <TxShell tx={tx} title="Đã liên kết thành công">
      <p className="text-sm">
        Tài khoản {tx.provider.name} đã được liên kết với tài khoản Thành Đoàn Đồng Nai Central của
        bạn. Từ nay bạn vào {tx.provider.name} bằng tài khoản này.
      </p>
      {tx.centralIdentity && (
        <AccountCard
          label="Tài khoản Thành Đoàn Đồng Nai Central"
          primary={tx.centralIdentity.displayName}
          secondary={tx.centralIdentity.maskedLoginId}
        />
      )}
      <LegacyAccountCard tx={tx} />
      <BackToProvider tx={tx} />
      {tx.origin !== LinkOrigin.ACCOUNT_CENTER && (
        <Button asChild variant="outline">
          <a href="/">Mở cổng tổng hợp</a>
        </Button>
      )}
    </TxShell>
  );
}

/** CANCELLED / FAILED / EXPIRED. Sau bước đăng nhập Central, phiên đã là của người vừa đăng
 * nhập → nói rõ và cho đăng xuất ngay (máy dùng chung). */
export function Ended({ tx }: { tx: LinkTransaction }) {
  const session = useSession();
  const runLogout = useLogout();
  const title =
    tx.state === "CANCELLED"
      ? "Đã hủy liên kết"
      : tx.state === "EXPIRED"
        ? "Phiên liên kết đã hết hạn"
        : "Không thể liên kết";
  const reason =
    tx.state === "FAILED" && tx.failureCode
      ? messageOf(tx.failureCode)
      : tx.state === "EXPIRED"
        ? "Việc liên kết phải hoàn tất trong 10 phút. Hãy bắt đầu lại từ hệ thống bạn đang dùng."
        : null;

  return (
    <TxShell tx={tx} title={title}>
      {reason && <ErrorAlert message={reason} />}
      {session?.authenticated && session.identity && (
        <Alert>
          <AlertDescription>
            Bạn đang đăng nhập với tên{" "}
            <span className="font-medium">{session.identity.displayName}</span>. Nếu đây không phải
            bạn, hãy đăng xuất.
          </AlertDescription>
        </Alert>
      )}
      <BackToProvider tx={tx} />
      {session?.authenticated && (
        <Button variant="outline" onClick={() => void runLogout(LogoutMode.LOGOUT)}>
          Đăng xuất
        </Button>
      )}
    </TxShell>
  );
}

/** Câu tiếng Việt cho mã lỗi dạng chuỗi (lastErrorCode / failureCode của giao dịch). */
export function messageOf(code: string) {
  const parsed = errorCodeZod.safeParse(code);
  return parsed.success
    ? ERROR_DATA[parsed.data].message
    : "Đã có lỗi xảy ra. Hãy bắt đầu lại từ hệ thống bạn đang dùng.";
}
