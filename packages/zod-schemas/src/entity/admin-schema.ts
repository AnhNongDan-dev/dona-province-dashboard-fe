import z from "zod";
import { commonZod } from "../common";
import { notifiedClientSchema } from "./central-auth-schema";
import { otpChannelZod } from "./link-transaction-schema";

// Mirror DTO màn quản trị (TASK-006 AD1–AD8, AD10). id tài khoản = id công khai (UUID) như D1.

export const UserStatus = {
  ACTIVE: "ACTIVE",
  LOCKED: "LOCKED",
  DISABLED: "DISABLED",
  MERGED: "MERGED",
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];
export const USER_STATUS_LABEL: Record<UserStatus, string> = {
  [UserStatus.ACTIVE]: "Hoạt động",
  [UserStatus.LOCKED]: "Bị khóa",
  [UserStatus.DISABLED]: "Vô hiệu",
  [UserStatus.MERGED]: "Đã gộp",
};
/** Giá trị lọc `status` của AD1 (BE không nhận DISABLED). */
export const USER_STATUS_FILTER = [UserStatus.ACTIVE, UserStatus.LOCKED, UserStatus.MERGED];
export const userStatusFilterZod = z.enum(USER_STATUS_FILTER);

/** AD2 allowedActions — FE chỉ dựa mảng này để hiện nút. */
export const AdminUserAction = {
  LOCK: "LOCK",
  UNLOCK: "UNLOCK",
  RESET_PASSWORD: "RESET_PASSWORD",
  REVOKE_SESSIONS: "REVOKE_SESSIONS",
  UNLINK: "UNLINK",
} as const;
export type AdminUserAction = (typeof AdminUserAction)[keyof typeof AdminUserAction];

/** AD10 action. */
export const AdminAction = {
  LOCK: "LOCK",
  UNLOCK: "UNLOCK",
  PASSWORD_RESET: "PASSWORD_RESET",
  SESSIONS_REVOKE: "SESSIONS_REVOKE",
  UNLINK: "UNLINK",
  ACCESS_DENIED: "ACCESS_DENIED",
} as const;
export type AdminAction = (typeof AdminAction)[keyof typeof AdminAction];
export const adminActionZod = z.enum(Object.values(AdminAction) as [AdminAction, ...AdminAction[]]);
export const ADMIN_ACTION_LABEL: Record<AdminAction, string> = {
  [AdminAction.LOCK]: "Khóa tài khoản",
  [AdminAction.UNLOCK]: "Mở khóa tài khoản",
  [AdminAction.PASSWORD_RESET]: "Cấp lại mật khẩu",
  [AdminAction.SESSIONS_REVOKE]: "Đăng xuất mọi phiên",
  [AdminAction.UNLINK]: "Hủy liên kết",
  [AdminAction.ACCESS_DENIED]: "Truy cập quản trị bị từ chối",
};

// Chuỗi, không enum: giá trị lạ (BE thêm sau) không được làm vỡ cả trang.
const statusString = z.string();

/** AD1 — một hàng danh sách. Kênh liên lạc đã che, chỉ có khi đã xác minh. */
export const adminUserRowSchema = z.object({
  id: z.guid(),
  username: z.string(),
  displayName: z.string(),
  status: statusString,
  admin: z.boolean(),
  maskedEmail: z.string().nullable(),
  maskedPhone: z.string().nullable(),
  linkedProviderCodes: z.array(z.string()),
  linkedProviderNames: z.array(z.string()),
  mergedIntoId: z.guid().nullable(),
  mergedIntoUsername: z.string().nullable(),
  createdAt: commonZod.datetime,
  lastLoginAt: commonZod.datetime.nullable(),
});
export type AdminUserRow = z.infer<typeof adminUserRowSchema>;

