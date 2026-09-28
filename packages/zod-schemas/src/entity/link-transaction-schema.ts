import z from "zod";
import { commonZod } from "../common";

// Mirror DTO giao dịch liên kết của BE (TASK-001 D8–D11; TASK-003/004). Nhánh tạo tài khoản trong
// giao dịch đã gỡ (TASK-007) — đăng ký là phiên đăng ký riêng (registration-schema).
// Enum ở đây chỉ dùng để rẽ nhánh wizard, không hiển thị ra UI → không có LABEL/OPTIONS.

export const LinkState = {
  AWAITING_LEGACY_VERIFICATION: "AWAITING_LEGACY_VERIFICATION",
  LEGACY_VERIFIED: "LEGACY_VERIFIED",
  CONTACT_VERIFIED: "CONTACT_VERIFIED",
  CENTRAL_VERIFIED: "CENTRAL_VERIFIED",
  COMPLETED: "COMPLETED",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
  FAILED: "FAILED",
} as const;
export type LinkState = (typeof LinkState)[keyof typeof LinkState];
export const linkStateZod = z.enum(Object.values(LinkState) as [LinkState, ...LinkState[]]);

/** Ý định lúc hệ thống cũ mở giao dịch: CREATE chỉ còn là gợi ý "mở thẳng trang đăng ký". */
export const LinkIntent = { LINK: "LINK", CREATE: "CREATE" } as const;
export type LinkIntent = (typeof LinkIntent)[keyof typeof LinkIntent];
export const linkIntentZod = z.enum([LinkIntent.LINK, LinkIntent.CREATE]);

export const LinkAction = {
  RETRY_LEGACY_VERIFICATION: "RETRY_LEGACY_VERIFICATION",
  CENTRAL_LOGIN: "CENTRAL_LOGIN",
  /** Mở trang đăng ký chung mang theo giao dịch (TASK-007). */
  REGISTER: "REGISTER",
  CONFIRM: "CONFIRM",
  CANCEL: "CANCEL",
} as const;
export type LinkAction = (typeof LinkAction)[keyof typeof LinkAction];
export const linkActionZod = z.enum(Object.values(LinkAction) as [LinkAction, ...LinkAction[]]);

/** LEGACY = F5 (từ hệ thống cũ); ACCOUNT_CENTER = F6 (từ Liên kết tài khoản, GĐ B). */
export const LinkOrigin = { LEGACY: "LEGACY", ACCOUNT_CENTER: "ACCOUNT_CENTER" } as const;
export type LinkOrigin = (typeof LinkOrigin)[keyof typeof LinkOrigin];
export const linkOriginZod = z.enum([LinkOrigin.LEGACY, LinkOrigin.ACCOUNT_CENTER]);

export const CentralStep = {
  FRESH_LOGIN: "FRESH_LOGIN",
  REAUTH_CURRENT: "REAUTH_CURRENT",
} as const;
export type CentralStep = (typeof CentralStep)[keyof typeof CentralStep];

export const OtpChannel = { SMS: "SMS", EMAIL: "EMAIL" } as const;
export type OtpChannel = (typeof OtpChannel)[keyof typeof OtpChannel];
export const otpChannelZod = z.enum([OtpChannel.SMS, OtpChannel.EMAIL]);

const legacyAccountSchema = z.object({
  username: z.string(),
  displayName: commonZod.fullNameResponse,
  // Mã đơn vị của hệ thống cũ (chuỗi), không phải id của Central.
  tenantId: z.string().nullable(),
  tenantName: z.string().nullable(),
});

const centralIdentitySchema = z.object({
  displayName: commonZod.fullNameResponse,
  maskedLoginId: z.string(),
  tenantId: z.string().nullable(),
  tenantName: z.string().nullable(),
});

/** D9 — wizard dựng hoàn toàn theo state / intent / allowedActions. */
export const linkTransactionSchema = z.object({
  txId: z.guid(),
  state: linkStateZod,
  intent: linkIntentZod,
  origin: linkOriginZod,
  centralStep: z.string().nullable(),
  expiresAt: commonZod.datetime,
  provider: z.object({ code: z.string(), name: z.string(), logoUrl: z.string().nullable() }),
  legacyAccount: legacyAccountSchema.nullable(),
  centralIdentity: centralIdentitySchema.nullable(),
  allowedActions: z.array(linkActionZod),
  legacyVerifyUrl: z.string().nullable(),
  returnUrl: z.string().nullable(),
  lastErrorCode: z.string().nullable(),
  failureCode: z.string().nullable(),
});
export type LinkTransaction = z.infer<typeof linkTransactionSchema>;

/** D8 (F6) — FE điều hướng top-level tới legacyVerifyUrl. */
export const linkTransactionCreateResultSchema = z.object({
  txId: z.guid(),
  legacyVerifyUrl: z.string(),
});
