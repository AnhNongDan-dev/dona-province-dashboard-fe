import {
  ACTIVITY_TYPE_LABEL,
  type Activity,
  ActivityResult,
  ActivityType,
} from "@repo/zod-schemas/src/entity/account-center-schema";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Bảng lịch sử hoạt động — của chính user và của một tài khoản ở màn quản trị. */
export function ActivityTable({
  items,
  isLoading,
  emptyText,
}: {
  items: Activity[];
  isLoading: boolean;
  emptyText: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Thời gian</TableHead>
          <TableHead>Hoạt động</TableHead>
          <TableHead>Kết quả</TableHead>
          <TableHead>IP</TableHead>
          <TableHead>Thiết bị</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground">
              Đang tải…
            </TableCell>
          </TableRow>
        ) : items.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground">
              {emptyText}
            </TableCell>
          </TableRow>
        ) : (
          items.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="whitespace-nowrap">
                {format(a.occurredAt, "dd/MM/yyyy HH:mm:ss")}
              </TableCell>
              <TableCell>
                {ACTIVITY_TYPE_LABEL[a.type as ActivityType] ?? "Hoạt động khác"}
                <ActivityDetail activity={a} />
              </TableCell>
              <TableCell>
                {a.result === ActivityResult.FAILURE ? (
                  <Badge variant="destructive">Thất bại</Badge>
                ) : (
                  <Badge variant="secondary">Thành công</Badge>
                )}
              </TableCell>
              {/* Dòng ADMIN_* không có IP / thiết bị: máy của quản trị viên, không phải của user. */}
              <TableCell className="whitespace-nowrap">{a.ip ?? "—"}</TableCell>
              <TableCell>{a.deviceLabel ?? "—"}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

/** Phần sau nhãn: tên hệ thống + detail (giá trị đã che do BE trả). Đăng ký: detail là nguồn. */
function ActivityDetail({ activity: a }: { activity: Activity }) {
  const parts =
    a.type === ActivityType.IDENTITY_REGISTERED
      ? [
          a.providerName
            ? `từ ${a.providerName}`
            : a.detail === "CENTRAL"
              ? "đăng ký trực tiếp"
              : null,
        ]
      : [a.providerName, a.detail];
  return parts.filter(Boolean).map((part) => (
    <span key={part} className="text-muted-foreground">
      {" "}
      · {part}
    </span>
  ));
}
