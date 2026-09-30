import { initContract } from "@ts-rest/core";
import z from "zod";
import { ErrorCode } from "../api/error.schema";
import { successResponseSchema } from "../api/response";
import { passwordResetSchema } from "../entity/account-center-schema";
import { OpenAPIHelper } from "../openapi/openAPI.helper";

const c = initContract();

// Quên mật khẩu. Công khai + CSRF (phiên ẩn danh). resetId gắn với phiên của
// trình duyệt đã yêu cầu — resend / complete phải dùng cùng phiên, khác phiên → OTP_EXPIRED.
const resetParams = z.object({ resetId: z.guid() });

export const passwordResetContract = c.router({
  requestPasswordReset: {
    summary: "Yêu cầu lấy lại mật khẩu",
    description: "Luôn trả cùng hình dạng dù định danh có tồn tại hay không. BE tự chọn kênh gửi.",
    method: "POST",
    path: "/api/password-reset",
    body: z.object({ loginId: z.string().trim().min(1) }),
    responses: { 200: successResponseSchema(passwordResetSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(ErrorCode.RateLimited, ErrorCode.ValidationError),
  },
  resendPasswordReset: {
    summary: "Gửi lại mã",
    description: "Mã cũ mất hiệu lực. Tối đa 3 lần / resetId, cách nhau ≥ 60 giây.",
    method: "POST",
    path: "/api/password-reset/:resetId/resend",
    pathParams: resetParams,
    body: c.noBody(),
    responses: {
      200: successResponseSchema(passwordResetSchema.pick({ resendAvailableAt: true })),
    },
    metadata: OpenAPIHelper.generateErrorCodes(
      ErrorCode.OtpTooManyAttempts,
      ErrorCode.OtpExpired,
      ErrorCode.RateLimited,
    ),
  },
  completePasswordReset: {
    summary: "Đặt mật khẩu mới",
    description:
      "Kiểm mã trước, password sau: mã đúng mà password không đạt thì mã vẫn giữ trạng thái đã xác minh.",
    method: "POST",
    path: "/api/password-reset/:resetId/complete",
    pathParams: resetParams,
    body: z.object({ code: z.string().trim().min(1), newPassword: z.string().min(1) }),
    responses: { 200: successResponseSchema() },
    metadata: OpenAPIHelper.generateErrorCodes(
      ErrorCode.OtpInvalid,
      ErrorCode.OtpExpired,
      ErrorCode.OtpTooManyAttempts,
      ErrorCode.PasswordPolicyViolation,
    ),
  },
});