/** AD2 — chi tiết; kênh liên lạc đầy đủ (Q5 = A), verifiedAt null = chưa xác minh. */
export const adminUserDetailSchema = z.object({
  id: z.guid(),
  username: z.string(),
  displayName: z.string(),
  status: statusString,
  admin: z.boolean(),
  createdAt: commonZod.datetime,
  lastLoginAt: commonZod.datetime.nullable(),
  passwordChangedAt: commonZod.datetime.nullable(),
  passwordChangeRequired: z.boolean(),
  temporaryPasswordExpiresAt: commonZod.datetime.nullable(),
  lockedAt: commonZod.datetime.nullable(),
  lockedById: z.guid().nullable(),
  lockedByUsername: z.string().nullable(),
  contacts: z.array(
    z.object({
      channel: otpChannelZod,
      destination: z.string(),
      verifiedAt: commonZod.datetime.nullable(),
    }),
  ),
  mergedIntoId: z.guid().nullable(),
  mergedIntoUsername: z.string().nullable(),
  mergedIntoDisplayName: z.string().nullable(),
  mergedFrom: z.array(
    z.object({
      id: z.guid(),
      username: z.string(),
      displayName: z.string(),
      mergedAt: commonZod.datetime.nullable(),
    }),
  ),
  connections: z.array(
    z.object({
      linkId: z.int(),
      providerCode: z.string(),
      providerName: z.string(),
      externalUsername: z.string(),
      externalDisplayName: z.string().nullable(),
      tenantId: z.string().nullable(),
      tenantName: z.string().nullable(),
      linkedAt: commonZod.datetime,
      lastSsoLoginAt: commonZod.datetime.nullable(),
      ssoOnly: z.boolean(),
    }),
  ),
  sessions: z.array(
    z.object({
      id: z.guid(),
      deviceLabel: z.string(),
      browser: z.string().nullable(),
      os: z.string().nullable(),
      ip: z.string().nullable(),
      createdAt: commonZod.datetime,
      lastActiveAt: commonZod.datetime,
      personalDevice: z.boolean(),
      clientIds: z.array(z.string()),
      clientNames: z.array(z.string()),
    }),
  ),
  allowedActions: z.array(z.string()),
});
export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;

const notifiedClients = z.array(notifiedClientSchema);

/** AD4 — gọi lặp (đã khóa): status hiện tại, revokedCount 0, notifiedClients rỗng. */
export const adminLockResultSchema = z.object({
  status: statusString,
  revokedCount: z.int(),
  notifiedClients,
});
/** AD5 */
export const adminUnlockResultSchema = z.object({ status: statusString });
/** AD6 — mật khẩu tạm chỉ có ở response này; FE không lưu ở bất kỳ đâu. */
export const adminPasswordResetResultSchema = z.object({
  temporaryPassword: z.string(),
  expiresAt: commonZod.datetime,
  revokedCount: z.int(),
  notifiedClients,
});
/** AD7 */
export const adminSessionsRevokeResultSchema = z.object({
  revokedCount: z.int(),
  notifiedClients,
});
/** AD8 */
export const adminUnlinkResultSchema = z.object({ notifiedClients });

/** AD10 — tên hai bên là bản chụp lúc thao tác; targetId null với ACCESS_DENIED không nhắm ai. */
export const adminAuditRowSchema = z.object({
  id: z.int(),
  occurredAt: commonZod.datetime,
  action: z.string(),
  result: z.string(),
  errorCode: z.string().nullable(),
  actorId: z.guid().nullable(),
  actorUsername: z.string().nullable(),
  actorDisplayName: z.string().nullable(),
  targetId: z.guid().nullable(),
  targetUsername: z.string().nullable(),
  targetDisplayName: z.string().nullable(),
  providerCode: z.string().nullable(),
  providerName: z.string().nullable(),
  reason: z.string().nullable(),
  ip: z.string().nullable(),
  deviceLabel: z.string().nullable(),
});
export type AdminAuditRow = z.infer<typeof adminAuditRowSchema>;

/** Lý do bắt buộc cho mọi thao tác ghi của admin (R5). */
export const ADMIN_REASON_MAX_LENGTH = 500;
export const adminReasonBodySchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập lý do")
    .max(ADMIN_REASON_MAX_LENGTH, `Tối đa ${ADMIN_REASON_MAX_LENGTH} ký tự`),
});
