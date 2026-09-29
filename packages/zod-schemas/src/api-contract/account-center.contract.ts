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
  pendingContactSchema,
  revokeAllResultSchema,
} from "../entity/account-center-schema";
import { otpChannelZod } from "../entity/link-transaction-schema";
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
      "Cần xác thực lại ≤ 5 phút (không hỏi mật khẩu cũ). Giữ phiên hiện tại, đăng xuất mọi phiên khác. Được miễn cổng đổi mật khẩu (TASK-006).",
    method: "PUT",
    path: "/api/me/password",
    body: z.object({ newPassword: z.string().min(1) }),
    responses: { 200: successResponseSchema(passwordUpdateResultSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(
      ErrorCode.ReauthRequired,
      ErrorCode.PasswordPolicyViolation,
    ),
  },
  addMyContact: {
    summary: "D24 — Gửi mã thêm / đổi kênh liên lạc",
    description:
      "Cần xác thực lại ≤ 5 phút. Gọi lại cùng channel = gửi lại mã (destination khác thì thay đích). Tài khoản chưa có email: chỉ channel=EMAIL.",
    method: "POST",
    path: "/api/me/contacts",
    body: z.object({ channel: otpChannelZod, destination: z.string().trim().min(1) }),
    responses: { 200: successResponseSchema(pendingContactSchema) },
    metadata: OpenAPIHelper.generateErrorCodes(
      ErrorCode.ReauthRequired,
      ErrorCode.ValidationError,
      ErrorCode.RateLimited,
      ErrorCode.OtpTooManyAttempts,
      ErrorCode.EmailSetupRequired,
    ),
  },
  verifyMyContact: {
    summary: "D24 — Xác minh kênh liên lạc",
    description:
      "Không cần fresh (mã gắn phiên đã gửi). Giá trị mới thêm vào hoặc thay giá trị cũ cùng loại; trả D20a.",
    method: "POST",
    path: "/api/me/contacts/verify",
    body: z.object({ channel: otpChannelZod, code: z.string().trim().min(1) }),
    responses: { 200: successResponseSchema(accountSecuritySchema) },
    metadata: OpenAPIHelper.generateErrorCodes(
      ErrorCode.OtpInvalid,
      ErrorCode.OtpExpired,
      ErrorCode.OtpTooManyAttempts,
      ErrorCode.ContactAlreadyUsed,
      ErrorCode.EmailSetupRequired,
    ),
  },
  removeMyContact: {
    summary: "D20c — Gỡ kênh liên lạc",
    description:
      "Cần xác thực lại ≤ 5 phút. Email là định danh chính — không gỡ được (LAST_AUTH_METHOD), chỉ đổi; SĐT gỡ được. Trả D20a.",
    method: "DELETE",
    path: "/api/me/contacts/:channel",
    pathParams: z.object({ channel: otpChannelZod }),
    body: c.noBody(),
    responses: { 200: successResponseSchema(accountSecuritySchema) },
    metadata: OpenAPIHelper.generateErrorCodes(
      ErrorCode.ReauthRequired,
      ErrorCode.LastAuthMethod,
      ErrorCode.ValidationError,
    ),
  },
});
