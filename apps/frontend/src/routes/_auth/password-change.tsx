import { ErrorCode } from "@repo/zod-schemas/src/api/error.schema";
import { LogoutMode } from "@repo/zod-schemas/src/entity/central-auth-schema";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import z from "zod";
import { isNewPasswordReady, NewPasswordFields } from "@/components/auth/new-password-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { clientAPI } from "@/config/clientAPI.config";
import { useLogout } from "@/hooks/use-logout";
import { errorMessage } from "@/lib/api-error";
import { continueAfterGate } from "@/lib/central-session";
import { sessionStore, useSession } from "@/lib/session-store";
import { credentialPolicyRepository } from "@/repositories/credentialPolicy.repository";

// Màn "Đổi mật khẩu" bắt buộc (TASK-006): đăng nhập bằng mật khẩu tạm quản trị viên cấp. Vào từ
// D4 (`next=PASSWORD_CHANGE_REQUIRED`), từ authorize (`/password-change?req=`) hoặc khi API trả
// PASSWORD_CHANGE_REQUIRED. Đổi xong: còn thiếu email → màn thêm email; có `req` → D3; không → "/".
export const Route = createFileRoute("/_auth/password-change")({
  validateSearch: z.object({ req: z.string().optional().catch(undefined) }),
  beforeLoad: ({ search }) => {
    if (!sessionStore.get()?.authenticated) {
      throw redirect({ to: "/login", search: { req: search.req } });
    }
  },
  loader: () => credentialPolicyRepository().loader(),
  component: PasswordChangePage,
});

// Ở màn này "mật khẩu hiện tại" chính là mật khẩu tạm.
const SERVER_LABELS = { NOT_SAME_AS_CURRENT: "Khác mật khẩu tạm" };

function PasswordChangePage() {
  const { req } = Route.useSearch();
  const session = useSession();
  const { data: policy } = credentialPolicyRepository().useQuery();
  const runLogout = useLogout();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [serverCodes, setServerCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const identity = session?.identity;
  // Không (còn) bị cổng: đổi ở tab khác, hoặc vào nhầm → đi tiếp luôn.
  const done = identity?.passwordChangeRequired === false;

  useEffect(() => {
    if (done) void continueAfterGate(req);
  }, [done, req]);

  if (done || !identity) {
    return (
      <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
        <Spinner /> Đang chuyển tiếp…
      </div>
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    // D20b cần xác thực ≤ 5 phút: để màn quá lâu thì clientAPI mở S2 rồi gửi lại một lần.
    const res = await clientAPI.AccountCenter.changeMyPassword({ body: { newPassword: password } });
    if (res.success) return continueAfterGate(req); // giữ pending tới khi rời trang
    setPending(false);
    if (res.errorCode === ErrorCode.PasswordPolicyViolation) {
      return setServerCodes(res.errors.map((er) => er.code));
    }
    setError(
      res.errorCode === ErrorCode.ReauthRequired
        ? "Cần xác nhận lại mật khẩu tạm để đổi mật khẩu."
        : errorMessage(res),
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Đổi mật khẩu</CardTitle>
        <CardDescription>
          Tài khoản <span className="font-medium text-foreground">{identity.displayName}</span> đang
          dùng mật khẩu tạm do quản trị viên cấp. Hãy đặt mật khẩu mới để tiếp tục.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <NewPasswordFields
              policy={policy}
              username={identity.username}
              password={password}
              setPassword={(v) => {
                setPassword(v);
                setServerCodes([]);
              }}
              confirm={confirm}
              setConfirm={setConfirm}
              serverCodes={serverCodes}
              serverLabels={SERVER_LABELS}
            />
            <Button
              type="submit"
              disabled={
                pending ||
                !isNewPasswordReady(policy, identity.username, password, confirm, serverCodes)
              }
            >
              {pending && <Spinner />}
              Đổi mật khẩu và tiếp tục
            </Button>
          </FieldGroup>
        </form>
        <p className="text-xs text-muted-foreground">Không phải bạn, hoặc đang dùng máy chung?</p>
        <Button variant="outline" onClick={() => void runLogout(LogoutMode.LOGOUT)}>
          Đăng xuất
        </Button>
      </CardContent>
    </Card>
  );
}
