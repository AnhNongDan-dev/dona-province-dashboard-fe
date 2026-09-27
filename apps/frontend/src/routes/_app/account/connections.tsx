import { SSO_STATUS_LABEL, SsoStatus } from "@repo/zod-schemas/src/entity/connection-schema";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { SystemLogo } from "@/components/auth/system-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { findMyConnectionsRepository } from "@/repositories/findMyConnections.repository";

// S9 — Liên kết tài khoản (GĐ A chỉ xem; liên kết / hủy liên kết từ đây thuộc GĐ B).
export const Route = createFileRoute("/_app/account/connections")({
  loader: () => findMyConnectionsRepository().loader(),
  component: ConnectionsPage,
});

const fmt = (d: Date) => format(d, "dd/MM/yyyy HH:mm");

function ConnectionsPage() {
  const { data, isLoading, isError, refetch } = findMyConnectionsRepository().useQuery();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Liên kết tài khoản</h1>
        <p className="text-sm text-muted-foreground">
          Các tài khoản ở hệ thống khác đã liên kết với tài khoản SSO của bạn.
        </p>
      </div>
      {isError ? (
        <div className="flex items-center gap-3 text-sm text-destructive">
          Không tải được danh sách liên kết.
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            Thử lại
          </Button>
        </div>
      ) : isLoading ? (
        <Skeleton className="h-40" />
      ) : (
        <Card>
          <CardContent className="divide-y">
            {data.map((c) => {
              const account = c.accounts[0];
              return (
                <div key={c.providerCode} className="flex items-start gap-3 py-4">
                  <SystemLogo
                    name={c.providerName}
                    logoUrl={c.logoUrl}
                    className="size-8 text-sm"
                  />
                  <div className="flex-1 text-sm">
                    <div className="flex items-center gap-2 font-medium">
                      {c.providerName}
                      {c.status !== SsoStatus.AVAILABLE && (
                        <Badge variant="secondary">{SSO_STATUS_LABEL[c.status]}</Badge>
                      )}
                    </div>
                    {account ? (
                      <div className="mt-1 text-muted-foreground">
                        <div>
                          <span className="text-foreground">{account.username}</span> ·{" "}
                          {account.displayName}
                          {account.tenantName && ` · ${account.tenantName}`}
                        </div>
                        <div>Liên kết lúc {fmt(account.linkedAt)}</div>
                        <div>
                          {account.lastSsoLoginAt
                            ? `Lần đăng nhập SSO gần nhất: ${fmt(account.lastSsoLoginAt)}`
                            : "Chưa đăng nhập SSO"}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1 text-muted-foreground">
                        Chưa liên kết.
                        {c.status === SsoStatus.AVAILABLE &&
                          ` Đăng nhập ${c.providerName} để liên kết.`}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {data.length === 0 && (
              <p className="py-4 text-sm text-muted-foreground">
                Chưa có hệ thống nào được đăng ký.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
