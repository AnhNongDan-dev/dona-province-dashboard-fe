import { initContract } from "@ts-rest/core";
import z from "zod";
import { ErrorCode } from "../api/error.schema";
import { successResponseSchema } from "../api/response";
import { mergeKeepZod, mergeTransactionSchema } from "../entity/merge-transaction-schema";
import { OpenAPIHelper } from "../openapi/openAPI.helper";

const c = initContract();

// Gộp tài khoản do user tự làm. Gắn trình duyệt (cookie) + phiên đã tạo giao dịch:
// phiên hết / đổi người → FAILED. Bước đăng nhập tài khoản thứ hai KHÔNG đổi phiên.
const txParams = z.object({ txId: z.guid() });
const TX_ERRORS = [
  ErrorCode.MergeTxNotFound,
  ErrorCode.MergeTxExpired,
  ErrorCode.MergeTxInvalidState,
  ErrorCode.SessionExpired,
  ErrorCode.SessionChanged,
] as const;

export const mergeTransactionContract = c.router({
  createMergeTransaction: {
    summary: "Bắt đầu gộp tài khoản",
    description: "Cần xác thực lại ≤ 5 phút. Tài khoản đang đăng nhập là tài khoản giữ lại.",
    method: "POST",
    path: "/api/merge-transactions",
    body: c.noBody(),
    responses: { 200: successResponseSchema(z.object({ txId: z.guid() })) },
    metadata: OpenAPIHelper.generateErrorCodes(ErrorCode.ReauthRequired),
  },
  getMergeTransaction: {
    summary: "Trạng thái giao dịch gộp",
    description:
      "COMPLETED đọc lại được 30 phút; source / conflicts / contactChanges có sau bước 2.",
    method: "GET",
    path: "/api/merge-transactions/:txId",
    pathParams: txParams,
    responses: { 200: successResponseSchema(mergeTransactionSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(...TX_ERRORS),
  },
  centralLoginMergeTransaction: {
    summary: "Xác thực tài khoản sẽ gộp vào",
    description:
      "Chỉ xác thực, phiên / token giữ nguyên. ACCOUNT_LOCKED / IDENTITY_MERGED / MERGE_SAME_IDENTITY không làm hỏng giao dịch.",
    method: "POST",
    path: "/api/merge-transactions/:txId/central-login",
    pathParams: txParams,
    body: z.object({
      loginId: z.string().trim().min(1, "Vui lòng nhập tên đăng nhập, email hoặc số điện thoại"),
      password: z.string().min(1, "Vui lòng nhập mật khẩu"),
    }),
    responses: { 200: successResponseSchema(mergeTransactionSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(
      ...TX_ERRORS,
      ErrorCode.InvalidLoginCredentials,
      ErrorCode.RateLimited,
      ErrorCode.AccountLocked,
      ErrorCode.IdentityMerged,
      ErrorCode.MergeSameIdentity,
    ),
  },
  confirmMergeTransaction: {
    summary: "Xác nhận gộp",
    description:
      "Một giao dịch dữ liệu: chuyển liên kết, giải xung đột, chuyển / bỏ kênh, khóa source.",
    method: "POST",
    path: "/api/merge-transactions/:txId/confirm",
    pathParams: txParams,
    body: z.object({
      acknowledged: z.literal(true),
      conflictResolutions: z.array(z.object({ providerCode: z.string(), keep: mergeKeepZod })),
    }),
    responses: { 200: successResponseSchema(mergeTransactionSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(
      ...TX_ERRORS,
      ErrorCode.MergeConflictUnresolved,
      ErrorCode.MergeRequiresAdmin,
      ErrorCode.ValidationError,
    ),
  },
  cancelMergeTransaction: {
    summary: "Hủy gộp",
    description: "Trả giao dịch ở CANCELLED.",
    method: "POST",
    path: "/api/merge-transactions/:txId/cancel",
    pathParams: txParams,
    body: c.noBody(),
    responses: { 200: successResponseSchema(mergeTransactionSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(...TX_ERRORS),
  },
});
