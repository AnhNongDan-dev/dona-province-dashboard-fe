import { initContract } from "@ts-rest/core";
import z from "zod";
import { ErrorCode } from "../api/error.schema";
import { successResponseSchema } from "../api/response";
import {
  accountSecuritySchema,
  activitySchema,
  deviceSessionSchema,
  notifiedResultSchema,
  pagedSchema,
  passwordUpdateResultSchema,
  revokeAllResultSchema,
} from "../entity/account-center-schema";
import { OpenAPIHelper } from "../openapi/openAPI.helper";

const c = initContract();

// Account Center GĐ B (TASK-004): D18 phiên & thiết bị, D19 lịch sử, D20a/b bảo mật. Cần phiên.
export const accountCenterContract = c.router({
  listMySessions: {
    summary: "D18 — Phiên đăng nhập còn sống",
    description: "Phiên hiện tại đứng đầu, sau đó theo lastActiveAt giảm dần. Không phân trang.",
    method: "GET",
    path: "/api/me/sessions",
    responses: { 200: successResponseSchema(z.array(deviceSessionSchema)) },
    metadata: OpenAPIHelper.generateErrorCodes(),
  },
  revokeMySession: {
    summary: "D18 — Đăng xuất một phiên khác",
    description: "Không nhận phiên hiện tại (VALIDATION_ERROR / CURRENT_SESSION) — dùng D6.",
    method: "DELETE",
    path: "/api/me/sessions/:id",
    pathParams: z.object({ id: z.guid() }),
    body: c.noBody(),
    responses: { 200: successResponseSchema(notifiedResultSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(
      ErrorCode.SessionNotFound,
      ErrorCode.ValidationError,
    ),
  },
  revokeAllMySessions: {
    summary: "D18 — Đăng xuất tất cả phiên",
    description:
      "Cần xác thực lại ≤ 5 phút. includeCurrent=true trả token phiên ẩn danh mới như D6.",
    method: "POST",
    path: "/api/me/sessions/revoke-all",
    body: z.object({ includeCurrent: z.boolean() }),
    responses: { 200: successResponseSchema(revokeAllResultSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(ErrorCode.ReauthRequired),
  },
  searchMyActivities: {
    summary: "D19 — Lịch sử hoạt động",
    description:
      "page từ 0, size 1..100; types phân cách dấu phẩy; from/to là ngày giờ VN, tính cả hai đầu.",
    method: "GET",
    path: "/api/me/activities",
    query: z.object({
      page: z.int().min(0),
      size: z.int().min(1).max(100),
      types: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }),
    responses: { 200: successResponseSchema(pagedSchema(activitySchema)) },
    metadata: OpenAPIHelper.generateErrorCodes(ErrorCode.ValidationError),
  },
  getMySecurity: {
    summary: "D20a — Thông tin bảo mật",
    description: "Username, kênh liên lạc đã xác minh (đã che), lần đổi mật khẩu gần nhất.",
    method: "GET",
    path: "/api/me/security",
    responses: { 200: successResponseSchema(accountSecuritySchema) },
    metadata: OpenAPIHelper.generateErrorCodes(),
  },
  changeMyPassword: {
    summary: "D20b — Đổi mật khẩu",
    description:
      "Cần xác thực lại ≤ 5 phút (không hỏi mật khẩu cũ). Giữ phiên hiện tại, đăng xuất mọi phiên khác.",
    method: "PUT",
    path: "/api/me/password",
    body: z.object({ newPassword: z.string().min(1) }),
    responses: { 200: successResponseSchema(passwordUpdateResultSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(
      ErrorCode.ReauthRequired,
      ErrorCode.PasswordPolicyViolation,
    ),
  },
});
