import { ErrorCode } from "@repo/zod-schemas/src/api/error.schema";
import {
  AdminUserAction,
  adminLockResultSchema,
  adminPasswordResetResultSchema,
  adminSessionsRevokeResultSchema,
  adminUnlinkResultSchema,
  adminUnlockResultSchema,
  UserStatus,
} from "@repo/zod-schemas/src/entity/admin-schema";
import { OtpChannel } from "@repo/zod-schemas/src/entity/link-transaction-schema";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { clientAPI } from "@/config/clientAPI.config";
import { errorMessage, queryError } from "@/lib/api-error";
import {
  type AdminUserDetailDTO,
  findAdminUserRepository,
} from "@/repositories/findAdminUser.repository";
import { invalidateAllSearchAdminAuditQueries } from "@/repositories/searchAdminAudit.repository";
import {
  invalidateAllSearchAdminUserActivitiesQueries,
  searchAdminUserActivitiesRepository,
} from "@/repositories/searchAdminUserActivities.repository";
import { invalidateAllSearchAdminUsersQueries } from "@/repositories/searchAdminUsers.repository";
import { ActivityTable } from "../../account/-components/activity-table";
import { AdminActionDialog, notifiedText } from "../-components/admin-action-dialog";
import { Pager } from "../-components/pager";
import { TempPasswordDialog, type TempPasswordResult } from "../-components/temp-password-dialog";
import { UserStatusBadge } from "../-components/user-status-badge";

// Chi tiết tài khoản (kèm lịch sử hoạt động) và các thao tác quản trị. Nút hiện theo
// `allowedActions` của BE, FE không tự suy luật từ status / admin.
export const Route = createFileRoute("/_app/admin/users/$id")({
  loader: ({ params }) => findAdminUserRepository(params.id).loader(),
  component: AdminUserPage,
});

const fmt = (d: Date) => format(d, "dd/MM/yyyy HH:mm");
const ACTIVITY_PAGE_SIZE = 10;

type ActionKind = "lock" | "unlock" | "reset" | "revoke" | { unlinkId: number };

function AdminUserPage() {
  const { id } = Route.useParams();
  const {
    data: user,
    isSuccess,
    isLoading,
    error,
    refetch,
  } = findAdminUserRepository(id).useQuery();

  if (isLoading) return <Skeleton className="h-96" />;
  if (!isSuccess) {
    const err = queryError(error);
    const notFound =
      err?.errorCode === ErrorCode.UserNotFound || err?.errorCode === ErrorCode.ValidationError;
    return (
      <div className="flex flex-col items-start gap-3">
        <BackLink />
        <p className="text-sm text-destructive">
          {notFound ? "Không tìm thấy tài khoản." : err ? errorMessage(err) : "Không tải được."}
        </p>
        {!notFound && (
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            Thử lại
          </Button>
        )}
      </div>
    );
  }
  return <AdminUserDetail key={user.id} user={user} />;
}

function BackLink() {
  return (
    <Link
      to="/admin/users"
      search={{ page: 1 }}
      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" /> Danh sách tài khoản
    </Link>
  );
}

