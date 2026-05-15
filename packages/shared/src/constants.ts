export const Role = {
  Admin: "admin",
  Ft: "ft",
  Team: "team",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const RoundStatus = {
  Preparing: "preparing",
  Active: "active",
  Ended: "ended",
} as const;
export type RoundStatus = (typeof RoundStatus)[keyof typeof RoundStatus];

export const TeamLiveStatus = {
  Measuring: "measuring",
  Waiting: "waiting",
  Offline: "offline",
  NotStarted: "not_started",
} as const;
export type TeamLiveStatus = (typeof TeamLiveStatus)[keyof typeof TeamLiveStatus];

export const ColorCode = {
  Red: "R",
  Yellow: "Y",
  Green: "G",
  Blue: "B",
  White: "W",
} as const;
export type ColorCode = (typeof ColorCode)[keyof typeof ColorCode];

export const COLOR_CODES: ReadonlyArray<ColorCode> = ["R", "Y", "G", "B", "W"];

export const COLOR_LABEL_KO: Record<ColorCode, string> = {
  R: "빨",
  Y: "노",
  G: "초",
  B: "파",
  W: "흰",
};

export const HEARTBEAT_INTERVAL_MS = 5_000;
export const HEARTBEAT_OFFLINE_THRESHOLD_MS = 30_000;

export const DEFAULT_TIME_LIMIT_SECONDS = 900;

export const POLLING = {
  countdownMs: 500,
  teamCardMs: 1_500,
  leaderboardMs: 1_000,
  ftListMs: 2_000,
} as const;

export const JWT_TTL_SECONDS = {
  admin: 8 * 60 * 60,
  ft: 8 * 60 * 60,
  team: 4 * 60 * 60,
} as const;
