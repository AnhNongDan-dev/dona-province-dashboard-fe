import { ErrorCode } from "@repo/zod-schemas/src/api/error.schema";

/** Phiên đăng ký đã mất (hết 30 phút / không thuộc trình duyệt này) → màn "Đăng ký lại". */
export const REG_GONE_CODES: string[] = [
  ErrorCode.RegistrationNotFound,
  ErrorCode.RegistrationExpired,
];

/**
 * Giới hạn theo IP trả retryAfterSeconds = cả cửa sổ đếm (1h / 24h) → không đếm ngược, chỉ
 * "thử lại sau". Chỉ khoảng chờ ngắn (gửi lại mã 60s…) mới đáng hiện đồng hồ.
 */
export const shortRetry = (seconds: number | null) =>
  seconds !== null && seconds <= 300 ? seconds : null;
