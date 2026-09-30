import z from "zod";
import { commonZod } from "../common";

// Mirror `GET /api/me/connections`.

export const SsoStatus = {
  AVAILABLE: "AVAILABLE",
  MAINTENANCE: "MAINTENANCE",
  SSO_NOT_SUPPORTED: "SSO_NOT_SUPPORTED",
} as const;
export type SsoStatus = (typeof SsoStatus)[keyof typeof SsoStatus];
export const ssoStatusZod = z.enum([
  SsoStatus.AVAILABLE,
  SsoStatus.MAINTENANCE,
  SsoStatus.SSO_NOT_SUPPORTED,
]);
export const SSO_STATUS_LABEL: Record<SsoStatus, string> = {
  [SsoStatus.AVAILABLE]: "Hoạt động",
  [SsoStatus.MAINTENANCE]: "Đang bảo trì",
  [SsoStatus.SSO_NOT_SUPPORTED]: "Chưa hỗ trợ đăng nhập bằng Thành Đoàn Đồng Nai Central",
};

export const connectionAccountSchema = z.object({
  linkId: z.int(),
  username: z.string(),
  displayName: commonZod.fullNameResponse,
  tenantId: z.string().nullable(),
  tenantName: z.string().nullable(),
  linkedAt: commonZod.datetime,
  lastSsoLoginAt: commonZod.datetime.nullable(),
  canUnlink: z.boolean(),
  unlinkBlockedReason: z.string().nullable(),
});
export type ConnectionAccount = z.infer<typeof connectionAccountSchema>;

export const connectionSchema = z.object({
  providerCode: z.string(),
  providerName: z.string(),
  logoUrl: z.string().nullable(),
  homeUrl: z.string().nullable(),
  status: ssoStatusZod,
  linkEnabled: z.boolean(),
  // Chỉ có khi status=AVAILABLE và đã liên kết.
  launchUrl: z.string().nullable(),
  accounts: z.array(connectionAccountSchema),
});
export type Connection = z.infer<typeof connectionSchema>;
