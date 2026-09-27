import { SSO_STATUS_LABEL, SsoStatus } from "@repo/zod-schemas/src/entity/connection-schema";
import { createFileRoute } from "@tanstack/react-router";
import { SystemLogo } from "@/components/auth/system-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  findMyConnectionsRepository,
  type MyConnectionDTO,
} from "@/repositories/findMyConnections.repository";

// S8 — trang mở các hệ thống. Mỗi ô một hệ thống đã đăng ký với Central (D16).
export const Route = createFileRoute("/_app/")({
  loader: () => findMyConnectionsRepository().loader(),
  component: DashboardPage,
});

function DashboardPage() {
  const { data, isLoading, isError, refetch } = findMyConnectionsRepository().useQuery();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <h1 className="text-xl font-semibold">Các hệ thống</h1>
      {isError ? (
        <div className="flex items-center gap-3 text-sm text-destructive">
          Không tải được danh sách hệ thống.
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            Thử lại
          </Button>
        </div>
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <p className="text-muted-foreground">Chưa có hệ thống nào được đăng ký.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((c) => (
            <SystemTile key={c.providerCode} connection={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function SystemTile({ connection: c }: { connection: MyConnectionDTO }) {
  const account = c.accounts[0]; // GĐ A–C: tối đa 1 account / hệ thống

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3">
        <SystemLogo name={c.providerName} logoUrl={c.logoUrl} className="size-8 text-sm" />
        <CardTitle className="flex-1 text-base">{c.providerName}</CardTitle>
        {c.status !== SsoStatus.AVAILABLE && (
          <Badge variant="secondary">{SSO_STATUS_LABEL[c.status]}</Badge>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {account ? (
          <p className="text-muted-foreground">
            Đã liên kết: <span className="font-medium text-foreground">{account.username}</span>
          </p>
        ) : (
          c.status === SsoStatus.AVAILABLE && (
            <p className="text-muted-foreground">
              Chưa liên kết — đăng nhập {c.providerName} để liên kết.
            </p>
          )
        )}
        {c.launchUrl ? (
          <Button asChild>
            <a href={c.launchUrl}>Mở</a>
          </Button>
        ) : (
          !account &&
          c.status === SsoStatus.AVAILABLE &&
          c.homeUrl && (
            <Button asChild variant="outline">
              <a href={c.homeUrl}>Đến {c.providerName}</a>
            </Button>
          )
        )}
      </CardContent>
    </Card>
  );
}
