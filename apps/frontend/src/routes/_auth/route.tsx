import { APP_CONFIG } from "@repo/shared/src/app-config";
import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout auth: không header ứng dụng — panel thương hiệu + form. S1, S3, S4, "phiên đã thay đổi".
export const Route = createFileRoute("/_auth")({
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <div className="flex min-h-svh flex-col bg-card lg:flex-row">
      <aside className="flex flex-col gap-6 bg-[var(--elp-navy-dark)] px-6 py-6 text-white lg:w-[42%] lg:justify-between lg:px-14 lg:py-12">
        <div className="flex items-center gap-3">
          <img src="/app-icon.svg" alt="" className="size-9" />
          <span className="text-lg font-semibold">{APP_CONFIG.NAME}</span>
        </div>
        <div className="hidden max-w-md flex-col gap-5 lg:flex">
          <span className="h-1 w-12 bg-[var(--elp-yellow)]" />
          <p className="text-4xl leading-tight font-bold text-balance">
            Một tài khoản cho các hệ thống của Thành Đoàn Đồng Nai.
          </p>
          <p className="text-base leading-relaxed text-white/70">
            Đăng nhập một lần, mở các hệ thống đã liên kết mà không cần nhớ thêm mật khẩu.
          </p>
        </div>
      </aside>
      <main className="flex flex-1 items-start justify-center px-4 py-10 lg:items-center lg:px-12">
        <div className="auth-form w-full max-w-md">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
