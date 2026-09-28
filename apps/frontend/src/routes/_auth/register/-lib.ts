import { ErrorCode } from "@repo/zod-schemas/src/api/error.schema";
import type { ErrorResponse } from "@repo/zod-schemas/src/api/response";
import type { CredentialPolicy } from "@repo/zod-schemas/src/entity/central-auth-schema";
import type {
  Registration,
  RegistrationAction,
} from "@repo/zod-schemas/src/entity/registration-schema";

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

/** Những gì mỗi bước đăng ký cần — truyền xuống từ trang /register. */
export type RegWizard = {
  reg: Registration;
  policy: CredentialPolicy | null;
  setReg: (reg: Registration) => void;
  reload: () => Promise<void>;
  /** Hiện lỗi của một request; phiên mất / sai bước thì tự xử lý. Trả câu để hiển thị. */
  fail: (res: ErrorResponse) => string;
  can: (action: RegistrationAction) => boolean;
  /** OTP đúng nhưng SĐT / email đã thuộc tài khoản khác → mời đăng nhập bằng chính nó. */
  onExistingIdentity: (loginId: string | null) => void;
};