function AdminUserDetail({ user }: { user: AdminUserDetailDTO }) {
  const [action, setAction] = useState<ActionKind | null>(null);
  const [tempPassword, setTempPassword] = useState<TempPasswordResult | null>(null);
  const can = (a: AdminUserAction) => user.allowedActions.includes(a);
  const email = user.contacts.find((c) => c.channel === OtpChannel.EMAIL);
  const phone = user.contacts.find((c) => c.channel === OtpChannel.SMS);
  const unlinking =
    action && typeof action === "object"
      ? user.connections.find((c) => c.linkId === action.unlinkId)
      : undefined;

  /** Sau mọi thao tác: đọc lại chi tiết + lịch sử; danh sách / nhật ký đọc mới khi mở. */
  function refresh() {
    void findAdminUserRepository(user.id).invalidate();
    void invalidateAllSearchAdminUserActivitiesQueries();
    void invalidateAllSearchAdminUsersQueries();
    void invalidateAllSearchAdminAuditQueries();
  }

  const dialogCommon = {
    onOpenChange: (open: boolean) => !open && setAction(null),
    onStale: refresh,
  };
  const who = <span className="font-medium text-foreground">{user.username}</span>;

  return (
    <div className="flex flex-col gap-4">
      <BackLink />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {user.displayName}
            <UserStatusBadge status={user.status} />
            {user.admin && <Badge variant="outline">Quản trị viên</Badge>}
            {user.passwordChangeRequired && <Badge variant="outline">Chờ đổi mật khẩu tạm</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground">{user.username}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(AdminUserAction.LOCK) && (
            <Button variant="destructive" onClick={() => setAction("lock")}>
              Khóa tài khoản
            </Button>
          )}
          {can(AdminUserAction.UNLOCK) && (
            <Button onClick={() => setAction("unlock")}>Mở khóa</Button>
          )}
          {can(AdminUserAction.RESET_PASSWORD) && (
            <Button variant="outline" onClick={() => setAction("reset")}>
              Cấp lại mật khẩu
            </Button>
          )}
          {can(AdminUserAction.REVOKE_SESSIONS) && (
            <Button variant="outline" onClick={() => setAction("revoke")}>
              Đăng xuất mọi phiên
            </Button>
          )}
        </div>
      </div>

      {user.mergedIntoId && (
        <Alert>
          <AlertDescription>
            Tài khoản đã được gộp vào{" "}
            <Link
              to="/admin/users/$id"
              params={{ id: user.mergedIntoId }}
              className="font-medium underline"
            >
              {user.mergedIntoDisplayName} ({user.mergedIntoUsername})
            </Link>
            . Mọi thao tác thực hiện trên tài khoản giữ lại.
          </AlertDescription>
        </Alert>
      )}
      {user.admin && (
        <Alert>
          <AlertDescription>
            Tài khoản quản trị viên chỉ xem được ở đây. Quản trị viên tự quản lý tài khoản của mình
            ở trang Tài khoản.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Thông tin</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
              <Row label="Tên đăng nhập">{user.username}</Row>
              <Row label="Ngày tạo">{fmt(user.createdAt)}</Row>
              <Row label="Đăng nhập gần nhất">
                {user.lastLoginAt ? fmt(user.lastLoginAt) : "Chưa đăng nhập"}
              </Row>
              <Row label="Đổi mật khẩu gần nhất">
                {user.passwordChangedAt ? fmt(user.passwordChangedAt) : "—"}
              </Row>
              {user.temporaryPasswordExpiresAt && (
                <Row label="Mật khẩu tạm hết hạn">{fmt(user.temporaryPasswordExpiresAt)}</Row>
              )}
              {user.lockedAt && (
                <Row label="Bị khóa">
                  {fmt(user.lockedAt)}
                  {user.lockedById && (
                    <>
                      {" "}
                      bởi{" "}
                      <Link
                        to="/admin/users/$id"
                        params={{ id: user.lockedById }}
                        className="hover:underline"
                      >
                        {user.lockedByUsername}
                      </Link>
                    </>
                  )}
                </Row>
              )}
            </dl>
            <Link
              to="/admin/audit"
              search={{ page: 1, targetId: user.id }}
              className="mt-4 inline-block text-primary hover:underline"
            >
              Nhật ký quản trị về tài khoản này
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kênh liên lạc</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
              {[
                { label: "Email", contact: email },
                { label: "Số điện thoại", contact: phone },
              ].map(({ label, contact }) => (
                <Row key={label} label={label}>
                  {contact ? (
                    <>
                      <span className="font-medium">{contact.destination}</span>
                      <span className="block text-xs text-muted-foreground">
                        {contact.verifiedAt
                          ? `Đã xác minh lúc ${fmt(contact.verifiedAt)}`
                          : "Chưa xác minh"}
                      </span>
                    </>
                  ) : (
                    "Chưa có"
                  )}
                </Row>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Liên kết hệ thống</CardTitle>
        </CardHeader>
        <CardContent>
          {user.connections.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa liên kết hệ thống nào.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hệ thống</TableHead>
                  <TableHead>Tài khoản ở hệ thống</TableHead>
                  <TableHead>Liên kết lúc</TableHead>
                  <TableHead>Vào gần nhất</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {user.connections.map((c) => (
                  <TableRow key={c.linkId}>
                    <TableCell>
                      {c.providerName}
                      {c.ssoOnly && (
                        <Badge variant="outline" className="ml-2">
                          Chỉ đăng nhập qua Central
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.externalUsername}
                      {(c.externalDisplayName || c.tenantName) && (
                        <div className="text-muted-foreground">
                          {[c.externalDisplayName, c.tenantName].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{fmt(c.linkedAt)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {c.lastSsoLoginAt ? fmt(c.lastSsoLoginAt) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {can(AdminUserAction.UNLINK) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setAction({ unlinkId: c.linkId })}
                        >
                          Hủy liên kết
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Phiên đang đăng nhập</CardTitle>
        </CardHeader>
        <CardContent>
          {user.sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Không có phiên nào đang đăng nhập.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thiết bị</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Đăng nhập lúc</TableHead>
                  <TableHead>Hoạt động gần nhất</TableHead>
                  <TableHead>Đã vào hệ thống</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {user.sessions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      {s.deviceLabel}
                      {s.personalDevice && (
                        <Badge variant="secondary" className="ml-2">
                          Máy cá nhân
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{s.ip ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmt(s.createdAt)}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmt(s.lastActiveAt)}</TableCell>
                    <TableCell>{s.clientNames.length ? s.clientNames.join(", ") : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {user.mergedFrom.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tài khoản đã gộp vào đây</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            {user.mergedFrom.map((m) => (
              <div key={m.id}>
                <Link to="/admin/users/$id" params={{ id: m.id }} className="hover:underline">
                  {m.displayName} ({m.username})
                </Link>
                {m.mergedAt && <span className="text-muted-foreground"> · {fmt(m.mergedAt)}</span>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <UserActivities id={user.id} />

      <AdminActionDialog
        {...dialogCommon}
        open={action === "lock"}
        title={`Khóa tài khoản ${user.username}?`}
        description={
          <>
            <span>
              Mọi phiên của {who} bị đăng xuất ngay, các hệ thống nhận yêu cầu đăng xuất. Người dùng
              không đăng nhập được bằng Thành Đoàn Đồng Nai Central cho tới khi được mở khóa.
            </span>
            <span>
              Khóa ở Central không chặn đăng nhập trực tiếp vào hệ thống chưa tắt đăng nhập kiểu cũ
              — cần báo hệ thống đó nếu muốn chặn hẳn.
            </span>
          </>
        }
        confirmLabel="Khóa tài khoản"
        action={(reason) => clientAPI.Admin.lockUser({ params: { id: user.id }, body: { reason } })}
        onSuccess={(data) => {
          const r = adminLockResultSchema.parse(data);
          if (r.status === user.status) toast.info("Tài khoản đã ở trạng thái bị khóa.");
          else {
            toast.success(`Đã khóa tài khoản. Đã đăng xuất ${r.revokedCount} phiên.`, {
              description: notifiedText(r.notifiedClients),
            });
          }
          refresh();
        }}
      />
      <AdminActionDialog
        {...dialogCommon}
        open={action === "unlock"}
        destructive={false}
        title={`Mở khóa tài khoản ${user.username}?`}
        description={
          <span>
            {who} đăng nhập lại được bằng Thành Đoàn Đồng Nai Central. Khóa tạm do nhập sai mật khẩu
            cũng được xóa.
          </span>
        }
        confirmLabel="Mở khóa"
        action={(reason) =>
          clientAPI.Admin.unlockUser({ params: { id: user.id }, body: { reason } })
        }
        onSuccess={(data) => {
          const r = adminUnlockResultSchema.parse(data);
          if (r.status === user.status) toast.info("Tài khoản đã ở trạng thái hoạt động.");
          else toast.success("Đã mở khóa tài khoản.");
          refresh();
        }}
      />
      <AdminActionDialog
        {...dialogCommon}
        open={action === "reset"}
        title={`Cấp lại mật khẩu cho ${user.username}?`}
        description={
          <>
            <span>
              Chỉ dùng khi người dùng không tự lấy lại được mật khẩu.{" "}
              <strong>Hãy xác minh danh tính người yêu cầu trước khi cấp.</strong>
            </span>
            <span>
              Mật khẩu hiện tại của {who} mất hiệu lực ngay, mọi phiên bị đăng xuất. Mật khẩu tạm
              chỉ hiện một lần; người dùng phải đổi ở lần đăng nhập đầu.
            </span>
            {user.status === UserStatus.LOCKED && (
              <span>Tài khoản đang bị khóa — cấp lại mật khẩu không mở khóa.</span>
            )}
          </>
        }
        confirmLabel="Cấp mật khẩu tạm"
        networkErrorText="Không rõ đã cấp được hay chưa (mất kết nối). Nếu cấp lại, mật khẩu tạm trước (nếu có) sẽ mất hiệu lực."
        action={(reason) =>
          clientAPI.Admin.resetUserPassword({ params: { id: user.id }, body: { reason } })
        }
        onSuccess={(data) => {
          const r = adminPasswordResetResultSchema.parse(data);
          setTempPassword({
            username: user.username,
            temporaryPassword: r.temporaryPassword,
            expiresAt: r.expiresAt,
            note: [
              r.revokedCount > 0 ? `Đã đăng xuất ${r.revokedCount} phiên.` : null,
              notifiedText(r.notifiedClients),
            ]
              .filter(Boolean)
              .join(" "),
          });
          refresh();
        }}
      />
      <AdminActionDialog
        {...dialogCommon}
        open={action === "revoke"}
        title={`Đăng xuất mọi phiên của ${user.username}?`}
        description={
          <span>
            Mọi phiên của {who} kết thúc ngay, các hệ thống nhận yêu cầu đăng xuất. Mật khẩu và
            trạng thái tài khoản giữ nguyên.
          </span>
        }
        confirmLabel="Đăng xuất mọi phiên"
        action={(reason) =>
          clientAPI.Admin.revokeUserSessions({ params: { id: user.id }, body: { reason } })
        }
        onSuccess={(data) => {
          const r = adminSessionsRevokeResultSchema.parse(data);
          toast.success(
            r.revokedCount > 0
              ? `Đã đăng xuất ${r.revokedCount} phiên.`
              : "Tài khoản không có phiên nào đang đăng nhập.",
            { description: notifiedText(r.notifiedClients) },
          );
          refresh();
        }}
      />
      <AdminActionDialog
        {...dialogCommon}
        open={!!unlinking}
        title={`Hủy liên kết ${unlinking?.providerName ?? ""}?`}
        description={
          unlinking && (
            <>
              <span>
                Tài khoản {unlinking.externalUsername} ở {unlinking.providerName} không còn gắn với{" "}
                {who}; người dùng bị đăng xuất khỏi {unlinking.providerName} trên mọi thiết bị.
              </span>
              {unlinking.ssoOnly && (
                <span className="font-medium text-destructive">
                  {unlinking.providerName} chỉ còn đăng nhập qua Thành Đoàn Đồng Nai Central: sau
                  khi hủy, không ai vào được tài khoản này qua Central cho tới khi chủ tài khoản
                  liên kết lại — nếu hệ thống đã tắt đăng nhập kiểu cũ thì chưa liên kết lại được.
                </span>
              )}
            </>
          )
        }
        confirmLabel="Hủy liên kết"
        action={(reason) =>
          clientAPI.Admin.unlinkUserConnection({
            params: { id: user.id, linkId: unlinking?.linkId ?? 0 },
            body: { reason },
          })
        }
        onSuccess={(data) => {
          const r = adminUnlinkResultSchema.parse(data);
          toast.success(`Đã hủy liên kết ${unlinking?.providerName ?? ""}.`, {
            description: notifiedText(r.notifiedClients),
          });
          refresh();
        }}
      />
      <TempPasswordDialog result={tempPassword} onClose={() => setTempPassword(null)} />
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

/** Lịch sử của tài khoản; phân trang trong trang (không lên URL). */
function UserActivities({ id }: { id: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch, isFetching } = searchAdminUserActivitiesRepository({
    id,
    page: page - 1,
    size: ACTIVITY_PAGE_SIZE,
  }).useQuery();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Lịch sử hoạt động</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isError ? (
          <div className="flex items-center gap-3 text-sm text-destructive">
            Không tải được lịch sử.
            <Button size="sm" variant="outline" onClick={() => void refetch()}>
              Thử lại
            </Button>
          </div>
        ) : (
          <div className={isFetching && !isLoading ? "opacity-60" : undefined}>
            <ActivityTable
              items={data.items}
              isLoading={isLoading}
              emptyText="Chưa có hoạt động nào."
            />
          </div>
        )}
        <Pager
          page={page}
          pageSize={ACTIVITY_PAGE_SIZE}
          total={data.total}
          hasNext={data.hasNext}
          unit="hoạt động"
          onPage={setPage}
        />
      </CardContent>
    </Card>
  );
}
