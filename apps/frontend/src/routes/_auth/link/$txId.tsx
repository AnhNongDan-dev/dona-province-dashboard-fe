import { ErrorCode } from "@repo/zod-schemas/src/api/error.schema";
import type { ErrorResponse } from "@repo/zod-schemas/src/api/response";
import { credentialPolicySchema } from "@repo/zod-schemas/src/entity/central-auth-schema";
import {
  CentralStep,
  LinkAction,
  LinkIntent,
  LinkState,
} from "@repo/zod-schemas/src/entity/link-transaction-schema";
import { createFileRoute, Navigate, useRouterState } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { clientAPI } from "@/config/clientAPI.config";
import { errorMessage } from "@/lib/api-error";
import { loadSession } from "@/lib/central-session";
import { CentralLoginStep } from "./-components/central-login-step";
import { ConfirmStep } from "./-components/confirm-step";
import { ReauthCurrentStep } from "./-components/reauth-current-step";
import { AwaitingLegacy, Completed, Ended, TxLoadError } from "./-components/tx-parts";
import { fetchTx, parseTx, TX_RELOAD_CODES, type TxResult, type Wizard } from "./-lib";

// Wizard liên kết. BE chuyển trình duyệt tới đây sau khi xác minh tài khoản
// ở hệ thống cũ. Giao dịch gắn với trình duyệt bằng cookie của BE; FE dựng hoàn toàn theo trạng
// thái giao dịch và chỉ hiện nút có trong allowedActions. Cố ý không cache (React Query): mỗi bước
// là một thao tác trên giao dịch, dữ liệu cũ vô nghĩa.
export const Route = createFileRoute("/_auth/link/$txId")({
  loader: async ({ params }) => {
    const [tx, policy] = await Promise.all([
      fetchTx(params.txId),
      clientAPI.CentralAuth.getCredentialPolicy(),
    ]);
    return { tx, policy: policy.success ? credentialPolicySchema.parse(policy.data) : null };
  },
  // Mỗi lần vào trang (kể cả quay lại bằng Back) phải đọc trạng thái giao dịch mới.
  staleTime: 0,
  gcTime: 0,
  component: LinkPage,
});

function LinkPage() {
  const { txId } = Route.useParams();
  const loaded = Route.useLoaderData();
  const [result, setResult] = useState<TxResult>(loaded.tx);
  // Từ trang đăng ký bấm "Đăng nhập" → ở lại form đăng nhập dù giao dịch mở với intent=CREATE.
  const preferLogin = useRouterState({ select: (s) => !!s.location.state.preferLogin });

  const reload = useCallback(async () => setResult(await fetchTx(txId)), [txId]);

  if (!result.ok) return <TxLoadError error={result.error} onRetry={() => void reload()} />;
  const tx = result.tx;

  const w: Wizard = {
    txId,
    tx,
    policy: loaded.policy,
    setTx: (data) => setResult({ ok: true, tx: parseTx(data) }),
    reload,
    fail: (res: ErrorResponse) => {
      if (
        res.errorCode === ErrorCode.SessionExpired ||
        res.errorCode === ErrorCode.SessionChanged
      ) {
        // Liên kết từ Account Center: bộ xử lý chung bỏ qua 2 mã này ở wizard → tự đọc lại phiên
        // (token + chủ phiên hiện tại).
        void loadSession().catch(() => null);
      }
      if (TX_RELOAD_CODES.includes(res.errorCode)) void reload();
      return errorMessage(res);
    },
    can: (action) => tx.allowedActions.includes(action),
  };

  const cancel = async () => {
    const res = await clientAPI.LinkTransaction.cancelLinkTransaction({ params: { txId } });
    if (res.success) w.setTx(res.data);
    else toast.error(w.fail(res));
  };

  switch (tx.state) {
    case LinkState.COMPLETED:
      return <Completed tx={tx} />;
    case LinkState.CANCELLED:
    case LinkState.FAILED:
    case LinkState.EXPIRED:
      return <Ended tx={tx} />;
    case LinkState.AWAITING_LEGACY_VERIFICATION:
      return <AwaitingLegacy w={w} onCancel={() => void cancel()} />;
    case LinkState.CENTRAL_VERIFIED:
      return <ConfirmStep w={w} onCancel={() => void cancel()} />;
    default:
      // LEGACY_VERIFIED. "Chưa — đăng ký" ở hệ thống cũ → trang đăng ký chung, mang theo giao dịch.
      if (tx.intent === LinkIntent.CREATE && w.can(LinkAction.REGISTER) && !preferLogin) {
        return <Navigate to="/register/{-$regId}" search={{ linkTx: txId }} replace />;
      }
      // Từ Account Center: chỉ xác thực lại chủ phiên; từ hệ thống cũ: đăng nhập tài khoản Central
      // muốn liên kết.
      return tx.centralStep === CentralStep.REAUTH_CURRENT ? (
        <ReauthCurrentStep key="reauth" w={w} onCancel={() => void cancel()} />
      ) : (
        <CentralLoginStep key="link" w={w} onCancel={() => void cancel()} />
      );
  }
}
