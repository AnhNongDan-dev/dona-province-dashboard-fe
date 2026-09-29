import { Button } from "@/components/ui/button";

/** Tổng + Trước / Sau cho bảng phân trang phía server. page đếm từ 1. */
export function Pager({
  page,
  pageSize,
  total,
  hasNext,
  unit,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  hasNext: boolean;
  unit: string;
  onPage: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">
        {total} {unit} · Trang {page} / {totalPages}
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Trước
        </Button>
        <Button size="sm" variant="outline" disabled={!hasNext} onClick={() => onPage(page + 1)}>
          Sau
        </Button>
      </div>
    </div>
  );
}
