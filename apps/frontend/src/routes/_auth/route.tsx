import { APP_CONFIG } from "@repo/shared/src/app-config";
import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout auth: không header ứng dụng — chỉ logo + tên hệ thống. S1, S3, S4, "phiên đã thay đổi".
export const Route = createFileRoute("/_auth")({
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-6">
      <div className="flex items-center gap-2">
        <img src="/app-icon.svg" alt="" className="size-8" />
        <span className="text-lg font-semibold">{APP_CONFIG.NAME}</span>
      </div>
      <div className="w-full max-w-md">
        <Outlet />
      </div>
    </div>
  );
}
