export const KST_OFFSET_MINUTES = 9 * 60;

export const nowSec = (): number => Math.floor(Date.now() / 1000);
export const nowMs = (): number => Date.now();

export const msToSec = (ms: number): number => Math.floor(ms / 1000);
export const secToMs = (sec: number): number => sec * 1000;

export const formatDurationMs = (durationMs: number): string => {
  const sign = durationMs < 0 ? "-" : "";
  const abs = Math.abs(durationMs);
  const totalSec = Math.floor(abs / 1000);
  const mm = Math.floor(totalSec / 60).toString().padStart(2, "0");
  const ss = (totalSec % 60).toString().padStart(2, "0");
  const hundredths = Math.floor((abs % 1000) / 10).toString().padStart(2, "0");
  return `${sign}${mm}:${ss}.${hundredths}`;
};

export const formatKst = (epochMsOrSec: number, opts?: { unit?: "ms" | "s" }): string => {
  const ms = (opts?.unit ?? "ms") === "ms" ? epochMsOrSec : epochMsOrSec * 1000;
  const d = new Date(ms + KST_OFFSET_MINUTES * 60 * 1000);
  const yyyy = d.getUTCFullYear();
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = d.getUTCDate().toString().padStart(2, "0");
  const hh = d.getUTCHours().toString().padStart(2, "0");
  const mi = d.getUTCMinutes().toString().padStart(2, "0");
  const ss = d.getUTCSeconds().toString().padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
};
