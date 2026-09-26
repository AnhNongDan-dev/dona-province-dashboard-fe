import { LogoutMode, type Session } from "@repo/zod-schemas/src/entity/central-auth-schema";
import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { formatSeconds } from "@/hooks/use-countdown";
import { useLogout } from "@/hooks/use-logout";
import { keepAlive, reconcile } from "@/lib/central-session";
import { msUntil } from "@/lib/session-store";

const WARN_BEFORE_MS = 60_000;
// Chặn vòng gọi D1 dồn dập nếu đồng hồ lệch làm hạn "đã qua" mà BE vẫn thấy phiên còn.
const MIN_RECHECK_MS = 2_000;

/**
 * F9 — hạn do BE trả (idleExpiresAt / absoluteExpiresAt), FE không tự tính.
 * Tới mốc thì đọc lại D1 (không kéo dài idle): tab/request khác đã kéo dài → hẹn lại;
 * vẫn sắp hết → cảnh báo; đã hết → reconcile đưa sang S4.
 */
export function IdleWarningDialog({ session }: { session: Session }) {
  const { idleExpiresAt, absoluteExpiresAt } = session;
  const [warning, setWarning] = useState(false);

  useEffect(() => {
    if (!idleExpiresAt) return;
    const idleMs = msUntil(idleExpiresAt);
    const absMs = absoluteExpiresAt ? msUntil(absoluteExpiresAt) : Number.POSITIVE_INFINITY;
    const warnNow = absMs > idleMs && idleMs <= WARN_BEFORE_MS;
    const recheckIn = absMs <= idleMs ? absMs : warnNow ? idleMs : idleMs - WARN_BEFORE_MS;

    setWarning(warnNow);
    const timer = setTimeout(() => void reconcile(), Math.max(recheckIn, MIN_RECHECK_MS));
    return () => clearTimeout(timer);
  }, [idleExpiresAt, absoluteExpiresAt]);

  if (!warning || !idleExpiresAt) return null;
  return <WarningContent idleExpiresAt={idleExpiresAt} />;
}

function WarningContent({ idleExpiresAt }: { idleExpiresAt: Date }) {
  const runLogout = useLogout();
  const [secondsLeft, setSecondsLeft] = useState(() => secondsUntil(idleExpiresAt));

  useEffect(() => {
    const timer = setInterval(() => setSecondsLeft(secondsUntil(idleExpiresAt)), 1000);
    return () => clearInterval(timer);
  }, [idleExpiresAt]);

  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Phiên sắp kết thúc do không hoạt động</AlertDialogTitle>
          <AlertDialogDescription>
            Phiên đăng nhập sẽ kết thúc sau {formatSeconds(secondsLeft)}. Chọn "Tiếp tục làm việc"
            nếu bạn vẫn đang dùng máy.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => runLogout(LogoutMode.LOGOUT)}>
            Đăng xuất
          </Button>
          <Button onClick={() => void keepAlive()}>Tiếp tục làm việc</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function secondsUntil(at: Date) {
  return Math.max(0, Math.ceil(msUntil(at) / 1000));
}
