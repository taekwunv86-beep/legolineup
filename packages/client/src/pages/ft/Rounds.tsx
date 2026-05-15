// FT-02 차수 선택. 모든 상태의 차수를 카드로 표시.

import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { Round } from "@desco/shared";
import { RoundStatus } from "@desco/shared";
import { apiFetch } from "../../lib/api.js";
import { ROUND_STATUS_BADGE_CLASS, ROUND_STATUS_LABEL } from "../../lib/ui.js";

export default function FtRoundsList() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["rounds"],
    queryFn: () => apiFetch<Round[]>("/api/rounds"),
  });

  // 활성/종료된 차수 우선, preparing 마지막
  const orderFor = (s: string): number => {
    if (s === RoundStatus.Active) return 0;
    if (s === RoundStatus.Ended) return 1;
    return 2;
  };
  const sorted = (data ?? []).slice().sort((a, b) => orderFor(a.status) - orderFor(b.status));

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">차수 선택</h1>
      <p className="mb-5 text-sm text-slate-500">담당할 차수를 선택하세요.</p>

      {isLoading && <p className="text-sm text-slate-500">불러오는 중…</p>}
      {data && data.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          진행 중인 차수가 없습니다.
        </p>
      )}

      <ul className="space-y-2">
        {sorted.map((r) => (
          <li
            key={r.id}
            onClick={() => navigate(`/ft/rounds/${r.id}`)}
            className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-400 hover:shadow-sm"
          >
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                ROUND_STATUS_BADGE_CLASS[r.status]
              }`}
            >
              {ROUND_STATUS_LABEL[r.status]}
            </span>
            <div className="flex-1">
              <p className="font-semibold">{r.name}</p>
              <p className="text-xs text-slate-500">
                제한 {Math.floor(r.time_limit_seconds / 60)}분 · ID {r.id}
              </p>
            </div>
            <span className="text-slate-400">›</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
