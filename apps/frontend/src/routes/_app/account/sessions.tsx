import { ErrorCode } from "@repo/zod-schemas/src/api/error.schema";
import { revokeAllResultSchema } from "@repo/zod-schemas/src/entity/account-center-schema";
import { LogoutMode } from "@repo/zod-schemas/src/entity/central-auth-schema";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { clientAPI } from "@/config/clientAPI.config";
import { useLogout } from "@/hooks/use-logout";
import { errorMessage } from "@/lib/api-error";
import { applyLoggedOut } from "@/lib/central-session";
import {
  findMySessionsRepository,
  type MySessionDTO,
} from "@/repositories/findMySessions.repository";

// S10 — Phiên & thiết bị (D18). Phiên hiện tại chỉ đăng xuất qua D6 (một đường duy nhất).
export const Route = createFileRoute("/_app/account/sessions")({
  loader: () => findMySessionsRepository().loader(),
  component: SessionsPage,
});

const fmt = (d: Date) => format(d, "dd/MM/yyyy HH:mm");

function SessionsPage() {
  const { data, isLoading, isError, refetch } = findMySessionsRepository().useQuery();
  const runLogout = useLogout();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const refresh = () => void findMySessionsRepository().invalidate();

  async function revokeOne(s: MySessionDTO) {
    setBusy(s.id);
    const res = await clientAPI.AccountCenter.revokeMySession({ params: { id: s.id } });
    setBusy(null);
    if (res.success) toast.success(`Đã đăng xuất phiên trên ${s.deviceLabel}.`);
    else toast.error(errorMessage(res));
    refresh(); // thành công hay SESSION_NOT_FOUND đều cần danh sách mới
  }

  async function revokeAll(includeCurrent: boolean) {
    setBusy(includeCurrent ? "all" : "others");
    // Cần xác thực lại: clientAPI tự mở S2 khi gặp REAUTH_REQUIRED rồi gửi lại một lần.
    const res = await clientAPI.AccountCenter.revokeAllMySessions({ body: { includeCurrent } });
    setBusy(null);
    setConfirmAll(false);
    if (!res.success) {
      return toast.error(
        res.errorCode === ErrorCode.ReauthRequired
          ? "Cần xác nhận lại mật khẩu để đăng xuất các phiên."
          : errorMessage(res),
      );
    }
    const result = revokeAllResultSchema.parse(res.data);
    if (includeCurrent && result.csrfToken && result.sessionId) {
      // Như D6: phiên hiện tại đã kết thúc → phiên ẩn danh mới, báo các tab khác, sang S3.
      applyLoggedOut(result.csrfToken, result.sessionId);
      return navigate({ to: "/logged-out", state: { notifiedClients: result.notifiedClients } });
    }
    toast.success(
      result.revokedCount > 0
        ? `Đã đăng xuất ${result.revokedCount} phiên khác.`
        : "Không có phiên nào khác đang đăng nhập.",
    );
    refresh();
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Phiên & thiết bị</h1>
        <p className="text-sm text-muted-foreground">
          Các nơi đang đăng nhập bằng tài khoản của bạn. Thấy thiết bị lạ, hãy đăng xuất phiên đó và
          đổi mật khẩu.
        </p>
      </div>
      {isError ? (
        <div className="flex items-center gap-3 text-sm text-destructive">
          Không tải được danh sách phiên.
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            Thử lại
          </Button>
        </div>
      ) : isLoading ? (
        <Skeleton className="h-40" />
      ) : (
        <Card>
          <CardContent className="divide-y">
            {data.map((s) => (
              <div key={s.id} className="flex items-start gap-3 py-4 text-sm">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 font-medium">
                    {s.deviceLabel}
                    {s.current && <Badge>Phiên hiện tại</Badge>}
                    {s.personalDevice && <Badge variant="secondary">Máy cá nhân</Badge>}
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    <div>IP {s.ip}</div>
                    <div>Đăng nhập lúc {fmt(s.createdAt)}</div>
                    <div>Hoạt động gần nhất {fmt(s.lastActiveAt)}</div>
                  </div>
                </div>
                {s.current ? (
                  <Button size="sm" variant="outline" onClick={() => runLogout(LogoutMode.LOGOUT)}>
                    Đăng xuất
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => void revokeOne(s)}
                  >
                    {busy === s.id && <Spinner />}
                    Đăng xuất phiên này
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy !== null} onClick={() => void revokeAll(false)}>
          {busy === "others" && <Spinner />}
          Đăng xuất tất cả phiên khác
        </Button>
        <Button variant="destructive" disabled={busy !== null} onClick={() => setConfirmAll(true)}>
          Đăng xuất tất cả kể cả phiên này
        </Button>
      </div>
      <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Đăng xuất tất cả?</AlertDialogTitle>
            <AlertDialogDescription>
              Mọi phiên đăng nhập, kể cả phiên bạn đang dùng, sẽ kết thúc. Các hệ thống đã vào bằng
              tài khoản này sẽ được yêu cầu đăng xuất.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy !== null}>Không</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy !== null}
              onClick={() => void revokeAll(true)}
            >
              {busy === "all" && <Spinner />}
              Đăng xuất tất cả
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
