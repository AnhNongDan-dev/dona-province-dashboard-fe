import {
  USER_STATUS_FILTER,
  USER_STATUS_LABEL,
  userStatusFilterZod,
} from "@repo/zod-schemas/src/entity/admin-schema";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { type FormEvent, useState } from "react";
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
import { findMyConnectionsRepository } from "@/repositories/findMyConnections.repository";
import { searchAdminUsersRepository } from "@/repositories/searchAdminUsers.repository";
import { Pager } from "../-components/pager";
import { UserStatusBadge } from "../-components/user-status-badge";

const PAGE_SIZE = 20;
const Q_MIN = 2;
const Q_MAX = 100;

// A1 — tìm tài khoản (AD1). Bộ lọc nằm trên URL; URL đếm trang từ 1, API từ 0.
export const Route = createFileRoute("/_app/admin/users/")({
  validateSearch: z.object({
    page: z.coerce.number().int().min(1).catch(1),
    q: z.string().trim().min(Q_MIN).max(Q_MAX).optional().catch(undefined),
    status: userStatusFilterZod.optional().catch(undefined),
    providerCode: z.string().optional().catch(undefined),
  }),
  // Danh sách hệ thống cho bộ lọc: D16 trả mọi hệ thống đã đăng ký.
  loader: () => findMyConnectionsRepository().loader(),
  component: AdminUsersPage,
});

const fmt = (d: Date) => format(d, "dd/MM/yyyy HH:mm");

function AdminUsersPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: systems } = findMyConnectionsRepository().useQuery();
  const [q, setQ] = useState(search.q ?? "");
  const [qError, setQError] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = searchAdminUsersRepository({
    page: search.page - 1,
    size: PAGE_SIZE,
    q: search.q,
    status: search.status,
    providerCode: search.providerCode,
  }).useQuery();

  const setFilter = (patch: Partial<typeof search>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch, page: 1 }) });

  function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = q.trim();
    if (value && (value.length < Q_MIN || value.length > Q_MAX)) {
      return setQError(`Nhập từ ${Q_MIN} đến ${Q_MAX} ký tự.`);
    }
    setQError(null);
    void setFilter({ q: value || undefined });
  }

  const hasFilter = !!(search.q || search.status || search.providerCode);
  const loadError = queryError(error);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Tài khoản</h1>
        <p className="text-sm text-muted-foreground">
          Tìm theo họ tên / tên đăng nhập (gõ không dấu được), hoặc nhập đúng email, số điện thoại,
          tên đăng nhập ở hệ thống cũ.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <form onSubmit={onSearch} className="flex flex-col gap-1" noValidate>
          <Label htmlFor="q">Tìm kiếm</Label>
          <div className="flex gap-2">
            <Input
              id="q"
              className="w-72"
              value={q}
              placeholder="Họ tên, tên đăng nhập, email, SĐT…"
              aria-invalid={!!qError}
              onChange={(e) => {
                setQ(e.target.value);
                setQError(null);
              }}
            />
            <Button type="submit">Tìm</Button>
          </div>
        </form>
        <div className="flex flex-col gap-1">
          <Label htmlFor="status">Trạng thái</Label>
          <NativeSelect
            id="status"
            value={search.status ?? ""}
            onChange={(e) =>
              void setFilter({ status: userStatusFilterZod.safeParse(e.target.value).data })
            }
          >
            <NativeSelectOption value="">Tất cả</NativeSelectOption>
            {USER_STATUS_FILTER.map((s) => (
              <NativeSelectOption key={s} value={s}>
                {USER_STATUS_LABEL[s]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="provider">Có liên kết với</Label>
          <NativeSelect
            id="provider"
            value={search.providerCode ?? ""}
            onChange={(e) => void setFilter({ providerCode: e.target.value || undefined })}
          >
            <NativeSelectOption value="">Mọi hệ thống</NativeSelectOption>
            {systems.map((s) => (
              <NativeSelectOption key={s.providerCode} value={s.providerCode}>
                {s.providerName}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        {hasFilter && (
          <Button
            variant="ghost"
            onClick={() => {
              setQ("");
              setQError(null);
              void navigate({ search: { page: 1 } });
            }}
          >
            Xóa lọc
          </Button>
        )}
      </div>
      {qError && <p className="text-sm text-destructive">{qError}</p>}

      {isError ? (
        <div className="flex items-center gap-3 text-sm text-destructive">
          {loadError ? errorMessage(loadError) : "Không tải được danh sách tài khoản."}
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            Thử lại
          </Button>
        </div>
      ) : (
        <div className={isFetching && !isLoading ? "opacity-60" : undefined}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tài khoản</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Số điện thoại</TableHead>
                <TableHead>Hệ thống đã liên kết</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Ngày tạo</TableHead>
                <TableHead>Đăng nhập gần nhất</TableHead>
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
                    {hasFilter ? "Không có tài khoản nào khớp." : "Chưa có tài khoản nào."}
                  </TableCell>
                </TableRow>
              ) : (
                data.items.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <Link
                        to="/admin/users/$id"
                        params={{ id: u.id }}
                        className="font-medium hover:underline"
                      >
                        {u.displayName}
                      </Link>
                      {u.admin && (
                        <Badge variant="outline" className="ml-2">
                          Quản trị viên
                        </Badge>
                      )}
                      <div className="text-muted-foreground">{u.username}</div>
                    </TableCell>
                    <TableCell>{u.maskedEmail ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{u.maskedPhone ?? "—"}</TableCell>
                    <TableCell>
                      {u.linkedProviderNames.length ? u.linkedProviderNames.join(", ") : "—"}
                    </TableCell>
                    <TableCell>
                      <UserStatusBadge status={u.status} />
                      {u.mergedIntoId && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          vào{" "}
                          <Link
                            to="/admin/users/$id"
                            params={{ id: u.mergedIntoId }}
                            className="hover:underline"
                          >
                            {u.mergedIntoUsername}
                          </Link>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{fmt(u.createdAt)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {u.lastLoginAt ? fmt(u.lastLoginAt) : "—"}
                    </TableCell>
                  </TableRow>
                ))
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
        unit="tài khoản"
        onPage={(page) => void navigate({ search: (prev) => ({ ...prev, page }) })}
      />
    </div>
  );
}
