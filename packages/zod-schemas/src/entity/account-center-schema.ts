import z from "zod";
import { commonZod } from "../common";
import { notifiedClientSchema } from "./central-auth-schema";
import { otpChannelZod } from "./link-transaction-schema";

// Mirror DTO Account Center GĐ B (TASK-004): D18 phiên, D19 lịch sử, D20a/b bảo mật, D25 quên mật khẩu.

/** D18 — một phiên còn sống của user. id = sessionId. Chuỗi thiết bị do BE tách sẵn. */
export const deviceSessionSchema = z.object({
  id: z.guid(),
  deviceLabel: z.string(),
  browser: z.string(),
  os: z.string(),
  ip: z.string(),
  createdAt: commonZod.datetime,
  lastActiveAt: commonZod.datetime,
  current: z.boolean(),
  personalDevice: z.boolean(),
});
export type DeviceSession = z.infer<typeof deviceSessionSchema>;

export const notifiedResultSchema = z.object({ notifiedClients: z.array(notifiedClientSchema) });

/** D18 revoke-all — csrfToken/sessionId chỉ có khi includeCurrent=true (phiên ẩn danh mới). */
export const revokeAllResultSchema = notifiedResultSchema.extend({
  revokedCount: z.int(),
  csrfToken: z.string().nullable(),
  sessionId: z.guid().nullable(),
});

// D19 — 15 mã sự kiện chốt cứng (TASK-004). Mã lạ → "Hoạt động khác".
export const ActivityType = {
  LOGIN: "LOGIN",
  REAUTHENTICATE: "REAUTHENTICATE",
  LOGOUT: "LOGOUT",
  SWITCH_USER: "SWITCH_USER",
  RP_LOGOUT: "RP_LOGOUT",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  SESSION_REVOKED: "SESSION_REVOKED",
  SSO_LOGIN: "SSO_LOGIN",
  LEGACY_VERIFIED: "LEGACY_VERIFIED",
  IDENTITY_CREATED: "IDENTITY_CREATED",
  IDENTITY_LINKED: "IDENTITY_LINKED",
  IDENTITY_UNLINKED: "IDENTITY_UNLINKED",
  PASSWORD_CHANGED: "PASSWORD_CHANGED",
  PASSWORD_RESET_REQUESTED: "PASSWORD_RESET_REQUESTED",
  PASSWORD_RESET: "PASSWORD_RESET",
  IDENTITY_MERGED: "IDENTITY_MERGED",
  CONTACT_ADDED: "CONTACT_ADDED",
  CONTACT_CHANGED: "CONTACT_CHANGED",
  CONTACT_REMOVED: "CONTACT_REMOVED",
  IDENTITY_REGISTERED: "IDENTITY_REGISTERED",
} as const;
export type ActivityType = (typeof ActivityType)[keyof typeof ActivityType];
export const activityTypeZod = z.enum(
  Object.values(ActivityType) as [ActivityType, ...ActivityType[]],
);
export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  [ActivityType.LOGIN]: "Đăng nhập",
  [ActivityType.REAUTHENTICATE]: "Xác thực lại",
  [ActivityType.LOGOUT]: "Đăng xuất",
  [ActivityType.SWITCH_USER]: "Đổi người dùng",
  [ActivityType.RP_LOGOUT]: "Đăng xuất từ hệ thống",
  [ActivityType.SESSION_EXPIRED]: "Phiên hết hạn",
  [ActivityType.SESSION_REVOKED]: "Thu hồi phiên",
  [ActivityType.SSO_LOGIN]: "Vào hệ thống bằng Central",
  [ActivityType.LEGACY_VERIFIED]: "Xác minh tài khoản hệ thống",
  [ActivityType.IDENTITY_CREATED]: "Tạo tài khoản (qua liên kết)",
  [ActivityType.IDENTITY_LINKED]: "Liên kết tài khoản",
  [ActivityType.IDENTITY_UNLINKED]: "Hủy liên kết tài khoản",
  [ActivityType.PASSWORD_CHANGED]: "Đổi mật khẩu",
  [ActivityType.PASSWORD_RESET_REQUESTED]: "Yêu cầu lấy lại mật khẩu",
  [ActivityType.PASSWORD_RESET]: "Đặt lại mật khẩu",
  [ActivityType.IDENTITY_MERGED]: "Gộp tài khoản",
  [ActivityType.CONTACT_ADDED]: "Thêm kênh liên lạc",
  [ActivityType.CONTACT_CHANGED]: "Đổi kênh liên lạc",
  [ActivityType.CONTACT_REMOVED]: "Gỡ kênh liên lạc",
  [ActivityType.IDENTITY_REGISTERED]: "Đăng ký tài khoản",
};
export const ACTIVITY_TYPE_OPTIONS = Object.values(ActivityType).map((value) => ({
  value,
  label: ACTIVITY_TYPE_LABEL[value],
}));

export const ActivityResult = { SUCCESS: "SUCCESS", FAILURE: "FAILURE" } as const;
export type ActivityResult = (typeof ActivityResult)[keyof typeof ActivityResult];

export const activitySchema = z.object({
  id: z.int(),
  occurredAt: commonZod.datetime,
  // Chuỗi, không enum: mã lạ (BE thêm sau) không được làm vỡ cả trang.
  type: z.string(),
  result: z.string(),
  providerCode: z.string().nullable(),
  providerName: z.string().nullable(),
  // null khi sự kiện không đến từ trình duyệt nào (vd. phiên tự hết hạn).
  ip: z.string().nullable(),
  deviceLabel: z.string().nullable(),
  // Chuỗi hiển thị, đã che (GĐ C): IDENTITY_MERGED → định danh tài khoản bị gộp; CONTACT_* → kênh.
  detail: z.string().nullable(),
});
export type Activity = z.infer<typeof activitySchema>;

/** Envelope phân trang của BE — nằm trong `data` của ResponseObject; page tính từ 0. */
export const pagedSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    data: z.array(item),
    paging: z.object({
      page: z.int(),
      size: z.int(),
      totalElements: z.int(),
      totalPages: z.int(),
      hasNext: z.boolean(),
    }),
  });

/** D24 gửi mã / pendingContacts của D20a — mã đang chờ xác minh của một kênh. */
export const pendingContactSchema = z.object({
  channel: otpChannelZod,
  maskedDestination: z.string(),
  expiresAt: commonZod.datetime,
  resendAvailableAt: commonZod.datetime,
  sendsRemaining: z.int(),
});
export type PendingContact = z.infer<typeof pendingContactSchema>;

/** D20a — contacts chỉ gồm kênh đã xác minh, đã che; tối đa 1 SĐT + 1 email (TASK-005 Q4). */
export const accountSecuritySchema = z.object({
  username: z.string(),
  contacts: z.array(
    z.object({
      channel: otpChannelZod,
      maskedDestination: z.string(),
      verifiedAt: commonZod.datetime,
    }),
  ),
  passwordChangedAt: commonZod.datetime,
  pendingContacts: z.array(pendingContactSchema),
});
export type AccountSecurity = z.infer<typeof accountSecuritySchema>;

/** D20b */
export const passwordUpdateResultSchema = notifiedResultSchema.extend({
  passwordChangedAt: commonZod.datetime,
  revokedCount: z.int(),
});

/** D25 bước 1 — luôn cùng hình dạng dù định danh có tồn tại hay không. */
export const passwordResetSchema = z.object({
  resetId: z.guid(),
  resendAvailableAt: commonZod.datetime,
  expiresAt: commonZod.datetime,
});
export type PasswordReset = z.infer<typeof passwordResetSchema>;
