import { initContract } from "@ts-rest/core";
import z from "zod";
import { ErrorCode } from "../api/error.schema";
import { successResponseSchema } from "../api/response";
import { commonZod } from "../common";
import { activitySchema, pagedSchema } from "../entity/account-center-schema";
import {
  adminAuditRowSchema,
  adminLockResultSchema,
  adminPasswordResetResultSchema,
  adminReasonBodySchema,
  adminSessionsRevokeResultSchema,
  adminUnlinkResultSchema,
  adminUnlockResultSchema,
  adminUserDetailSchema,
  adminUserRowSchema,
} from "../entity/admin-schema";
import { OpenAPIHelper } from "../openapi/openAPI.helper";

const c = initContract();

const userParams = z.object({ id: z.guid() });
// Mọi API ghi: CSRF + đã xác thực ≤ 5 phút + lý do; tài khoản đích không hợp lệ → 404 / 403 / 409.
const writeErrors = [
  ErrorCode.AdminForbidden,
  ErrorCode.ReauthRequired,
  ErrorCode.ValidationError,
  ErrorCode.UserNotFound,
  ErrorCode.AdminTargetForbidden,
  ErrorCode.IdentityMerged,
] as const;

// Màn quản trị. Cần phiên admin — không phải admin → ADMIN_FORBIDDEN.
export const adminContract = c.router({
  searchUsers: {
    summary: "Tìm tài khoản",
    description:
      "q 2–100 ký tự: họ tên / username bỏ dấu, chứa chuỗi; email / SĐT / username hệ thống cũ khớp đúng. Sắp theo createdAt giảm dần.",
    method: "GET",
    path: "/api/admin/users",
    query: z.object({
      q: z.string().optional(),
      status: z.string().optional(),
      providerCode: z.string().optional(),
      page: z.int().min(0),
      size: z.int().min(1).max(100),
    }),
    responses: { 200: successResponseSchema(pagedSchema(adminUserRowSchema)) },
    metadata: OpenAPIHelper.generateErrorCodes(ErrorCode.AdminForbidden, ErrorCode.ValidationError),
  },
  getUser: {
    summary: "Chi tiết tài khoản",
    method: "GET",
    path: "/api/admin/users/:id",
    pathParams: userParams,
    responses: { 200: successResponseSchema(adminUserDetailSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(ErrorCode.AdminForbidden, ErrorCode.UserNotFound),
  },
  searchUserActivities: {
    summary: "Lịch sử hoạt động của tài khoản",
    description: "Cùng hình dạng lịch sử hoạt động của chính user.",
    method: "GET",
    path: "/api/admin/users/:id/activities",
    pathParams: userParams,
    query: z.object({
      page: z.int().min(0),
      size: z.int().min(1).max(100),
      types: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }),
    responses: { 200: successResponseSchema(pagedSchema(activitySchema)) },
    metadata: OpenAPIHelper.generateErrorCodes(
      ErrorCode.AdminForbidden,
      ErrorCode.UserNotFound,
      ErrorCode.ValidationError,
    ),
  },
  lockUser: {
    summary: "Khóa tài khoản",
    description: "Thu hồi mọi phiên + back-channel logout. Đã khóa → 200 trạng thái hiện tại.",
    method: "POST",
    path: "/api/admin/users/:id/lock",
    pathParams: userParams,
    body: adminReasonBodySchema,
    responses: { 200: successResponseSchema(adminLockResultSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(...writeErrors),
  },
  unlockUser: {
    summary: "Mở khóa tài khoản",
    method: "POST",
    path: "/api/admin/users/:id/unlock",
    pathParams: userParams,
    body: adminReasonBodySchema,
    responses: { 200: successResponseSchema(adminUnlockResultSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(...writeErrors),
  },
  resetUserPassword: {
    summary: "Cấp lại mật khẩu",
    description: "Không idempotent: gọi lại = mật khẩu tạm mới. FE không tự gửi lại.",
    method: "POST",
    path: "/api/admin/users/:id/password-reset",
    pathParams: userParams,
    body: adminReasonBodySchema,
    responses: { 200: successResponseSchema(adminPasswordResetResultSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(...writeErrors),
  },
  revokeUserSessions: {
    summary: "Đăng xuất mọi phiên",
    method: "POST",
    path: "/api/admin/users/:id/sessions/revoke-all",
    pathParams: userParams,
    body: adminReasonBodySchema,
    responses: { 200: successResponseSchema(adminSessionsRevokeResultSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(...writeErrors),
  },
  unlinkUserConnection: {
    summary: "Hủy liên kết (kể cả hệ thống SSO-only)",
    method: "POST",
    path: "/api/admin/users/:id/connections/:linkId/unlink",
    pathParams: z.object({ id: z.guid(), linkId: commonZod.pathId }),
    body: adminReasonBodySchema,
    responses: { 200: successResponseSchema(adminUnlinkResultSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(...writeErrors, ErrorCode.ConnectionNotFound),
  },
  searchAudit: {
    summary: "Nhật ký quản trị",
    description: "from/to là ngày (YYYY-MM-DD) giờ VN, tính cả hai đầu.",
    method: "GET",
    path: "/api/admin/audit",
    query: z.object({
      actorId: z.guid().optional(),
      targetId: z.guid().optional(),
      action: z.string().optional(),
      result: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      page: z.int().min(0),
      size: z.int().min(1).max(100),
    }),
    responses: { 200: successResponseSchema(pagedSchema(adminAuditRowSchema)) },
    metadata: OpenAPIHelper.generateErrorCodes(ErrorCode.AdminForbidden, ErrorCode.ValidationError),
  },
});
