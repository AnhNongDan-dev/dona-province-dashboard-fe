import { initContract } from "@ts-rest/core";
import z from "zod";
import { ErrorCode } from "../api/error.schema";
import { successResponseSchema } from "../api/response";
import {
  registrationSchema,
  registrationSubmitResultSchema,
  registrationVerifyResultSchema,
  usernameAvailabilitySchema,
} from "../entity/registration-schema";
import { OpenAPIHelper } from "../openapi/openAPI.helper";

const c = initContract();

// Tự đăng ký tài khoản Thành Đoàn Đồng Nai Central (mã gửi ngầm qua email). Công khai + CSRF của
// phiên ẩn danh; gắn trình duyệt bằng cookie — trình duyệt khác → REGISTRATION_NOT_FOUND.
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
    description:
      "Tải lại trang: draft != null → màn nhập mã. COMPLETED vẫn đọc được (allowedActions rỗng).",
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
  submitRegistration: {
    summary: "Gửi thông tin đăng ký",
    description:
      "BE kiểm hợp lệ, lưu nháp (mật khẩu chỉ dạng băm) và gửi mã 6 số tới email ngầm. Gửi lại = thay nháp + mã mới " +
      "(tính vào lượt gửi). Email đã có tài khoản → CONTACT_ALREADY_USED (fieldName email), không gửi mã.",
    method: "POST",
    path: "/api/registrations/:regId/submit",
    pathParams: regParams,
    body: z.object({
      displayName: z.string().trim().min(1).max(100),
      username: z.string().trim().min(1),
      email: z.string().trim().min(1),
      // SĐT tự khai, không xác minh; null = không khai.
      phone: z.string().trim().nullable(),
      password: z.string().min(1),
    }),
    responses: { 200: successResponseSchema(registrationSubmitResultSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(
      ...REG_ERRORS,
      ErrorCode.ValidationError,
      ErrorCode.UsernamePolicyViolation,
      ErrorCode.UsernameTaken,
      ErrorCode.PasswordPolicyViolation,
      ErrorCode.ContactAlreadyUsed,
      ErrorCode.RateLimited,
      ErrorCode.OtpTooManyAttempts,
    ),
  },
  resendRegistrationCode: {
    summary: "Gửi lại mã",
    description:
      "Mã mới tới email trong nháp, mã cũ vô hiệu. 3 lần gửi / phiên (tính cả lần đầu), cách 60 giây.",
    method: "POST",
    path: "/api/registrations/:regId/resend",
    pathParams: regParams,
    body: c.noBody(),
    responses: { 200: successResponseSchema(registrationSubmitResultSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(
      ...REG_ERRORS,
      ErrorCode.RateLimited,
      ErrorCode.OtpTooManyAttempts,
    ),
  },
  verifyRegistration: {
    summary: "Nhập mã, tạo tài khoản",
    description:
      "Đúng mã → tạo tài khoản (email đã xác minh) + đăng nhập luôn. Idempotent. redirectUrl: /link/{txId} | tiếp tục OIDC | /.",
    method: "POST",
    path: "/api/registrations/:regId/verify",
    pathParams: regParams,
    body: z.object({ code: z.string().trim().min(1) }),
    responses: { 200: successResponseSchema(registrationVerifyResultSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(
      ...REG_ERRORS,
      ErrorCode.OtpInvalid,
      ErrorCode.OtpExpired,
      ErrorCode.OtpTooManyAttempts,
      ErrorCode.UsernameTaken,
      ErrorCode.ContactAlreadyUsed,
      ErrorCode.RateLimited,
    ),
  },
});
