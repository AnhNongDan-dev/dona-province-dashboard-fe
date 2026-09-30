import { ErrorCode } from "@repo/zod-schemas/src/api/error.schema";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { clientAPI } from "@/config/clientAPI.config";
import { errorMessage } from "@/lib/api-error";
import { useSession } from "@/lib/session-store";

/**
 * Bắt đầu gộp (cần xác thực lại: clientAPI tự mở hộp xác thực lại khi gặp REAUTH_REQUIRED rồi gửi
 * lại một lần) → /merge/:txId. Dùng ở khối "Gộp tài khoản" và gợi ý khi CONTACT_ALREADY_USED.
 */
export function useStartMerge() {
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);

  async function start() {
    setStarting(true);
    const res = await clientAPI.MergeTransaction.createMergeTransaction();
    setStarting(false);
    if (res.success) return navigate({ to: "/merge/$txId", params: { txId: res.data.txId } });
    toast.error(
      res.errorCode === ErrorCode.ReauthRequired
        ? "Cần xác nhận lại mật khẩu để gộp tài khoản."
        : errorMessage(res),
    );
  }

  return { start, starting };
}

export function MergeCard() {
  const identity = useSession()?.identity;
  const { start, starting } = useStartMerge();
  const [explained, setExplained] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Gộp tài khoản</CardTitle>
        <CardDescription>
          Bạn lỡ có hai tài khoản Thành Đoàn Đồng Nai Central? Gộp tài khoản kia vào tài khoản này
          để chỉ dùng một.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {!explained ? (
          <Button variant="outline" className="self-start" onClick={() => setExplained(true)}>
            Tôi có một tài khoản khác
          </Button>
        ) : (
          <>
            <p>
              Tài khoản đang đăng nhập (<strong>{identity?.displayName}</strong> ·{" "}
              {identity?.maskedLoginId}) sẽ được <strong>giữ lại</strong>. Muốn giữ tài khoản kia,
              hãy đăng nhập tài khoản đó rồi gộp từ đó.
            </p>
            <div className="flex gap-2">
              <Button disabled={starting} onClick={() => void start()}>
                {starting && <Spinner />}
                Tiếp tục
              </Button>
              <Button variant="ghost" onClick={() => setExplained(false)}>
                Thôi
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
