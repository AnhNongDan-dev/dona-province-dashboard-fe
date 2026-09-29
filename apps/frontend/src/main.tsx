import type { NotifiedClient } from "@repo/zod-schemas/src/entity/central-auth-schema";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/600.css";
import "@fontsource/be-vietnam-pro/700.css";
import "@/css/main.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { queryClient } from "@/config/query-client.config";
import { routeTree } from "@/routeTree.gen";

// !IMPORTANT: Route types
// https://tanstack.com/router/latest/docs/framework/react/decisions-on-dx#declaring-the-router-instance-for-type-inference
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
  interface HistoryState {
    /** D6 → S3: hệ thống đã được gửi yêu cầu đăng xuất. */
    notifiedClients?: NotifiedClient[];
    /** Đăng ký → đăng nhập: điền sẵn định danh (SĐT / email vừa chứng minh sở hữu), không lên URL. */
    loginId?: string;
    /** Đăng ký → /link/$txId: muốn đăng nhập, không tự chuyển lại trang đăng ký (intent=CREATE). */
    preferLogin?: boolean;
  }
}

const router = createRouter({ routeTree });

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <Toaster position="top-right" closeButton duration={3000} />
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
