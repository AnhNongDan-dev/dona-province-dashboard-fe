import { ERROR_DATA, ErrorCode, errorCodeZod } from "@repo/zod-schemas/src/api/error.schema";
import { createFileRoute } from "@tanstack/react-router";
import z from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Lỗi ở các bước redirect /sso/* khi CHƯA tạo được giao dịch. Chỉ nhận mã trong bảng lỗi —
// không bao giờ hiện câu chữ tự do lấy từ URL.
export const Route = createFileRoute("/_auth/sso-error")({
  validateSearch: z.object({ code: errorCodeZod.optional().catch(undefined) }),
  component: SsoErrorPage,
});

const TITLES: Partial<Record<ErrorCode, string>> = {
  [ErrorCode.ProviderUnavailable]: "Hệ thống chưa sẵn sàng liên kết",
  [ErrorCode.InvalidReturnUrl]: "Không thể bắt đầu liên kết",
  [ErrorCode.LinkTxNotFound]: "Phiên liên kết không còn hiệu lực",
};

function SsoErrorPage() {
  const { code } = Route.useSearch();
  const known = code && TITLES[code];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{known ?? "Không thể tiếp tục liên kết"}</CardTitle>
        <CardDescription>
          {known
            ? ERROR_DATA[code].message
            : "Đã có lỗi xảy ra khi liên kết tài khoản. Vui lòng quay lại hệ thống bạn đang dùng và thử lại."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          Hãy quay lại hệ thống bạn đang dùng và bắt đầu lại từ đó. Nếu lỗi lặp lại, liên hệ quản
          trị.
        </p>
        <Button asChild variant="outline">
          <a href="/">Về trang chủ</a>
        </Button>
      </CardContent>
    </Card>
  );
}
