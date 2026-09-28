import z from "zod";
import { commonZod } from "../common";

// Mirror DTO của BE Central Auth giai đoạn 0 (TASK-001 API Summary D1–D7, TASK-002).

export const LogoutMode = {
  LOGOUT: "LOGOUT",
  SWITCH_USER: "SWITCH_USER",
} as const;
export type LogoutMode = (typeof LogoutMode)[keyof typeof LogoutMode];
export const logoutModeZod = z.enum([LogoutMode.LOGOUT, LogoutMode.SWITCH_USER]);

export const LoginNext = {
  REDIRECT: "REDIRECT",
  PASSWORD_CHANGE_REQUIRED: "PASSWORD_CHANGE_REQUIRED",
  MFA_REQUIRED: "MFA_REQUIRED",
  /** Tài khoản chưa có email đã xác minh (TASK-008): phiên đã cấp, phải thêm email trước. */
  EMAIL_SETUP_REQUIRED: "EMAIL_SETUP_REQUIRED",
} as const;
export type LoginNext = (typeof LoginNext)[keyof typeof LoginNext];
export const loginNextZod = z.enum([
  LoginNext.REDIRECT,
  LoginNext.PASSWORD_CHANGE_REQUIRED,
  LoginNext.MFA_REQUIRED,
  LoginNext.EMAIL_SETUP_REQUIRED,
]);

export const sessionIdentitySchema = z.object({
  // guid (không kiểm version RFC): id seed dev dạng 00000000-…-00000000000a vẫn hợp lệ.
  id: z.guid(),
  username: z.string(),
  displayName: commonZod.fullNameResponse,
  maskedLoginId: z.string(),
  hasVerifiedContact: z.boolean(),
  /** Chưa có email đã xác minh → mọi API cần đăng nhập (trừ vài API) trả EMAIL_SETUP_REQUIRED. */
  emailSetupRequired: z.boolean(),
  tenantId: z.int().nullable(),
  tenantName: z.string().nullable(),
});
export type SessionIdentity = z.infer<typeof sessionIdentitySchema>;

/** D1 / D2. Phiên ẩn danh: authenticated=false, identity + các mốc thời gian là null. */
export const sessionSchema = z.object({
  authenticated: z.boolean(),
  sessionId: z.guid(),
  csrfToken: z.string(),
  identity: sessionIdentitySchema.nullable(),
  authTime: commonZod.datetime.nullable(),
  idleExpiresAt: commonZod.datetime.nullable(),
  absoluteExpiresAt: commonZod.datetime.nullable(),
  personalDevice: z.boolean(),
});
export type Session = z.infer<typeof sessionSchema>;

/** Token mới trả kèm D4 / D6 khi phiên đổi. */
export const sessionTokensSchema = z.object({
  csrfToken: z.string(),
  sessionId: z.guid(),
});
export type SessionTokens = z.infer<typeof sessionTokensSchema>;

/** D3 */
export const loginContextSchema = z.object({
  clientId: z.string(),
  clientName: z.string(),
  clientLogoUrl: z.string().nullable(),
  forceLogin: z.boolean(),
  continueUrl: z.string().nullable(),
});
export type LoginContext = z.infer<typeof loginContextSchema>;

/** D4 */
export const loginResultSchema = sessionTokensSchema.extend({
  next: loginNextZod,
  redirectUrl: z.string(),
});

export const notifiedClientSchema = z.object({
  clientId: z.string(),
  clientName: z.string(),
});
export type NotifiedClient = z.infer<typeof notifiedClientSchema>;

/** D6 */
export const logoutResultSchema = sessionTokensSchema.extend({
  notifiedClients: z.array(notifiedClientSchema),
});

/** D7 — luật công khai; mã trong `password.rules` = `errors[].code` của PASSWORD_POLICY_VIOLATION. */
export const credentialPolicySchema = z.object({
  password: z.object({ minLength: z.int(), maxLength: z.int(), rules: z.array(z.string()) }),
  username: z.object({
    minLength: z.int(),
    maxLength: z.int(),
    allowedChars: z.string(),
    mustStartWithLetter: z.boolean(),
    /** Biểu thức chính quy dùng được ở trình duyệt. */
    pattern: z.string(),
  }),
});
export type CredentialPolicy = z.infer<typeof credentialPolicySchema>;
