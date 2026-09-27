import { APP_CONFIG } from "@repo/shared/src/app-config";
import { LogoutMode, type Session } from "@repo/zod-schemas/src/entity/central-auth-schema";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { useLogout } from "@/hooks/use-logout";

const NAV = [
  { to: "/", label: "Các hệ thống" },
  { to: "/account/connections", label: "Liên kết tài khoản" },
] as const;

export function AppHeader({ session }: { session: Session }) {
  const runLogout = useLogout();
  const { identity, personalDevice, idleExpiresAt } = session;
  if (!identity) return null;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/95 backdrop-blur">
      <div className="flex h-14 items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2">
            <img src="/app-icon.svg" alt="" className="size-7" />
            <span className="font-semibold">{APP_CONFIG.NAME}</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: true }}
                className="text-muted-foreground hover:text-foreground data-[status=active]:font-medium data-[status=active]:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right leading-tight">
            <div className="text-sm font-medium">
              {identity.displayName}
              {identity.tenantName && (
                <span className="text-muted-foreground"> · {identity.tenantName}</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {identity.maskedLoginId} ·{" "}
              {personalDevice
                ? "Máy cá nhân"
                : `Máy dùng chung${idleExpiresAt ? ` · hết phiên lúc ${format(idleExpiresAt, "HH:mm")}` : ""}`}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => runLogout(LogoutMode.SWITCH_USER)}>
            Đổi người dùng
          </Button>
          <Button size="sm" onClick={() => runLogout(LogoutMode.LOGOUT)}>
            Đăng xuất
          </Button>
        </div>
      </div>
    </header>
  );
}
