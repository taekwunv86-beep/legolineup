// 공통 UI 헬퍼

import { RoundStatus } from "@desco/shared";

export const ROUND_STATUS_LABEL: Record<string, string> = {
  [RoundStatus.Preparing]: "준비",
  [RoundStatus.Active]: "진행 중",
  [RoundStatus.Ended]: "종료",
};

export const ROUND_STATUS_BADGE_CLASS: Record<string, string> = {
  [RoundStatus.Preparing]: "bg-slate-200 text-slate-700",
  [RoundStatus.Active]: "bg-emerald-100 text-emerald-700",
  [RoundStatus.Ended]: "bg-slate-100 text-slate-500",
};
