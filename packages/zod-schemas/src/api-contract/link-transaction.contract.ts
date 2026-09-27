import { initContract } from "@ts-rest/core";
import z from "zod";
import { ErrorCode } from "../api/error.schema";
import { successResponseSchema } from "../api/response";
import {
  identityCreateResultSchema,
  linkIntentZod,
  linkTransactionCreateResultSchema,
  linkTransactionSchema,
  otpChannelZod,
  otpSendResultSchema,
  otpVerifyResultSchema,
  usernameAvailabilitySchema,
} from "../entity/link-transaction-schema";
import { OpenAPIHelper } from "../openapi/openAPI.helper";

const c = initContract();

// Giao dịch liên kết / tạo mới (TASK-001 D9–D15, D23; TASK-003). Gắn với trình duyệt bằng cookie
// riêng của BE, không cần phiên đã đăng nhập. Request ghi vẫn gửi X-CSRF-TOKEN (clientAPI tự gắn).
const txParams = z.object({ txId: z.guid() });
const TX_ERRORS = [
  ErrorCode.LinkTxNotFound,
  ErrorCode.LinkTxExpired,
  ErrorCode.LinkTxInvalidState,
] as const;

export const linkTransactionContract = c.router({
  createLinkTransaction: {
    summary: "D8 — Bắt đầu liên kết từ Account Center (F6)",
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
    summary: "D9 — Trạng thái giao dịch",
    description: "COMPLETED đọc được 30 phút sau khi hoàn tất; FAILED/CANCELLED tới khi hết hạn.",
    method: "GET",
    path: "/api/link-transactions/:txId",
    pathParams: txParams,
    responses: { 200: successResponseSchema(linkTransactionSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(ErrorCode.LinkTxNotFound, ErrorCode.LinkTxExpired),
  },
  switchLinkIntent: {
    summary: "D13 — Đổi nhánh liên kết ↔ tạo mới",
    description:
      "Chỉ khi còn LEGACY_VERIFIED / CONTACT_VERIFIED (SWITCH_TO_LINK / SWITCH_TO_CREATE).",
    method: "POST",
    path: "/api/link-transactions/:txId/intent",
    pathParams: txParams,
    body: z.object({ intent: linkIntentZod }),
    responses: { 200: successResponseSchema(linkTransactionSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(...TX_ERRORS),
  },
  centralLoginLinkTransaction: {
    summary: "D10 — Đăng nhập Central trong giao dịch",
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
    summary: "D11 — Xác nhận liên kết",
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
    summary: "D11 — Hủy giao dịch",
    description: "Trả giao dịch ở CANCELLED kèm returnUrl.",
    method: "POST",
    path: "/api/link-transactions/:txId/cancel",
    pathParams: txParams,
    body: c.noBody(),
    responses: { 200: successResponseSchema(linkTransactionSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(...TX_ERRORS),
  },
  sendLinkOtp: {
    summary: "D14 — Gửi mã OTP",
    description: "Tính riêng từng kênh: 3 lần gửi / giao dịch, cách nhau 60 giây.",
    method: "POST",
    path: "/api/link-transactions/:txId/otp",
    pathParams: txParams,
    body: z.object({ channel: otpChannelZod, destination: z.string().trim().min(1) }),
    responses: { 200: successResponseSchema(otpSendResultSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(
      ...TX_ERRORS,
      ErrorCode.RateLimited,
      ErrorCode.OtpTooManyAttempts,
      ErrorCode.ContactAlreadyUsed,
      ErrorCode.ValidationError,
    ),
  },
  verifyLinkOtp: {
    summary: "D14 — Xác minh mã OTP",
    description: "Kênh đã thuộc identity khác → giao dịch tự chuyển sang LINK (không phải lỗi).",
    method: "POST",
    path: "/api/link-transactions/:txId/otp/verify",
    pathParams: txParams,
    body: z.object({ channel: otpChannelZod, code: z.string().trim().min(1) }),
    responses: { 200: successResponseSchema(otpVerifyResultSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(
      ...TX_ERRORS,
      ErrorCode.OtpInvalid,
      ErrorCode.OtpExpired,
      ErrorCode.OtpTooManyAttempts,
    ),
  },
  createIdentity: {
    summary: "D15 — Tạo tài khoản SSO",
    description: "Chỉ khi SĐT đã xác minh trong giao dịch. Thành công → user được đăng nhập.",
    method: "POST",
    path: "/api/link-transactions/:txId/create-identity",
    pathParams: txParams,
    body: z.object({
      username: z.string().trim().min(1),
      displayName: z.string().trim().min(1),
      password: z.string().min(1),
    }),
    responses: { 200: successResponseSchema(identityCreateResultSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(
      ...TX_ERRORS,
      ErrorCode.UsernameTaken,
      ErrorCode.UsernamePolicyViolation,
      ErrorCode.PasswordPolicyViolation,
      ErrorCode.PhoneVerificationRequired,
      ErrorCode.ExternalAlreadyLinked,
    ),
  },
  checkUsernameAvailability: {
    summary: "D23 — Kiểm tra username khi gõ",
    description: "Tối đa 30 lần / giao dịch, quá thì RATE_LIMITED.",
    method: "GET",
    path: "/api/link-transactions/:txId/username-availability",
    pathParams: txParams,
    query: z.object({ username: z.string() }),
    responses: { 200: successResponseSchema(usernameAvailabilitySchema) },
    metadata: OpenAPIHelper.generateErrorCodes(...TX_ERRORS, ErrorCode.RateLimited),
  },
});
