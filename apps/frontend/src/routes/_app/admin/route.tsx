import { createFileRoute, Link, Navigate, Outlet } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session-store";

const ADMIN_NAV = [
  { to: "/admin/users", label: "Tài khoản" },
  { to: "/admin/audit", label: "Nhật ký quản trị" },
] as const;

// Khu quản trị (TASK-006). Chỉ hiện theo D1 `identity.admin`; BE vẫn kiểm từng API.
export const Route = createFileRoute("/_app/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const admin = useSession()?.identity?.admin === true;
  // Đang ở khu quản trị thì mất quyền (API trả ADMIN_FORBIDDEN → D1 đọc lại): về cổng tổng hợp.
  const wasAdmin = useRef(admin);
  const lost = wasAdmin.current && !admin;
  useEffect(() => {
    if (lost) toast.error("Bạn không còn quyền quản trị.");
  }, [lost]);
  if (admin) wasAdmin.current = true;

  if (lost) return <Navigate to="/" replace />;
  if (!admin) return <Forbidden />;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 lg:flex-row">
      <nav className="-mx-4 flex shrink-0 overflow-x-auto border-b border-border px-4 text-sm sm:mx-0 sm:px-0 lg:w-48 lg:flex-col lg:border-b-0 lg:border-r">
        {ADMIN_NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            search={{ page: 1 }}
            className="-mb-px shrink-0 border-b-2 border-transparent px-3 py-2.5 text-muted-foreground hover:text-foreground data-[status=active]:border-primary data-[status=active]:font-medium data-[status=active]:text-foreground lg:-mr-px lg:mb-0 lg:border-r-2 lg:border-b-0"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}

function Forbidden() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <ShieldAlert className="size-10 text-muted-foreground" />
      <h1 className="text-xl font-semibold">Không có quyền truy cập</h1>
      <p className="text-sm text-muted-foreground">
        Khu quản trị chỉ dành cho quản trị viên của Thành Đoàn Đồng Nai Central.
      </p>
      <Button asChild variant="outline">
        <Link to="/">Về trang chủ</Link>
      </Button>
    </div>
  );
}
