import { ErrorCode } from "@repo/zod-schemas/src/api/error.schema";
import type { ErrorResponse } from "@repo/zod-schemas/src/api/response";
import type { CredentialPolicy } from "@repo/zod-schemas/src/entity/central-auth-schema";
import {
  type LinkAction,
  type LinkTransaction,
  linkTransactionSchema,
} from "@repo/zod-schemas/src/entity/link-transaction-schema";
import { clientAPI } from "@/config/clientAPI.config";

// clientAPI không validate response → parse để các mốc thời gian thành Date.
export const parseTx = (data: unknown) => linkTransactionSchema.parse(data);

export type TxResult = { ok: true; tx: LinkTransaction } | { ok: false; error: ErrorResponse };

export async function fetchTx(txId: string): Promise<TxResult> {
  const res = await clientAPI.LinkTransaction.getLinkTransaction({ params: { txId } });
  return res.success ? { ok: true, tx: parseTx(res.data) } : { ok: false, error: res };
}

/**
 * Mã báo giao dịch đã đổi trạng thái phía BE (FAILED, hết hạn, sai bước…). Gặp các mã này FE
 * không tự đoán mà đọc lại D9 rồi hiện màn theo state / failureCode (TASK-003 quyết định 12).
 */
export const TX_RELOAD_CODES: string[] = [
  ErrorCode.ProviderAlreadyLinked,
  ErrorCode.ExternalAlreadyLinked,
  ErrorCode.SessionChanged,
  ErrorCode.LinkTxNotFound,
  ErrorCode.LinkTxExpired,
  ErrorCode.LinkTxInvalidState,
  ErrorCode.LegacyAuthTooOld,
  ErrorCode.PhoneVerificationRequired,
];

/** Những gì mỗi bước của wizard cần — truyền xuống từ trang /link/$txId. */
export type Wizard = {
  txId: string;
  tx: LinkTransaction;
  policy: CredentialPolicy | null;
  setTx: (data: unknown) => void;
  reload: () => Promise<void>;
  /** Hiện lỗi của một request; mã trong TX_RELOAD_CODES thì đọc lại D9. Trả câu để hiển thị. */
  fail: (res: ErrorResponse) => string;
  can: (action: LinkAction) => boolean;
  /** Thông báo khi giao dịch tự chuyển sang LINK (OTP đúng mà SĐT/email đã có chủ). */
  notice: string | null;
  setNotice: (notice: string | null) => void;
};

// Số di động VN 10 số, đầu 03/05/07/08/09; nhận 0… hoặc +84… (TASK-003 câu 7). BE kiểm lại.
export const VN_MOBILE = /^(0|\+84)(3|5|7|8|9)\d{8}$/;
export const normalizePhoneInput = (v: string) => v.replace(/[\s.-]/g, "");
