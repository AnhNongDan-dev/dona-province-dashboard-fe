import { SSO_STATUS_LABEL, SsoStatus } from "@repo/zod-schemas/src/entity/connection-schema";
import { createFileRoute } from "@tanstack/react-router";
import { SystemLogo } from "@/components/auth/system-logo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  findMyConnectionsRepository,
  type MyConnectionDTO,
} from "@/repositories/findMyConnections.repository";
import { useStartLink } from "./-components/use-start-link";

// Trang mở các hệ thống. Mỗi ô một hệ thống đã đăng ký với Central.
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
        <>
          {/* Tài khoản mới đăng ký chưa có quyền gì ở hệ thống nào — mời liên kết. */}
          {data.every((c) => c.accounts.length === 0) && (
            <Alert>
              <AlertDescription>
                <span>
                  <span className="font-medium text-foreground">
                    Liên kết các tài khoản hệ thống của bạn.
                  </span>{" "}
                  Bấm Liên kết ở hệ thống bạn đang có tài khoản để từ nay vào hệ thống đó bằng tài
                  khoản này.
                </span>
              </AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((c) => (
              <SystemTile key={c.providerCode} connection={c} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SystemTile({ connection: c }: { connection: MyConnectionDTO }) {
  const account = c.accounts[0]; // Tối đa 1 account / hệ thống
  const { start, redirecting } = useStartLink();

  const heading = (
    <div className="flex items-center gap-3">
      <SystemLogo name={c.providerName} logoUrl={c.logoUrl} className="size-10 text-base" />
      <span className="flex-1 font-semibold">{c.providerName}</span>
      {c.status !== SsoStatus.AVAILABLE && (
        <Badge variant="secondary">{SSO_STATUS_LABEL[c.status]}</Badge>
      )}
    </div>
  );

  // Mở được: cả ô là đường dẫn vào hệ thống.
  if (c.launchUrl) {
    return (
      <a
        href={c.launchUrl}
        className="group flex flex-col gap-4 rounded-lg border border-border bg-card p-5 outline-none hover:border-primary focus-visible:ring-2 focus-visible:ring-ring"
      >
        {heading}
        {account && (
          <p className="text-sm text-muted-foreground">
            Đăng nhập là <span className="font-medium text-foreground">{account.username}</span>
          </p>
        )}
        <span className="mt-auto text-sm font-medium text-primary group-hover:underline">
          Mở {c.providerName}
        </span>
      </a>
    );
  }

  // Chưa vào được: ô viền đứt, việc cần làm là liên kết.
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-dashed border-border p-5">
      {heading}
      {account ? (
        <p className="text-sm text-muted-foreground">
          Đã liên kết: <span className="font-medium text-foreground">{account.username}</span>
        </p>
      ) : (
        c.status === SsoStatus.AVAILABLE && (
          <p className="text-sm text-muted-foreground">
            {c.linkEnabled
              ? "Chưa liên kết với tài khoản của bạn."
              : `Chưa liên kết. Đăng nhập ${c.providerName} để liên kết.`}
          </p>
        )
      )}
      {!account && c.linkEnabled ? (
        <Button
          className="mt-auto self-start"
          disabled={redirecting !== null}
          onClick={() => void start(c)}
        >
          {redirecting && <Spinner />}
          {redirecting ? `Đang chuyển tới ${c.providerName}…` : "Liên kết"}
        </Button>
      ) : (
        !account &&
        c.status === SsoStatus.AVAILABLE &&
        c.homeUrl && (
          <Button asChild variant="outline" className="mt-auto self-start">
            <a href={c.homeUrl}>Đến {c.providerName}</a>
          </Button>
        )
      )}
    </div>
  );
}
