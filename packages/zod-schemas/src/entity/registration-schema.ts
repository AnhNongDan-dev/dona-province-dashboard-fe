import z from "zod";
import { commonZod } from "../common";
import { otpChannelZod } from "./link-transaction-schema";

// Mirror phiên đăng ký tài khoản Thành Đoàn Đồng Nai Central (TASK-007). Gắn trình duyệt (cookie),
// sống 30 phút; có thể mang theo giao dịch liên kết từ hệ thống cũ và/hoặc `req` của OIDC.
// Enum chỉ dùng để rẽ nhánh, không hiển thị ra UI → không có LABEL/OPTIONS.

export const RegistrationState = {
  OPEN: "OPEN",
  COMPLETED: "COMPLETED",
  EXPIRED: "EXPIRED",
} as const;
export type RegistrationState = (typeof RegistrationState)[keyof typeof RegistrationState];

export const RegistrationAction = {
  SEND_OTP: "SEND_OTP",
  VERIFY_OTP: "VERIFY_OTP",
  COMPLETE: "COMPLETE",
} as const;
export type RegistrationAction = (typeof RegistrationAction)[keyof typeof RegistrationAction];

/** Mã OTP đang chờ của một kênh — dựng lại ô nhập mã khi tải lại trang. */
export const pendingOtpSchema = z.object({
  channel: otpChannelZod,
  maskedDestination: z.string(),
  expiresAt: commonZod.datetime,
  resendAvailableAt: commonZod.datetime,
  sendsRemaining: z.int(),
});
export type PendingOtp = z.infer<typeof pendingOtpSchema>;

export const registrationSchema = z.object({
  regId: z.guid(),
  state: z.enum([RegistrationState.OPEN, RegistrationState.COMPLETED, RegistrationState.EXPIRED]),
  expiresAt: commonZod.datetime,
  allowedActions: z.array(
    z.enum([
      RegistrationAction.SEND_OTP,
      RegistrationAction.VERIFY_OTP,
      RegistrationAction.COMPLETE,
    ]),
  ),
  verifiedPhone: z.string().nullable(),
  verifiedEmail: z.string().nullable(),
  pendingOtps: z.array(pendingOtpSchema),
  // Có khi đăng ký từ màn "chưa liên kết" của một hệ thống cũ.
  linkTransaction: z
    .object({
      txId: z.guid(),
      providerCode: z.string(),
      providerName: z.string(),
      legacyUsername: z.string(),
      legacyDisplayName: z.string().nullable(),
      // Gợi ý theo luật D7, đã kiểm còn trống lúc trả; chỉ là gợi ý.
      suggestedUsername: z.string().nullable(),
    })
    .nullable(),
});
export type Registration = z.infer<typeof registrationSchema>;

/** Gửi mã OTP */
export const otpSendResultSchema = pendingOtpSchema.extend({ attemptsRemaining: z.int() });

/** Xác minh OTP — SĐT/email đã thuộc tài khoản khác: không nhận kênh, mời đăng nhập bằng chính nó. */
export const otpVerifyResultSchema = z.object({
  contactBelongsToExistingIdentity: z.boolean(),
  suggestedLoginId: z.string().nullable(),
  registration: registrationSchema,
});

/** Hoàn tất — tài khoản được tạo và đăng nhập luôn (token của phiên mới). */
export const registrationCompleteResultSchema = z.object({
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
