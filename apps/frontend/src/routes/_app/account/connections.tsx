import { SSO_STATUS_LABEL, SsoStatus } from "@repo/zod-schemas/src/entity/connection-schema";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { SystemLogo } from "@/components/auth/system-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { findMyConnectionsRepository } from "@/repositories/findMyConnections.repository";
import { useStartLink } from "../-components/use-start-link";
import { UnlinkButton } from "./-components/unlink-button";

// S9 — Liên kết tài khoản: xem, liên kết (F6) và hủy liên kết (D17).
export const Route = createFileRoute("/_app/account/connections")({
  loader: () => findMyConnectionsRepository().loader(),
  component: ConnectionsPage,
});

const fmt = (d: Date) => format(d, "dd/MM/yyyy HH:mm");

function ConnectionsPage() {
  const { data, isLoading, isError, refetch } = findMyConnectionsRepository().useQuery();
  const { start, redirecting } = useStartLink();

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Liên kết tài khoản</h1>
        <p className="text-sm text-muted-foreground">
          Các tài khoản ở hệ thống khác đã liên kết với tài khoản của bạn.
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
                            ? `Lần vào bằng Central gần nhất: ${fmt(account.lastSsoLoginAt)}`
                            : "Chưa vào bằng Central"}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1 text-muted-foreground">Chưa liên kết.</div>
                    )}
                  </div>
                  {account ? (
                    <UnlinkButton connection={c} account={account} />
                  ) : (
                    c.linkEnabled && (
                      <Button
                        size="sm"
                        disabled={redirecting !== null}
                        onClick={() => void start(c)}
                      >
                        {redirecting === c.providerCode && <Spinner />}
                        {redirecting === c.providerCode
                          ? `Đang chuyển tới ${c.providerName}…`
                          : "Liên kết"}
                      </Button>
                    )
                  )}
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
