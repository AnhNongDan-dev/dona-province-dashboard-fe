import { ERROR_DATA, ErrorCode } from "@repo/zod-schemas/src/api/error.schema";
import type { ErrorResponse } from "@repo/zod-schemas/src/api/response";

/** Câu tiếng Việt theo mã lỗi; mã lạ (đã bị chuẩn hóa thành ResponseParseFailed) → message của BE. */
export function errorMessage(res: ErrorResponse) {
  if (res.errorCode === ErrorCode.ResponseParseFailed) return res.message;
  return ERROR_DATA[res.errorCode]?.message ?? res.message;
}

/** Tham số kèm lỗi trong `data` (retryAfterSeconds, attemptsRemaining…). */
export function errorParam<T extends "number" | "string">(
  res: ErrorResponse,
  key: string,
  type: T,
): (T extends "number" ? number : string) | null {
  const value = res.data?.[key];
  return typeof value === type ? (value as T extends "number" ? number : string) : null;
}

/** Lỗi BE gắn trong `cause` của Error mà repository ném ra (null khi lỗi khác, vd. parse). */
export function queryError(error: unknown): ErrorResponse | null {
  const cause = error instanceof Error ? error.cause : null;
  return cause && typeof cause === "object" && "errorCode" in cause
    ? (cause as ErrorResponse)
    : null;
}
