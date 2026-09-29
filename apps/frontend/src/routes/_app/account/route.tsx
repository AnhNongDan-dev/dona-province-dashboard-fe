import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

const ACCOUNT_NAV = [
  { to: "/account/connections", label: "Liên kết tài khoản" },
  { to: "/account/sessions", label: "Phiên & thiết bị" },
  { to: "/account/activity", label: "Lịch sử hoạt động" },
  { to: "/account/security", label: "Bảo mật" },
] as const;

// Các trang tài khoản: một thanh tab chung để thấy ngay cả 4 trang.
export const Route = createFileRoute("/_app/account")({
  component: AccountLayout,
});

function AccountLayout() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <nav className="-mx-4 flex overflow-x-auto border-b border-border px-4 text-sm sm:mx-0 sm:px-0">
        {ACCOUNT_NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="-mb-px shrink-0 border-b-2 border-transparent px-3 py-2.5 text-muted-foreground hover:text-foreground data-[status=active]:border-primary data-[status=active]:font-medium data-[status=active]:text-foreground"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
