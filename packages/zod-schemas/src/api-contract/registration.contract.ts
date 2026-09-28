import { initContract } from "@ts-rest/core";
import z from "zod";
import { ErrorCode } from "../api/error.schema";
import { successResponseSchema } from "../api/response";
import { otpChannelZod } from "../entity/link-transaction-schema";
import {
  otpSendResultSchema,
  otpVerifyResultSchema,
  registrationCompleteResultSchema,
  registrationSchema,
  usernameAvailabilitySchema,
} from "../entity/registration-schema";
import { OpenAPIHelper } from "../openapi/openAPI.helper";

const c = initContract();

// Tự đăng ký tài khoản Thành Đoàn Đồng Nai Central (TASK-007). Công khai + CSRF của phiên ẩn danh;
// gắn trình duyệt bằng cookie — trình duyệt khác → REGISTRATION_NOT_FOUND.
const regParams = z.object({ regId: z.guid() });
const REG_ERRORS = [
  ErrorCode.RegistrationNotFound,
  ErrorCode.RegistrationExpired,
  ErrorCode.RegistrationInvalidState,
] as const;

export const registrationContract = c.router({
  createRegistration: {
    summary: "Mở phiên đăng ký",
    description:
      "linkTxId: giao dịch liên kết từ hệ thống cũ (đang LEGACY_VERIFIED); req: yêu cầu đăng nhập OIDC đang chờ.",
    method: "POST",
    path: "/api/registrations",
    body: z.object({ req: z.string().nullable(), linkTxId: z.guid().nullable() }),
    responses: { 200: successResponseSchema(registrationSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(
      ErrorCode.RateLimited,
      ErrorCode.LinkTxNotFound,
      ErrorCode.LinkTxExpired,
      ErrorCode.LinkTxInvalidState,
      ErrorCode.LegacyAuthTooOld,
    ),
  },
  getRegistration: {
    summary: "Trạng thái phiên đăng ký",
    description: "COMPLETED vẫn đọc được (allowedActions rỗng).",
    method: "GET",
    path: "/api/registrations/:regId",
    pathParams: regParams,
    responses: { 200: successResponseSchema(registrationSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(
      ErrorCode.RegistrationNotFound,
      ErrorCode.RegistrationExpired,
    ),
  },
  checkRegistrationUsername: {
    summary: "Kiểm tên đăng nhập khi gõ",
    description: "Tối đa 30 lần / phiên, quá thì RATE_LIMITED.",
    method: "GET",
    path: "/api/registrations/:regId/username-availability",
    pathParams: regParams,
    query: z.object({ username: z.string() }),
    responses: { 200: successResponseSchema(usernameAvailabilitySchema) },
    metadata: OpenAPIHelper.generateErrorCodes(...REG_ERRORS, ErrorCode.RateLimited),
  },
  sendRegistrationOtp: {
    summary: "Gửi mã OTP",
    description:
      "Theo kênh: 3 lần gửi / phiên, cách 60 giây; SĐT/email đã bị chặn trong phiên → CONTACT_ALREADY_USED.",
    method: "POST",
    path: "/api/registrations/:regId/otp",
    pathParams: regParams,
    body: z.object({ channel: otpChannelZod, destination: z.string().trim().min(1) }),
    responses: { 200: successResponseSchema(otpSendResultSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(
      ...REG_ERRORS,
      ErrorCode.RateLimited,
      ErrorCode.OtpTooManyAttempts,
      ErrorCode.ContactAlreadyUsed,
      ErrorCode.ValidationError,
    ),
  },
  verifyRegistrationOtp: {
    summary: "Xác minh mã OTP",
    description:
      "Kênh đã thuộc tài khoản khác → contactBelongsToExistingIdentity=true, không nhận kênh.",
    method: "POST",
    path: "/api/registrations/:regId/otp/verify",
    pathParams: regParams,
    body: z.object({ channel: otpChannelZod, code: z.string().trim().min(1) }),
    responses: { 200: successResponseSchema(otpVerifyResultSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(
      ...REG_ERRORS,
      ErrorCode.OtpInvalid,
      ErrorCode.OtpExpired,
      ErrorCode.OtpTooManyAttempts,
    ),
  },
  completeRegistration: {
    summary: "Hoàn tất đăng ký",
    description:
      "Tạo tài khoản + đăng nhập luôn (thay phiên cũ). Idempotent. redirectUrl: /link/{txId} | tiếp tục OIDC | /.",
    method: "POST",
    path: "/api/registrations/:regId/complete",
    pathParams: regParams,
    body: z.object({
      displayName: z.string().trim().min(1).max(100),
      username: z.string().trim().min(1),
      password: z.string().min(1),
    }),
    responses: { 200: successResponseSchema(registrationCompleteResultSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(
      ...REG_ERRORS,
      ErrorCode.EmailVerificationRequired,
      ErrorCode.RateLimited,
      ErrorCode.UsernameTaken,
      ErrorCode.UsernamePolicyViolation,
      ErrorCode.PasswordPolicyViolation,
      ErrorCode.ContactAlreadyUsed,
    ),
  },
});
