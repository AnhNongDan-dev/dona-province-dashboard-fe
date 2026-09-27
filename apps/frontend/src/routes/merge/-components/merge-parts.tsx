import { APP_CONFIG } from "@repo/shared/src/app-config";
import { ERROR_DATA, errorCodeZod } from "@repo/zod-schemas/src/api/error.schema";
import { OtpChannel } from "@repo/zod-schemas/src/entity/link-transaction-schema";
import type {
  MergeAccount,
  MergeIdentity,
} from "@repo/zod-schemas/src/entity/merge-transaction-schema";
import type { ReactNode } from "react";
import { SystemLogo } from "@/components/auth/system-logo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatSeconds } from "@/hooks/use-countdown";

/** Khung trang gộp: ngoài layout ứng dụng để lỗi phiên được xử lý tại chỗ (TASK-005). */
export function MergeShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-muted/40">
      <header className="flex h-14 items-center gap-2 border-b border-border/50 bg-background px-6">
        <img src="/app-icon.svg" alt="" className="size-7" />
        <span className="font-semibold">{APP_CONFIG.NAME}</span>
        <span className="text-muted-foreground">· Gộp tài khoản</span>
      </header>
      <main className="mx-auto w-full max-w-3xl p-6">{children}</main>
    </div>
  );
}

export function StepCard({
  title,
  description,
  secondsLeft,
  children,
}: {
  title: string;
  description?: ReactNode;
  /** Có thì hiện đồng hồ đếm ngược hạn giao dịch. */
  secondsLeft?: number;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <CardTitle>{title}</CardTitle>
          {secondsLeft !== undefined && (
            <span className="text-sm tabular-nums text-muted-foreground">
              Còn {formatSeconds(secondsLeft)}
            </span>
          )}
        </div>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

const CHANNEL_LABEL = { [OtpChannel.SMS]: "SĐT", [OtpChannel.EMAIL]: "Email" } as const;

export function accountLine(a: MergeAccount) {
  return [a.username, a.displayName, a.tenantName].filter(Boolean).join(" · ");
}

/** Một cột của màn xác nhận: chỉ tên + định danh đã che (không lộ username — máy dùng chung). */
export function IdentityColumn({
  heading,
  tone,
  identity,
}: {
  heading: string;
  tone: "keep" | "drop";
  identity: MergeIdentity;
}) {
  return (
    <div
      className={
        tone === "keep"
          ? "rounded-md border border-primary/40 p-4 text-sm"
          : "rounded-md border border-destructive/40 p-4 text-sm"
      }
    >
      <div
        className={
          tone === "keep" ? "font-semibold text-primary" : "font-semibold text-destructive"
        }
      >
        {heading}
      </div>
      <div className="mt-2 font-medium">{identity.displayName}</div>
      <div className="text-muted-foreground">{identity.maskedLoginId}</div>
      {identity.contacts.map((c) => (
        <div key={c.channel} className="text-muted-foreground">
          {CHANNEL_LABEL[c.channel]}: {c.maskedDestination}
        </div>
      ))}
      <div className="mt-3 text-xs font-medium uppercase text-muted-foreground">
        Hệ thống đã liên kết
      </div>
      {identity.accounts.length === 0 ? (
        <div className="text-muted-foreground">Chưa liên kết hệ thống nào</div>
      ) : (
        <ul className="mt-1 flex flex-col gap-1">
          {identity.accounts.map((a) => (
            <li key={a.providerCode} className="flex items-center gap-2">
              <SystemLogo name={a.providerName} logoUrl={null} />
              <span>
                <span className="font-medium">{a.providerName}</span>
                <span className="text-muted-foreground"> — {accountLine(a)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
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

/** Câu tiếng Việt cho failureCode (chuỗi) của giao dịch. */
export function failureMessage(code: string | null) {
  const parsed = errorCodeZod.safeParse(code);
  return parsed.success
    ? ERROR_DATA[parsed.data].message
    : "Không thể hoàn tất việc gộp. Hãy thử lại từ trang Bảo mật.";
}

export function contactText(c: { channel: string; maskedDestination: string }) {
  return c.channel === OtpChannel.SMS
    ? `Số ${c.maskedDestination}`
    : `Email ${c.maskedDestination}`;
}
