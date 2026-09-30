import { initContract } from "@ts-rest/core";
import z from "zod";
import { ErrorCode } from "../api/error.schema";
import { successResponseSchema } from "../api/response";
import {
  linkTransactionCreateResultSchema,
  linkTransactionSchema,
} from "../entity/link-transaction-schema";
import { OpenAPIHelper } from "../openapi/openAPI.helper";

const c = initContract();

// Giao dịch liên kết. Nhánh tạo tài khoản trong giao dịch đã gỡ — đăng ký dùng
// registration.contract. Gắn với trình duyệt bằng cookie riêng của BE, không cần phiên đã đăng
// nhập. Request ghi vẫn gửi X-CSRF-TOKEN (clientAPI tự gắn).
const txParams = z.object({ txId: z.guid() });
const TX_ERRORS = [
  ErrorCode.LinkTxNotFound,
  ErrorCode.LinkTxExpired,
  ErrorCode.LinkTxInvalidState,
] as const;

export const linkTransactionContract = c.router({
  createLinkTransaction: {
    summary: "Bắt đầu liên kết từ Account Center",
    description:
      "Cần phiên. BE đặt cookie gắn giao dịch; FE điều hướng top-level tới legacyVerifyUrl.",
    method: "POST",
    path: "/api/link-transactions",
    body: z.object({ providerCode: z.string().min(1) }),
    responses: { 200: successResponseSchema(linkTransactionCreateResultSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(
      ErrorCode.ProviderAlreadyLinked,
      ErrorCode.ProviderUnavailable,
      ErrorCode.ValidationError,
    ),
  },
  getLinkTransaction: {
    summary: "Trạng thái giao dịch",
    description: "COMPLETED đọc được 30 phút sau khi hoàn tất; FAILED/CANCELLED tới khi hết hạn.",
    method: "GET",
    path: "/api/link-transactions/:txId",
    pathParams: txParams,
    responses: { 200: successResponseSchema(linkTransactionSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(ErrorCode.LinkTxNotFound, ErrorCode.LinkTxExpired),
  },
  centralLoginLinkTransaction: {
    summary: "Đăng nhập Central trong giao dịch",
    description:
      "FRESH_LOGIN { loginId, password }: phiên đổi ngay (PROVIDER_ALREADY_LINKED vẫn kèm token mới). " +
      "REAUTH_CURRENT { password }: chỉ xác thực lại chủ phiên, token không đổi.",
    method: "POST",
    path: "/api/link-transactions/:txId/central-login",
    pathParams: txParams,
    body: z.object({
      // Bỏ trống ở REAUTH_CURRENT (BE bỏ qua).
      loginId: z.string().trim().min(1).nullable(),
      password: z.string().min(1, "Vui lòng nhập mật khẩu"),
    }),
    responses: { 200: successResponseSchema(linkTransactionSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(
      ...TX_ERRORS,
      ErrorCode.InvalidLoginCredentials,
      ErrorCode.RateLimited,
      ErrorCode.AccountLocked,
      ErrorCode.IdentityMerged,
      ErrorCode.ProviderAlreadyLinked,
      ErrorCode.SessionExpired,
      ErrorCode.SessionChanged,
    ),
  },
  confirmLinkTransaction: {
    summary: "Xác nhận liên kết",
    description: "User phải tick xác nhận hai tài khoản đều là của mình.",
    method: "POST",
    path: "/api/link-transactions/:txId/confirm",
    pathParams: txParams,
    body: z.object({ acknowledged: z.literal(true) }),
    responses: { 200: successResponseSchema(linkTransactionSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(
      ...TX_ERRORS,
      ErrorCode.ExternalAlreadyLinked,
      ErrorCode.ProviderAlreadyLinked,
      ErrorCode.SessionChanged,
      ErrorCode.LegacyAuthTooOld,
    ),
  },
  cancelLinkTransaction: {
    summary: "Hủy giao dịch",
    description: "Trả giao dịch ở CANCELLED kèm returnUrl.",
    method: "POST",
    path: "/api/link-transactions/:txId/cancel",
    pathParams: txParams,
    body: c.noBody(),
    responses: { 200: successResponseSchema(linkTransactionSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(...TX_ERRORS),
  },
});
