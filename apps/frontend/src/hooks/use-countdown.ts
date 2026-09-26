import { useEffect, useState } from "react";

/** Đếm ngược theo số giây BE trả (vd. RATE_LIMITED.retryAfterSeconds). */
export function useCountdown() {
  const [until, setUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (until === null) return;
    const timer = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= until) setUntil(null);
    }, 1000);
    return () => clearInterval(timer);
  }, [until]);

  return {
    secondsLeft: until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000)),
    start(seconds: number) {
      const n = Date.now();
      setNow(n);
      setUntil(n + seconds * 1000);
    },
  };
}

export function formatSeconds(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
