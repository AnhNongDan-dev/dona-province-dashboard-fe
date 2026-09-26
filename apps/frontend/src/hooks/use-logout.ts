import { LogoutMode } from "@repo/zod-schemas/src/entity/central-auth-schema";
import { useNavigate } from "@tanstack/react-router";
import { logout } from "@/lib/central-session";

/** F3 đăng xuất → S3 (kèm danh sách hệ thống đã gửi yêu cầu); F4 đổi người dùng → S1 form trống. */
export function useLogout() {
  const navigate = useNavigate();
  return async (mode: LogoutMode) => {
    const notifiedClients = await logout(mode);
    if (!notifiedClients) return;
    if (mode === LogoutMode.SWITCH_USER) {
      await navigate({ to: "/login", search: { switched: true } });
    } else {
      await navigate({ to: "/logged-out", state: { notifiedClients } });
    }
  };
}
