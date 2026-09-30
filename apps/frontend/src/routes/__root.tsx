import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ReauthDialog } from "@/components/auth/reauth-dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ensureSession, installSessionSync } from "@/lib/central-session";

export const Route = createRootRoute({
  // Mỗi tab đọc trạng thái phiên (GET /api/session) một lần lúc khởi động để có csrfToken +
  // sessionId (giữ trong bộ nhớ).
  beforeLoad: async () => {
    installSessionSync();
    await ensureSession();
  },
  component: RootComponent,
});

function RootComponent() {
  return (
    <TooltipProvider>
      <div className="block w-dvw h-dvh relative">
        <Outlet />
      </div>
      <ReauthDialog />
    </TooltipProvider>
  );
}
