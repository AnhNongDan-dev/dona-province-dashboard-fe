import { LogoutMode } from "@repo/zod-schemas/src/entity/central-auth-schema";
import { OtpChannel } from "@repo/zod-schemas/src/entity/link-transaction-schema";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import z from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { clientAPI } from "@/config/clientAPI.config";
import { useLogout } from "@/hooks/use-logout";
import { errorParam } from "@/lib/api-error";
import { broadcast, loadSession } from "@/lib/central-session";
import { sessionStore, useSession } from "@/lib/session-store";
import { mySecurityRepository } from "@/repositories/mySecurity.repository";
import { ContactOtpForm } from "../_app/account/-components/contacts-card";

// Màn "Thêm email cho tài khoản" (TASK-008). Tài khoản chưa có email đã xác minh bị giữ ở đây:
// sau D4 (`next=EMAIL_SETUP_REQUIRED`), hoặc khi hệ thống gọi authorize lúc phiên đã có
// (BE chuyển tới `/email-setup?req=`). Xác minh xong thì đi tiếp: có `req` → D3 `continueUrl`
// (vào hệ thống đã gọi); không → cổng tổng hợp. Không có [Để sau], chỉ [Đăng xuất].
export const Route = createFileRoute("/_auth/email-setup")({
  validateSearch: z.object({ req: z.string().optional().catch(undefined) }),
  beforeLoad: ({ search }) => {
    if (!sessionStore.get()?.authenticated) {
      throw redirect({ to: "/login", search: { req: search.req } });
    }
  },
  loader: () => mySecurityRepository().loader(),
  component: EmailSetupPage,
});

/** Tài khoản đã có email: làm mới phiên (hết bị chặn), báo các tab khác, rồi đi tiếp. */
async function proceed(req: string | undefined) {
  await loadSession().catch(() => null);
  broadcast("changed");
  if (req) {
    const res = await clientAPI.CentralAuth.getLoginContext({ query: { req } });
    if (res.success && res.data.continueUrl) return window.location.assign(res.data.continueUrl);
    // req hết hạn → LOGIN_REQUEST_EXPIRED + returnUrl: về lại hệ thống để nó gọi đăng nhập lại.
    const returnUrl = res.success ? null : errorParam(res, "returnUrl", "string");
    if (returnUrl) return window.location.assign(returnUrl);
  }
  window.location.assign("/");
}

function EmailSetupPage() {
  const { req } = Route.useSearch();
  const session = useSession();
  const { data } = mySecurityRepository().useQuery();
  const runLogout = useLogout();
  const email = data.contacts.find((c) => c.channel === OtpChannel.EMAIL);
  const pending = data.pendingContacts.find((c) => c.channel === OtpChannel.EMAIL) ?? null;
  const done = session?.identity?.emailSetupRequired === false || !!email;

  useEffect(() => {
    if (done) void proceed(req);
  }, [done, req]);

  if (done) {
    return (
      <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
        <Spinner /> Đang chuyển tiếp…
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Thêm email cho tài khoản</CardTitle>
        <CardDescription>
          Thành Đoàn Đồng Nai Central nay dùng <strong>email</strong> làm định danh chính. Hãy thêm
          và xác minh email để tiếp tục
          {session?.identity && (
            <>
              {" "}
              với tài khoản{" "}
              <span className="font-medium text-foreground">{session.identity.displayName}</span>
            </>
          )}
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <ContactOtpForm
          channel={OtpChannel.EMAIL}
          pending={pending}
          replacing={false}
          onClose={null}
        />
        <p className="text-xs text-muted-foreground">
          Email dùng để đăng nhập và lấy lại mật khẩu. Không phải bạn, hoặc đang dùng máy chung?
        </p>
        <Button variant="outline" onClick={() => void runLogout(LogoutMode.LOGOUT)}>
          Đăng xuất
        </Button>
      </CardContent>
    </Card>
  );
}
