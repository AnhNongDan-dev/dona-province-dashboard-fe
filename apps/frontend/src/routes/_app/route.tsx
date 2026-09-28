import { createFileRoute, Navigate, Outlet, redirect } from "@tanstack/react-router";
import { sessionStore, useSession } from "@/lib/session-store";
import { AppHeader } from "./-components/app-header";
import { IdleWarningDialog } from "./-components/idle-warning-dialog";

// Layout ứng dụng: chỉ cho phiên đã đăng nhập; header luôn hiện người đang đăng nhập.
export const Route = createFileRoute("/_app")({
  beforeLoad: () => {
    const session = sessionStore.get();
    if (!session?.authenticated) throw redirect({ to: "/login" });
    // Tài khoản chưa có email đã xác minh bị giữ ở màn thêm email (TASK-008).
    if (session.identity?.emailSetupRequired) throw redirect({ to: "/email-setup" });
  },
  component: AppLayout,
});

function AppLayout() {
  const session = useSession();
  // Vừa đăng xuất / đổi người ở tab này: đang chuyển trang, không render dưới phiên ẩn danh.
  if (!session?.authenticated || !session.identity) return null;
  if (session.identity.emailSetupRequired) return <Navigate to="/email-setup" replace />;

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader session={session} />
      <main className="flex-1 p-6">
        <Outlet />
      </main>
      <IdleWarningDialog session={session} />
    </div>
  );
}
