import { ErrorCode } from "@repo/zod-schemas/src/api/error.schema";
import type { ErrorResponse } from "@repo/zod-schemas/src/api/response";
import { credentialPolicySchema } from "@repo/zod-schemas/src/entity/central-auth-schema";
import {
  CentralStep,
  LinkIntent,
  LinkState,
} from "@repo/zod-schemas/src/entity/link-transaction-schema";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { clientAPI } from "@/config/clientAPI.config";
import { errorMessage } from "@/lib/api-error";
import { loadSession } from "@/lib/central-session";
import { CentralLoginStep } from "./-components/central-login-step";
import { ConfirmStep } from "./-components/confirm-step";
import { CreateFlow } from "./-components/create-flow";
import { ReauthCurrentStep } from "./-components/reauth-current-step";
import { AwaitingLegacy, Completed, Ended, TxLoadError } from "./-components/tx-parts";
import { fetchTx, parseTx, TX_RELOAD_CODES, type TxResult, type Wizard } from "./-lib";

// S5/S6/S7 — wizard liên kết / tạo mới. BE chuyển trình duyệt tới đây sau khi xác minh tài khoản
// ở hệ thống cũ. Giao dịch gắn với trình duyệt bằng cookie của BE; FE dựng hoàn toàn theo D9 và
// chỉ hiện nút có trong allowedActions. Cố ý không cache (React Query): mỗi bước là một thao tác
// trên giao dịch, dữ liệu cũ vô nghĩa.
export const Route = createFileRoute("/_auth/link/$txId")({
  loader: async ({ params }) => {
    const [tx, policy] = await Promise.all([
      fetchTx(params.txId),
      clientAPI.CentralAuth.getCredentialPolicy(),
    ]);
    return { tx, policy: policy.success ? credentialPolicySchema.parse(policy.data) : null };
  },
  // Mỗi lần vào trang (kể cả quay lại bằng Back) phải đọc D9 mới.
  staleTime: 0,
  gcTime: 0,
  component: LinkPage,
});

function LinkPage() {
  const { txId } = Route.useParams();
  const loaded = Route.useLoaderData();
  const [result, setResult] = useState<TxResult>(loaded.tx);
  const [notice, setNotice] = useState<string | null>(null);

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
        // F6: bộ xử lý chung bỏ qua 2 mã này ở wizard → tự đọc lại D1 (token + chủ phiên hiện tại).
        void loadSession().catch(() => null);
      }
      if (TX_RELOAD_CODES.includes(res.errorCode)) void reload();
      return errorMessage(res);
    },
    can: (action) => tx.allowedActions.includes(action),
    notice,
    setNotice,
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
      // LEGACY_VERIFIED / CONTACT_VERIFIED — rẽ theo nhánh. key: đổi nhánh thì dựng lại từ đầu.
      if (tx.intent === LinkIntent.CREATE) {
        return <CreateFlow key="create" w={w} onCancel={() => void cancel()} />;
      }
      // F6 (từ Account Center): chỉ xác thực lại chủ phiên; F5: đăng nhập tài khoản SSO muốn liên kết.
      return tx.centralStep === CentralStep.REAUTH_CURRENT ? (
        <ReauthCurrentStep key="reauth" w={w} onCancel={() => void cancel()} />
      ) : (
        <CentralLoginStep key="link" w={w} onCancel={() => void cancel()} />
      );
  }
}
