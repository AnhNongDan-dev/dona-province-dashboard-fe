import { LinkAction } from "@repo/zod-schemas/src/entity/link-transaction-schema";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { clientAPI } from "@/config/clientAPI.config";
import type { Wizard } from "../-lib";
import { AccountCard, ErrorAlert, LegacyAccountCard, messageOf, TxShell } from "./tx-parts";

/** F5 bước xác nhận — tuyến phòng thủ cuối trên máy dùng chung: hai thẻ + tick xác nhận. */
export function ConfirmStep({ w, onCancel }: { w: Wizard; onCancel: () => void }) {
  const { tx } = w;
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retry = w.can(LinkAction.RETRY_LEGACY_VERIFICATION) && tx.legacyVerifyUrl;

  async function confirm() {
    setPending(true);
    setError(null);
    const res = await clientAPI.LinkTransaction.confirmLinkTransaction({
      params: { txId: w.txId },
      body: { acknowledged: true },
    });
    setPending(false);
    if (res.success) w.setTx(res.data);
    else setError(w.fail(res));
  }

  return (
    <TxShell
      tx={tx}
      title="Xác nhận liên kết"
      description="Kiểm tra kỹ hai tài khoản dưới đây trước khi liên kết."
      onExpire={() => void w.reload()}
    >
      {tx.centralIdentity && (
        <AccountCard
          label="Tài khoản Thành Đoàn Đồng Nai Central"
          primary={tx.centralIdentity.displayName}
          secondary={tx.centralIdentity.maskedLoginId}
          tenantName={tx.centralIdentity.tenantName}
        />
      )}
      <LegacyAccountCard tx={tx} />
      {tx.lastErrorCode && <ErrorAlert message={messageOf(tx.lastErrorCode)} />}
      <ErrorAlert message={error} />
      {retry ? (
        <Button asChild>
          <a href={tx.legacyVerifyUrl!}>Xác minh lại tài khoản {tx.provider.name}</a>
        </Button>
      ) : (
        <>
          <Field orientation="horizontal">
            <Checkbox
              id="acknowledged"
              checked={acknowledged}
              onCheckedChange={(v) => setAcknowledged(v === true)}
            />
            <FieldLabel htmlFor="acknowledged" className="font-normal">
              Tôi xác nhận hai tài khoản này đều là của tôi
            </FieldLabel>
          </Field>
          <Button
            disabled={!acknowledged || pending || !w.can(LinkAction.CONFIRM)}
            onClick={() => void confirm()}
          >
            {pending && <Spinner />}
            Liên kết
          </Button>
        </>
      )}
      {w.can(LinkAction.CANCEL) && (
        <Button variant="outline" onClick={onCancel}>
          Hủy
        </Button>
      )}
    </TxShell>
  );
}
