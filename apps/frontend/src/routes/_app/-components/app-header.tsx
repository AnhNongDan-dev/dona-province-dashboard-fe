import { APP_CONFIG } from "@repo/shared/src/app-config";
import { LogoutMode, type Session } from "@repo/zod-schemas/src/entity/central-auth-schema";
import { Link, useLocation } from "@tanstack/react-router";
import { format } from "date-fns";
import { ChevronDown } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLogout } from "@/hooks/use-logout";
import { cn } from "@/lib/utils";

const NAV_LINK =
  "flex h-14 items-center border-b-2 border-transparent text-muted-foreground hover:text-foreground";
const NAV_ACTIVE = "border-primary font-medium text-foreground";

export function AppHeader({ session }: { session: Session }) {
  const runLogout = useLogout();
  const pathname = useLocation({ select: (l) => l.pathname });
  const { identity, personalDevice, idleExpiresAt } = session;
  if (!identity) return null;

  const deviceNote = personalDevice
    ? "Máy cá nhân"
    : `Máy dùng chung${idleExpiresAt ? `, hết phiên lúc ${format(idleExpiresAt, "HH:mm")}` : ""}`;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-card">
      <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2">
            <img src="/huy-hieu-doan.png" alt="Huy hiệu Đoàn" className="size-7 object-contain" />
            <span className="hidden font-semibold md:inline">{APP_CONFIG.NAME}</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <Link to="/" className={cn(NAV_LINK, pathname === "/" && NAV_ACTIVE)}>
              Các hệ thống
            </Link>
            <Link
              to="/account/connections"
              className={cn(NAV_LINK, pathname.startsWith("/account/") && NAV_ACTIVE)}
            >
              Tài khoản
            </Link>
            {/* Chỉ để hiển thị — BE kiểm quyền quản trị ở từng API. */}
            {identity.admin && (
              <Link
                to="/admin/users"
                search={{ page: 1 }}
                className={cn(NAV_LINK, pathname.startsWith("/admin") && NAV_ACTIVE)}
              >
                Quản trị
              </Link>
            )}
          </nav>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-md p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Avatar>
              <AvatarFallback className="bg-primary font-semibold text-primary-foreground">
                {identity.displayName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block text-sm font-medium">{identity.displayName}</span>
              {/* Máy dùng chung tự hết phiên — hiện giờ hết phiên ngay trên header. */}
              {!personalDevice && (
                <span className="block text-xs text-muted-foreground">{deviceNote}</span>
              )}
            </span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
              <span className="font-medium">{identity.displayName}</span>
              {identity.tenantName && (
                <span className="text-xs text-muted-foreground">{identity.tenantName}</span>
              )}
              <span className="text-xs text-muted-foreground">{identity.maskedLoginId}</span>
              <span className="text-xs text-muted-foreground">{deviceNote}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => runLogout(LogoutMode.SWITCH_USER)}>
              Đổi người dùng
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => runLogout(LogoutMode.LOGOUT)}>
              Đăng xuất
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
