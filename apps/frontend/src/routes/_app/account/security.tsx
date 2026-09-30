import { ErrorCode } from "@repo/zod-schemas/src/api/error.schema";
import { passwordUpdateResultSchema } from "@repo/zod-schemas/src/entity/account-center-schema";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { isNewPasswordReady, NewPasswordFields } from "@/components/auth/new-password-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { clientAPI } from "@/config/clientAPI.config";
import { errorMessage } from "@/lib/api-error";
import {
  type CredentialPolicyDTO,
  credentialPolicyRepository,
} from "@/repositories/credentialPolicy.repository";
import { mySecurityRepository } from "@/repositories/mySecurity.repository";
import { ContactsCard } from "./-components/contacts-card";
import { MergeCard } from "./-components/merge-card";

// Bảo mật: thông tin, kênh liên lạc (email / SĐT), đổi mật khẩu, gộp tài khoản. Các thao tác
// ghi cần xác thực lại (hộp xác thực lại tự mở).
export const Route = createFileRoute("/_app/account/security")({
  loader: () =>
    Promise.all([mySecurityRepository().loader(), credentialPolicyRepository().loader()]),
  component: SecurityPage,
});

const fmt = (d: Date) => format(d, "dd/MM/yyyy HH:mm");

function SecurityPage() {
  const security = mySecurityRepository().useQuery();
  const { data: policy } = credentialPolicyRepository().useQuery();

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <h1 className="text-xl font-semibold">Bảo mật</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thông tin đăng nhập</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {security.isError ? (
            <div className="flex items-center gap-3 text-destructive">
              Không tải được thông tin.
              <Button size="sm" variant="outline" onClick={() => void security.refetch()}>
                Thử lại
              </Button>
            </div>
          ) : security.isLoading ? (
            <Skeleton className="h-20" />
          ) : (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
              <dt className="text-muted-foreground">Tên đăng nhập</dt>
              <dd className="font-medium">{security.data.username}</dd>
              <dt className="text-muted-foreground">Đổi mật khẩu gần nhất</dt>
              <dd>{fmt(security.data.passwordChangedAt)}</dd>
            </dl>
          )}
        </CardContent>
      </Card>
      {!security.isLoading && !security.isError && (
        <>
          <ContactsCard security={security.data} />
          <ChangePasswordCard username={security.data.username} policy={policy} />
          <MergeCard />
        </>
      )}
    </div>
  );
}

function ChangePasswordCard({
  username,
  policy,
}: {
  username: string;
  policy: CredentialPolicyDTO;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [serverCodes, setServerCodes] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    // Cần xác thực lại: clientAPI tự mở hộp xác thực lại khi gặp REAUTH_REQUIRED rồi gửi lại một
    // lần.
    const res = await clientAPI.AccountCenter.changeMyPassword({ body: { newPassword: password } });
    setPending(false);
    if (res.success) {
      const result = passwordUpdateResultSchema.parse(res.data);
      mySecurityRepository().updateCache({ passwordChangedAt: result.passwordChangedAt });
      setPassword("");
      setConfirm("");
      // Phiên hiện tại giữ nguyên token → không cần báo các tab khác.
      return toast.success(
        result.revokedCount > 0
          ? `Đã đổi mật khẩu. Đã đăng xuất ${result.revokedCount} phiên khác.`
          : "Đã đổi mật khẩu.",
      );
    }
    if (res.errorCode === ErrorCode.PasswordPolicyViolation) {
      return setServerCodes(res.errors.map((er) => er.code));
    }
    toast.error(
      res.errorCode === ErrorCode.ReauthRequired
        ? "Cần xác nhận lại mật khẩu hiện tại để đổi mật khẩu."
        : errorMessage(res),
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Đổi mật khẩu</CardTitle>
        <CardDescription>
          Sau khi đổi, mọi phiên đăng nhập khác của bạn sẽ bị đăng xuất; phiên này vẫn giữ nguyên.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <NewPasswordFields
              policy={policy}
              username={username}
              password={password}
              setPassword={(v) => {
                setPassword(v);
                setServerCodes([]);
              }}
              confirm={confirm}
              setConfirm={setConfirm}
              serverCodes={serverCodes}
            />
            <Button
              type="submit"
              disabled={
                pending || !isNewPasswordReady(policy, username, password, confirm, serverCodes)
              }
            >
              {pending && <Spinner />}
              Đổi mật khẩu
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
