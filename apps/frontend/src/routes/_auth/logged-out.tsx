import { createFileRoute, Link, useLocation } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Trang đã đăng xuất. Danh sách hệ thống chỉ có khi đăng xuất từ chính SPA;
// tới đây qua /connect/logout thì hiện bản chung.
export const Route = createFileRoute("/_auth/logged-out")({
  component: LoggedOutPage,
});

function LoggedOutPage() {
  const notifiedClients = useLocation({ select: (l) => l.state.notifiedClients }) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bạn đã đăng xuất</CardTitle>
        <CardDescription>Bạn đã đăng xuất khỏi hệ thống đăng nhập trung tâm.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {notifiedClients.length > 0 && (
          <div className="text-sm">
            <p className="text-muted-foreground">Đã gửi yêu cầu đăng xuất tới:</p>
            <ul className="mt-1 list-disc pl-5">
              {notifiedClients.map((c) => (
                <li key={c.clientId}>{c.clientName}</li>
              ))}
            </ul>
          </div>
        )}
        <Alert>
          <AlertDescription>
            Trên máy dùng chung, hãy đóng trình duyệt nếu còn tab hệ thống khác đang mở.
          </AlertDescription>
        </Alert>
        <Button asChild>
          <Link to="/login">Đăng nhập</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
