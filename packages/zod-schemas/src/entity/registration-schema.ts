import z from "zod";
import { commonZod } from "../common";

// Mirror phiên đăng ký tài khoản Thành Đoàn Đồng Nai Central. Gắn trình duyệt
// (cookie), sống 30 phút; có thể mang theo giao dịch liên kết từ hệ thống cũ và/hoặc `req` của OIDC.
// Gửi thông tin (submit) → BE gửi mã tới email ngầm → nhập mã (verify) = tạo tài khoản.
// Enum chỉ dùng để rẽ nhánh, không hiển thị ra UI → không có LABEL/OPTIONS.

export const RegistrationState = {
  OPEN: "OPEN",
  COMPLETED: "COMPLETED",
  EXPIRED: "EXPIRED",
} as const;
export type RegistrationState = (typeof RegistrationState)[keyof typeof RegistrationState];

export const RegistrationAction = {
  SUBMIT: "SUBMIT",
  VERIFY: "VERIFY",
  RESEND: "RESEND",
} as const;
export type RegistrationAction = (typeof RegistrationAction)[keyof typeof RegistrationAction];

/** Thông tin đã gửi (chưa tạo tài khoản). Không bao giờ có mật khẩu hay email rõ. */
export const registrationDraftSchema = z.object({
  displayName: z.string(),
  username: z.string(),
  maskedEmail: z.string(),
  // SĐT tự khai (không xác minh), trả nguyên để [Sửa thông tin] điền lại.
  phone: z.string().nullable(),
  expiresAt: commonZod.datetime,
  resendAvailableAt: commonZod.datetime,
  sendsRemaining: z.int(),
});
export type RegistrationDraft = z.infer<typeof registrationDraftSchema>;

export const registrationSchema = z.object({
  regId: z.guid(),
  state: z.enum([RegistrationState.OPEN, RegistrationState.COMPLETED, RegistrationState.EXPIRED]),
  expiresAt: commonZod.datetime,
  allowedActions: z.array(
    z.enum([RegistrationAction.SUBMIT, RegistrationAction.VERIFY, RegistrationAction.RESEND]),
  ),
  // null khi chưa gửi thông tin.
  draft: registrationDraftSchema.nullable(),
  // Có khi đăng ký từ màn "chưa liên kết" của một hệ thống cũ.
  linkTransaction: z
    .object({
      txId: z.guid(),
      providerCode: z.string(),
      providerName: z.string(),
      legacyUsername: z.string(),
      legacyDisplayName: z.string().nullable(),
      // Gợi ý theo chính sách tên đăng nhập, đã kiểm còn trống lúc trả; chỉ là gợi ý.
      suggestedUsername: z.string().nullable(),
    })
    .nullable(),
});
export type Registration = z.infer<typeof registrationSchema>;

/** Gửi thông tin / gửi lại mã — mã đã được gửi ngầm tới email. */
export const registrationSubmitResultSchema = z.object({
  maskedEmail: z.string(),
  expiresAt: commonZod.datetime,
  resendAvailableAt: commonZod.datetime,
  sendsRemaining: z.int(),
  attemptsRemaining: z.int(),
});
export type RegistrationSubmitResult = z.infer<typeof registrationSubmitResultSchema>;

/** Nhập đúng mã — tài khoản được tạo và đăng nhập luôn (token của phiên mới). Idempotent. */
export const registrationVerifyResultSchema = z.object({
  username: z.string(),
  // null khi gọi lặp mà phiên hiện tại không còn là tài khoản vừa tạo.
  csrfToken: z.string().nullable(),
  sessionId: z.guid().nullable(),
  redirectUrl: z.string(),
  linkTransactionAttached: z.boolean(),
});

/** Kiểm tên đăng nhập khi gõ — reason chỉ có khi available=false. */
export const usernameAvailabilitySchema = z.object({
  available: z.boolean(),
  reason: z.enum(["TAKEN", "RESERVED", "INVALID"]).nullable(),
});
