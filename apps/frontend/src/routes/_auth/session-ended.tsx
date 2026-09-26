import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// S4 — phiên kết thúc (hết idle / hết hạn tối đa / bị thu hồi). Không hiện tên người trước
// (máy dùng chung); đăng nhập lại là đăng nhập đầy đủ, ai cũng được.
export const Route = createFileRoute("/_auth/session-ended")({
  component: SessionEndedPage,
});

function SessionEndedPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Phiên đăng nhập đã kết thúc</CardTitle>
        <CardDescription>
          Phiên đã kết thúc do không hoạt động, hết thời hạn hoặc đã bị thu hồi.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="w-full">
          <Link to="/login">Đăng nhập lại</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
