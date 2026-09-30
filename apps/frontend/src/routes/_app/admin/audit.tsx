import { ERROR_DATA, type ErrorCode } from "@repo/zod-schemas/src/api/error.schema";
import { ActivityResult } from "@repo/zod-schemas/src/entity/account-center-schema";
import {
  ADMIN_ACTION_LABEL,
  type AdminAction,
  adminActionZod,
} from "@repo/zod-schemas/src/entity/admin-schema";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { useState } from "react";
import z from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { errorMessage, queryError } from "@/lib/api-error";
import {
  type AdminAuditRowDTO,
  searchAdminAuditRepository,
} from "@/repositories/searchAdminAudit.repository";
import { Pager } from "./-components/pager";

const PAGE_SIZE = 20;
const resultZod = z.enum([ActivityResult.SUCCESS, ActivityResult.FAILURE]);

// Nhật ký quản trị. Bộ lọc nằm trên URL; URL đếm trang từ 1, API từ 0.
// actorId / targetId đến từ link ở trang chi tiết tài khoản ("Nhật ký quản trị về tài khoản này").
export const Route = createFileRoute("/_app/admin/audit")({
  validateSearch: z.object({
    page: z.coerce.number().int().min(1).catch(1),
    actorId: z.guid().optional().catch(undefined),
    targetId: z.guid().optional().catch(undefined),
    action: adminActionZod.optional().catch(undefined),
    result: resultZod.optional().catch(undefined),
    from: z.iso.date().optional().catch(undefined),
    to: z.iso.date().optional().catch(undefined),
  }),
  component: AdminAuditPage,
});

function AdminAuditPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [dateError, setDateError] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = searchAdminAuditRepository({
    ...search,
    page: search.page - 1,
    size: PAGE_SIZE,
  }).useQuery();

  const setFilter = (patch: Partial<typeof search>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch, page: 1 }) });

  function setDate(key: "from" | "to", value: string) {
    const next = { from: search.from, to: search.to, [key]: value || undefined };
    if (next.from && next.to && next.from > next.to) {
      return setDateError("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.");
    }
    setDateError(null);
    void setFilter({ [key]: value || undefined });
  }

  const hasFilter = Object.entries(search).some(([k, v]) => k !== "page" && v !== undefined);
  const loadError = queryError(error);
  // Tên chụp lúc thao tác, lấy từ dòng đầu tiên khớp bộ lọc.
  const first = data.items[0];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Nhật ký quản trị</h1>
        <p className="text-sm text-muted-foreground">
          Mọi thao tác của quản trị viên và mọi lần truy cập khu quản trị bị từ chối. Lưu vĩnh viễn,
          không sửa / xóa được.
        </p>
      </div>

      {(search.targetId || search.actorId) && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {search.targetId && (
            <Badge variant="outline">
              Tài khoản bị tác động:{" "}
              {first?.targetId === search.targetId ? first.targetUsername : search.targetId}
            </Badge>
          )}
          {search.actorId && (
            <Badge variant="outline">
              Người thực hiện:{" "}
              {first?.actorId === search.actorId ? first.actorUsername : search.actorId}
            </Badge>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void setFilter({ targetId: undefined, actorId: undefined })}
          >
            Bỏ lọc tài khoản
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="action">Hành động</Label>
          <NativeSelect
            id="action"
            value={search.action ?? ""}
            onChange={(e) =>
              void setFilter({ action: adminActionZod.safeParse(e.target.value).data })
            }
          >
            <NativeSelectOption value="">Tất cả</NativeSelectOption>
            {adminActionZod.options.map((a) => (
              <NativeSelectOption key={a} value={a}>
                {ADMIN_ACTION_LABEL[a]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="result">Kết quả</Label>
          <NativeSelect
            id="result"
            value={search.result ?? ""}
            onChange={(e) => void setFilter({ result: resultZod.safeParse(e.target.value).data })}
          >
            <NativeSelectOption value="">Tất cả</NativeSelectOption>
            <NativeSelectOption value={ActivityResult.SUCCESS}>Thành công</NativeSelectOption>
            <NativeSelectOption value={ActivityResult.FAILURE}>Thất bại</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="from">Từ ngày</Label>
          <Input
            id="from"
            type="date"
            value={search.from ?? ""}
            onChange={(e) => setDate("from", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="to">Đến ngày</Label>
          <Input
            id="to"
            type="date"
            value={search.to ?? ""}
            onChange={(e) => setDate("to", e.target.value)}
          />
        </div>
        {hasFilter && (
          <Button
            variant="ghost"
            onClick={() => {
              setDateError(null);
              void navigate({ search: { page: 1 } });
            }}
          >
            Xóa lọc
          </Button>
        )}
      </div>
      {dateError && <p className="text-sm text-destructive">{dateError}</p>}

      {isError ? (
        <div className="flex items-center gap-3 text-sm text-destructive">
          {loadError ? errorMessage(loadError) : "Không tải được nhật ký."}
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            Thử lại
          </Button>
        </div>
      ) : (
        <div className={isFetching && !isLoading ? "opacity-60" : undefined}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Thời gian</TableHead>
                <TableHead>Người thực hiện</TableHead>
                <TableHead>Hành động</TableHead>
                <TableHead>Tài khoản bị tác động</TableHead>
                <TableHead>Lý do</TableHead>
                <TableHead>Kết quả</TableHead>
                <TableHead>IP / thiết bị</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Đang tải…
                  </TableCell>
                </TableRow>
              ) : data.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    {hasFilter ? "Không có dòng nào khớp bộ lọc." : "Chưa có thao tác nào."}
                  </TableCell>
                </TableRow>
              ) : (
                data.items.map((row) => <AuditRow key={row.id} row={row} />)
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Pager
        page={search.page}
        pageSize={PAGE_SIZE}
        total={data.total}
        hasNext={data.hasNext}
        unit="dòng"
        onPage={(page) => void navigate({ search: (prev) => ({ ...prev, page }) })}
      />
    </div>
  );
}

function AuditRow({ row: r }: { row: AdminAuditRowDTO }) {
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">
        {format(r.occurredAt, "dd/MM/yyyy HH:mm:ss")}
      </TableCell>
      <TableCell>
        <Person id={r.actorId} username={r.actorUsername} displayName={r.actorDisplayName} />
      </TableCell>
      <TableCell>
        {ADMIN_ACTION_LABEL[r.action as AdminAction] ?? r.action}
        {r.providerName && <span className="text-muted-foreground"> · {r.providerName}</span>}
      </TableCell>
      <TableCell>
        <Person id={r.targetId} username={r.targetUsername} displayName={r.targetDisplayName} />
      </TableCell>
      <TableCell className="max-w-72 whitespace-pre-wrap break-words">{r.reason ?? "—"}</TableCell>
      <TableCell>
        {r.result === ActivityResult.FAILURE ? (
          <>
            <Badge variant="destructive">Thất bại</Badge>
            {r.errorCode && (
              <div className="mt-1 text-xs text-muted-foreground">
                {ERROR_DATA[r.errorCode as ErrorCode]?.message ?? r.errorCode}
              </div>
            )}
          </>
        ) : (
          <Badge variant="secondary">Thành công</Badge>
        )}
      </TableCell>
      <TableCell>
        <div className="whitespace-nowrap">{r.ip ?? "—"}</div>
        {r.deviceLabel && <div className="text-muted-foreground">{r.deviceLabel}</div>}
      </TableCell>
    </TableRow>
  );
}

/** Tên chụp lúc thao tác; bấm để mở chi tiết tài khoản đó. */
function Person({
  id,
  username,
  displayName,
}: {
  id: string | null;
  username: string | null;
  displayName: string | null;
}) {
  if (!id) return "—";
  return (
    <>
      <Link to="/admin/users/$id" params={{ id }} className="font-medium hover:underline">
        {displayName ?? username ?? id}
      </Link>
      {username && displayName && <div className="text-muted-foreground">{username}</div>}
    </>
  );
}
