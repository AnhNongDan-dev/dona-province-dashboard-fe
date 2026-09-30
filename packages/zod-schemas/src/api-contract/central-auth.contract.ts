import { initContract } from "@ts-rest/core";
import z from "zod";
import { ErrorCode } from "../api/error.schema";
import { successResponseSchema } from "../api/response";
import {
  credentialPolicySchema,
  loginContextSchema,
  loginResultSchema,
  logoutModeZod,
  logoutResultSchema,
  sessionSchema,
} from "../entity/central-auth-schema";
import { OpenAPIHelper } from "../openapi/openAPI.helper";

const c = initContract();

// Central Auth dùng cookie phiên HttpOnly (cùng origin) — không có header JWT.
// Mọi request ghi gửi header X-CSRF-TOKEN; clientAPI tự gắn, nên contract không khai báo.
// Đường dẫn giữ đúng BE (`/api/...`, không có `/v1`).
export const centralAuthContract = c.router({
  getSession: {
    summary: "Trạng thái phiên",
    description: "Không kéo dài idle. Chưa có phiên thì BE cấp phiên ẩn danh kèm csrfToken.",
    method: "GET",
    path: "/api/session",
    responses: { 200: successResponseSchema(sessionSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(),
  },
  recordActivity: {
    summary: "Báo còn hoạt động",
    description: "Kéo dài idle khi user bấm [Tiếp tục làm việc].",
    method: "POST",
    path: "/api/session/activity",
    body: c.noBody(),
    responses: { 200: successResponseSchema(sessionSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(
      ErrorCode.Unauthenticated,
      ErrorCode.SessionExpired,
      ErrorCode.SessionChanged,
      ErrorCode.CsrfInvalid,
    ),
  },
  getCredentialPolicy: {
    summary: "Chính sách username / password",
    description: "Công khai; FE kiểm tra sớm khi user gõ, BE kiểm lại.",
    method: "GET",
    path: "/api/credential-policy",
    responses: { 200: successResponseSchema(credentialPolicySchema) },
    metadata: OpenAPIHelper.generateErrorCodes(),
  },
  getLoginContext: {
    summary: "Ngữ cảnh trang đăng nhập",
    description: "Tên hệ thống đang xin đăng nhập; continueUrl khi đã đăng nhập và không ép.",
    method: "GET",
    path: "/api/login/context",
    query: z.object({ req: z.string() }),
    responses: { 200: successResponseSchema(loginContextSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(ErrorCode.LoginRequestExpired),
  },
  login: {
    summary: "Đăng nhập",
    description: "loginId = username / email / SĐT đã xác minh.",
    method: "POST",
    path: "/api/login",
    body: z.object({
      req: z.string().nullable(),
      loginId: z.string().trim().min(1, "Vui lòng nhập tên đăng nhập, email hoặc số điện thoại"),
      password: z.string().min(1, "Vui lòng nhập mật khẩu"),
      personalDevice: z.boolean(),
    }),
    responses: { 200: successResponseSchema(loginResultSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(
      ErrorCode.InvalidLoginCredentials,
      ErrorCode.RateLimited,
      ErrorCode.AccountLocked,
      ErrorCode.TempPasswordExpired,
      ErrorCode.IdentityMerged,
      ErrorCode.CsrfInvalid,
      ErrorCode.SessionChanged,
      ErrorCode.SessionExpired,
      ErrorCode.ValidationError,
    ),
  },
  reauthenticate: {
    summary: "Xác thực lại (step-up)",
    description: "Không đổi csrfToken / sessionId.",
    method: "POST",
    path: "/api/session/reauthenticate",
    body: z.object({ password: z.string().min(1, "Vui lòng nhập mật khẩu") }),
    responses: { 200: successResponseSchema(z.object({ authTime: sessionSchema.shape.authTime })) },
    metadata: OpenAPIHelper.generateErrorCodes(
      ErrorCode.InvalidLoginCredentials,
      ErrorCode.RateLimited,
      ErrorCode.SessionExpired,
      ErrorCode.SessionChanged,
      ErrorCode.CsrfInvalid,
    ),
  },
  logout: {
    summary: "Đăng xuất / Đổi người dùng",
    description:
      "Trả token của phiên ẩn danh mới và danh sách hệ thống đã được gửi yêu cầu đăng xuất.",
    method: "POST",
    path: "/api/logout",
    body: z.object({ mode: logoutModeZod }),
    responses: { 200: successResponseSchema(logoutResultSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(
      ErrorCode.Unauthenticated,
      ErrorCode.SessionExpired,
      ErrorCode.SessionChanged,
      ErrorCode.CsrfInvalid,
    ),
  },
});
