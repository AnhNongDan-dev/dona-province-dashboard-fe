import {
  type LogoutMode,
  type NotifiedClient,
  type Session,
  sessionSchema,
} from "@repo/zod-schemas/src/entity/central-auth-schema";
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { clientAPI } from "@/config/clientAPI.config";
import { queryClient } from "@/config/query-client.config";
import { errorMessage } from "@/lib/api-error";
import { sessionHooks, sessionStore } from "@/lib/session-store";

// Điều phối phiên Central phía trình duyệt: đọc D1, đồng bộ nhiều tab, đăng xuất, step-up (S2).
// Mọi quyết định dựa trên D1 của BE — FE không tự tính hạn phiên.

type TabSignal = "changed" | "logged-out";

const channel =
  typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("central-session");

let inflight: Promise<Session> | null = null;

// clientAPI không validate response → parse ở đây để các mốc thời gian thành Date.
function applySession(data: unknown): Session {
  const session = sessionSchema.parse(data);
  sessionStore.set(session);
  return session;
}

/** Đọc D1 (không kéo dài idle) và cập nhật phiên của tab. */
export function loadSession(): Promise<Session> {
  inflight ??= clientAPI.CentralAuth.getSession()
    .then((res) => {
      if (!res.success) throw new Error(res.message);
      return applySession(res.data);
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function ensureSession(): Promise<Session> {
  const current = sessionStore.get();
  return current ? Promise.resolve(current) : loadSession();
}

/** Báo các tab khác cùng trình duyệt đối chiếu lại phiên. Không gửi token nào qua kênh này. */
export function broadcast(signal: TabSignal) {
  channel?.postMessage(signal);
}

/**
 * Đối chiếu phiên tab đang tin với D1 hiện tại. Phiên đổi/hết thì tải lại hẳn trang đích
 * (xóa sạch cache và state trong bộ nhớ — quan trọng trên máy dùng chung).
 */
export async function reconcile(signal?: TabSignal) {
  const prev = sessionStore.get();
  const next = await loadSession().catch(() => null);
  if (!next) return; // Lỗi mạng: giữ nguyên, lần focus / request sau sẽ thử lại.

  if (!prev?.authenticated) {
    // Tab khác vừa đăng nhập: trang login tải lại để hiện "đang đăng nhập" / continueUrl.
    if (next.authenticated && window.location.pathname === "/login") window.location.reload();
    return;
  }
  if (!next.authenticated) {
    window.location.assign(signal === "logged-out" ? "/logged-out" : "/session-ended");
    return;
  }
  if (next.identity?.id !== prev.identity?.id) {
    window.location.assign("/session-changed");
  }
}

/** D2 — chỉ gọi khi user bấm [Tiếp tục làm việc], không gọi theo chuột/phím. */
export async function keepAlive() {
  const res = await clientAPI.CentralAuth.recordActivity();
  if (res.success) applySession(res.data);
  else toast.error(errorMessage(res));
}

/** D6. Thành công → tab dùng luôn phiên ẩn danh mới, xóa cache, báo các tab khác. */
export async function logout(mode: LogoutMode): Promise<NotifiedClient[] | null> {
  const res = await clientAPI.CentralAuth.logout({ body: { mode } });
  if (!res.success) {
    toast.error(errorMessage(res));
    return null;
  }
  applyLoggedOut(res.data.csrfToken, res.data.sessionId);
  return res.data.notifiedClients;
}

/** Phiên hiện tại vừa kết thúc (D6, revoke-all kể cả phiên này): dùng luôn phiên ẩn danh mới BE
 * trả, xóa cache, báo các tab khác. */
export function applyLoggedOut(csrfToken: string, sessionId: string) {
  sessionStore.setAnonymous(csrfToken, sessionId);
  queryClient.clear();
  broadcast("logged-out");
}

// ---- S2: step-up theo yêu cầu (REAUTH_REQUIRED) ----

let reauthResolve: ((ok: boolean) => void) | null = null;
const reauthListeners = new Set<() => void>();

function setReauth(resolve: ((ok: boolean) => void) | null) {
  reauthResolve = resolve;
  for (const l of reauthListeners) l();
}

function requestReauth(): Promise<boolean> {
  reauthResolve?.(false); // chỉ một hộp thoại tại một thời điểm
  return new Promise((resolve) => setReauth(resolve));
}

export function closeReauth(ok: boolean) {
  reauthResolve?.(ok);
  setReauth(null);
}

export function useReauthOpen() {
  return useSyncExternalStore(
    (l) => {
      reauthListeners.add(l);
      return () => reauthListeners.delete(l);
    },
    () => reauthResolve !== null,
  );
}

// ---- Khởi động một lần mỗi tab ----

let installed = false;

export function installSessionSync() {
  if (installed) return;
  installed = true;
  sessionHooks.onSessionLost = () => void reconcile();
  sessionHooks.onReauthRequired = requestReauth;
  if (channel) channel.onmessage = (e: MessageEvent<TabSignal>) => void reconcile(e.data);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void reconcile();
  });
}
