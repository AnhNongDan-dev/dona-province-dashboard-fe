import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Tab cũ của người A sau khi người B đã đăng nhập ở tab khác.
export const Route = createFileRoute("/_auth/session-changed")({
  component: SessionChangedPage,
});

function SessionChangedPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Phiên đăng nhập đã thay đổi</CardTitle>
        <CardDescription>
          Trình duyệt này vừa đăng nhập bằng một người dùng khác ở tab khác. Thao tác trên trang cũ
          đã bị chặn để không thực hiện nhầm dưới tên người khác.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button className="w-full" onClick={() => window.location.assign("/")}>
          Tải lại
        </Button>
      </CardContent>
    </Card>
  );
}
