import type { Session } from "@repo/zod-schemas/src/entity/central-auth-schema";
import { useSyncExternalStore } from "react";

// Phiên Central của TAB này, chỉ nằm trong bộ nhớ (không storage — mỗi tab tự lấy từ BE qua D1).
// Module thuần, không import clientAPI/router để clientAPI dùng được mà không bị vòng import.

let session: Session | null = null;
let clockOffsetMs = 0;
const listeners = new Set<() => void>();

export const sessionStore = {
  get: () => session,
  set(next: Session | null) {
    session = next;
    for (const l of listeners) l();
  },
  /** D6 trả token của phiên ẩn danh mới — dùng luôn, không gọi lại D1. */
  setAnonymous(csrfToken: string, sessionId: string) {
    sessionStore.set({
      authenticated: false,
      csrfToken,
      sessionId,
      identity: null,
      authTime: null,
      idleExpiresAt: null,
      absoluteExpiresAt: null,
      personalDevice: false,
    });
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useSession() {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.get);
}

/** Header `Date` của BE → bù lệch đồng hồ máy khi hẹn giờ theo idleExpiresAt. */
export function recordServerDate(dateHeader: string | null) {
  const server = dateHeader ? Date.parse(dateHeader) : Number.NaN;
  if (!Number.isNaN(server)) clockOffsetMs = server - Date.now();
}

export function msUntil(at: Date) {
  return at.getTime() - (Date.now() + clockOffsetMs);
}

// Hook do central-session đăng ký lúc khởi động (tránh vòng import clientAPI ↔ central-session).
export const sessionHooks = {
  /** Tab đang đăng nhập nhận lỗi phiên (đổi người / hết phiên / token cũ) → đối chiếu lại D1. */
  onSessionLost: (): void => {},
  /** REAUTH_REQUIRED → mở S2; true = xác thực lại thành công, gửi lại thao tác một lần. */
  onReauthRequired: async (): Promise<boolean> => false,
  /** API quản trị trả ADMIN_FORBIDDEN → đọc lại D1 (cờ admin). */
  onAdminLost: (): void => {},
};
