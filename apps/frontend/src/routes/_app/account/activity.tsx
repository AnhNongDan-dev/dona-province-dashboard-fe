import {
  ACTIVITY_TYPE_OPTIONS,
  type ActivityType,
  activityTypeZod,
} from "@repo/zod-schemas/src/entity/account-center-schema";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import z from "zod";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchMyActivitiesRepository } from "@/repositories/searchMyActivities.repository";
import { ActivityTable } from "./-components/activity-table";

const PAGE_SIZE = 20;

// S11 — Lịch sử hoạt động (D19). Bộ lọc nằm trên URL; URL đếm trang từ 1, API từ 0.
export const Route = createFileRoute("/_app/account/activity")({
  validateSearch: z.object({
    page: z.coerce.number().int().min(1).catch(1),
    types: z.array(activityTypeZod).optional().catch(undefined),
    from: z.iso.date().optional().catch(undefined),
    to: z.iso.date().optional().catch(undefined),
  }),
  component: ActivityPage,
});

function ActivityPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [dateError, setDateError] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = searchMyActivitiesRepository({
    page: search.page - 1,
    size: PAGE_SIZE,
    types: search.types?.length ? search.types.join(",") : undefined,
    from: search.from,
    to: search.to,
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

  function toggleType(type: ActivityType, checked: boolean) {
    const current = new Set(search.types ?? []);
    if (checked) current.add(type);
    else current.delete(type);
    void setFilter({ types: current.size ? [...current] : undefined });
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const hasFilter = !!(search.types?.length || search.from || search.to);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Lịch sử hoạt động</h1>
        <p className="text-sm text-muted-foreground">
          Toàn bộ hoạt động của tài khoản này, kể cả lần đăng nhập sai mật khẩu. Thấy hoạt động lạ,
          hãy đổi mật khẩu ngay.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label>Loại hoạt động</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="min-w-48 justify-start">
                {search.types?.length ? `Đã chọn ${search.types.length} loại` : "Tất cả"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
              {ACTIVITY_TYPE_OPTIONS.map((o) => (
                <DropdownMenuCheckboxItem
                  key={o.value}
                  checked={search.types?.includes(o.value) ?? false}
                  onCheckedChange={(v) => toggleType(o.value, v === true)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {o.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
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
            emptyText={hasFilter ? "Không có hoạt động nào khớp bộ lọc." : "Chưa có hoạt động nào."}
          />
        </div>
      )}

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {data.total} hoạt động · Trang {search.page} / {totalPages}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={search.page <= 1}
            onClick={() => void navigate({ search: (prev) => ({ ...prev, page: prev.page - 1 }) })}
          >
            Trước
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!data.hasNext}
            onClick={() => void navigate({ search: (prev) => ({ ...prev, page: prev.page + 1 }) })}
          >
            Sau
          </Button>
        </div>
      </div>
    </div>
  );
}
