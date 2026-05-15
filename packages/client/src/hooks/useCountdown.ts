// 카운트다운 훅. started_at_ms + time_limit_seconds*1000 - Date.now() 를 0.5초마다 업데이트.

import { useEffect, useState } from "react";
import { POLLING } from "@desco/shared";

type Args = {
  startedAtMs: number | null;
  timeLimitSeconds: number;
  active: boolean;
  onExpire?: () => void;
};

export function useCountdown({ startedAtMs, timeLimitSeconds, active, onExpire }: Args): number | null {
  const [remainingMs, setRemainingMs] = useState<number | null>(() => {
    if (!active || startedAtMs == null) return null;
    return Math.max(0, startedAtMs + timeLimitSeconds * 1000 - Date.now());
  });

  useEffect(() => {
    if (!active || startedAtMs == null) {
      setRemainingMs(null);
      return;
    }
    const expiresAt = startedAtMs + timeLimitSeconds * 1000;
    let expired = false;
    const tick = () => {
      const ms = Math.max(0, expiresAt - Date.now());
      setRemainingMs(ms);
      if (ms <= 0 && !expired) {
        expired = true;
        onExpire?.();
      }
    };
    tick();
    const id = window.setInterval(tick, POLLING.countdownMs);
    return () => window.clearInterval(id);
  }, [active, startedAtMs, timeLimitSeconds, onExpire]);

  return remainingMs;
}
