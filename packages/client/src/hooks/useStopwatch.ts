// 스톱워치 훅. started_at_ms 기준 0.1초 tick.

import { useEffect, useState } from "react";

export function useStopwatch(startedAtMs: number | null, running: boolean): number {
  const [elapsedMs, setElapsedMs] = useState(() =>
    startedAtMs != null && running ? Math.max(0, Date.now() - startedAtMs) : 0,
  );

  useEffect(() => {
    if (!running || startedAtMs == null) return;
    const tick = () => setElapsedMs(Math.max(0, Date.now() - startedAtMs));
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [startedAtMs, running]);

  return elapsedMs;
}
