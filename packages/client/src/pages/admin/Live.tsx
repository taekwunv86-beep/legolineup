import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RoundStatus,
  TeamLiveStatus,
  type LiveTeamCard,
  type StartRoundResponse,
  type LiveResponse,
} from "@desco/shared";
import { apiFetch, ApiClientError } from "../../lib/api.js";
import { formatDurationMs, formatKst } from "@desco/shared";
import { useLiveRound } from "../../hooks/useLiveRound.js";
import { useCountdown } from "../../hooks/useCountdown.js";
import { ROUND_STATUS_BADGE_CLASS, ROUND_STATUS_LABEL } from "../../lib/ui.js";
import { Modal } from "../../components/Modal.js";

type Sort = "best" | "attempts" | "successes" | "name";

export default function AdminLive() {
  const { roundId } = useParams<{ roundId: string }>();
  const id = Number(roundId);
  const live = useLiveRound(id);

  const [sort, setSort] = useState<Sort>("best");
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  const round = live.data?.round;
  const isActive = round?.status === RoundStatus.Active;
  const countdownMs = useCountdown({
    startedAtMs: round?.started_at_ms ?? null,
    timeLimitSeconds: round?.time_limit_seconds ?? 900,
    active: isActive,
  });

  const teams = useMemo(() => sortTeams(live.data?.teams ?? [], sort), [live.data, sort]);

  return (
    <div>
      <header className="mb-4">
        <Link to="/admin/rounds" className="text-xs text-slate-500 hover:underline">
          ← 차수 목록
        </Link>
      </header>

      {!round && live.isLoading && <p className="text-sm text-slate-500">불러오는 중…</p>}
      {!round && !live.isLoading && (
        <p className="text-sm text-red-600">차수를 찾을 수 없습니다.</p>
      )}

      {round && (
        <>
          <LiveHeader round={round} countdownMs={countdownMs} />
          <LiveActions
            round={round}
            onStart={() => setStartOpen(true)}
            onEnd={() => setEndOpen(true)}
          />
          <LiveSummary summary={live.data!.summary} />
          <SortBar sort={sort} onChange={setSort} />
          <TeamGrid teams={teams} />

          <StartRoundModal
            open={startOpen}
            onClose={() => setStartOpen(false)}
            roundId={id}
            live={live.data}
          />
          <EndRoundModal open={endOpen} onClose={() => setEndOpen(false)} roundId={id} />
        </>
      )}
    </div>
  );
}

function sortTeams(teams: LiveTeamCard[], sort: Sort): LiveTeamCard[] {
  const arr = [...teams];
  switch (sort) {
    case "best":
      arr.sort((a, b) => {
        const av = a.best_duration_ms ?? Number.POSITIVE_INFINITY;
        const bv = b.best_duration_ms ?? Number.POSITIVE_INFINITY;
        return av - bv;
      });
      break;
    case "attempts":
      arr.sort((a, b) => b.attempt_count - a.attempt_count);
      break;
    case "successes":
      arr.sort((a, b) => b.success_count - a.success_count);
      break;
    case "name":
      arr.sort((a, b) => a.name.localeCompare(b.name, "ko"));
      break;
  }
  return arr;
}

function LiveHeader({
  round,
  countdownMs,
}: {
  round: LiveResponse["round"];
  countdownMs: number | null;
}) {
  return (
    <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex items-end justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                ROUND_STATUS_BADGE_CLASS[round.status]
              }`}
            >
              {ROUND_STATUS_LABEL[round.status]}
            </span>
            <h1 className="text-2xl font-bold">{round.name}</h1>
          </div>
          <p className="text-xs text-slate-500">
            제한 {Math.floor(round.time_limit_seconds / 60)}분
            {round.started_at_ms != null && ` · 시작 ${formatKst(round.started_at_ms)}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wider text-slate-400">남은 시간</p>
          <p
            className={`font-mono text-5xl font-bold tabular-nums ${
              countdownMs != null && countdownMs < 60_000 ? "text-red-600" : "text-slate-900"
            }`}
          >
            {countdownMs != null ? formatDurationMs(countdownMs) : "--:--.--"}
          </p>
        </div>
      </div>
      {round.access_code && <AccessCodeBanner accessCode={round.access_code} />}
    </div>
  );
}

function AccessCodeBanner({ accessCode }: { accessCode: string }) {
  const display = `${accessCode.slice(0, 3)}-${accessCode.slice(3)}`;
  const loginUrl = `${window.location.origin}/team/login?code=${accessCode}`;
  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
  };
  return (
    <div className="mt-5 flex flex-wrap items-center gap-4 rounded-xl bg-slate-900 px-5 py-4 text-white">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-slate-400">팀 입장 코드</p>
        <p className="font-mono text-3xl font-bold tracking-widest">{display}</p>
      </div>
      <div className="flex-1" />
      <button
        onClick={() => copy(display)}
        className="rounded-lg border border-slate-600 px-3 py-2 text-xs hover:bg-slate-800"
      >
        코드 복사
      </button>
      <button
        onClick={() => copy(loginUrl)}
        className="rounded-lg border border-slate-600 px-3 py-2 text-xs hover:bg-slate-800"
      >
        링크 복사
      </button>
    </div>
  );
}

function LiveActions({
  round,
  onStart,
  onEnd,
}: {
  round: LiveResponse["round"];
  onStart: () => void;
  onEnd: () => void;
}) {
  const s = round.status;
  const canStart = s === RoundStatus.Preparing;
  const canOpenBoard = s === RoundStatus.Active || s === RoundStatus.Ended;
  const canEnd = s === RoundStatus.Active;
  const canExport = s === RoundStatus.Active || s === RoundStatus.Ended;

  const onOpenBoard = () => {
    // share_token 은 라이브 응답에 없음 → 별도 round 상세에서 가져와야 함.
    // PR 6 리더보드 단계에서 연결 예정. 지금은 안내만.
    alert("리더보드 화면은 PR 6 단계에서 연결됩니다.");
  };

  const onExport = () => {
    alert("엑셀 내보내기는 PR 7 단계에서 연결됩니다.");
  };

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <ActionButton variant="primary" disabled={!canStart} onClick={onStart}>
        전체 시작
      </ActionButton>
      <ActionButton variant="default" disabled={!canOpenBoard} onClick={onOpenBoard}>
        리더보드 열기
      </ActionButton>
      <ActionButton variant="danger" disabled={!canEnd} onClick={onEnd}>
        차수 종료
      </ActionButton>
      <ActionButton variant="default" disabled={!canExport} onClick={onExport}>
        엑셀 내보내기
      </ActionButton>
    </div>
  );
}

function ActionButton({
  variant,
  disabled,
  onClick,
  children,
}: {
  variant: "primary" | "default" | "danger";
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const base = "rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40";
  const styles =
    variant === "primary"
      ? "bg-slate-900 text-white hover:bg-slate-800"
      : variant === "danger"
        ? "border border-red-300 bg-white text-red-600 hover:bg-red-50"
        : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-100";
  return (
    <button disabled={disabled} onClick={onClick} className={`${base} ${styles}`}>
      {children}
    </button>
  );
}

function LiveSummary({ summary }: { summary: LiveResponse["summary"] }) {
  return (
    <div className="mb-4 grid grid-cols-4 gap-3">
      <SummaryCard label="총 팀" value={summary.total_teams} />
      <SummaryCard label="측정 중" value={summary.measuring_teams} accent />
      <SummaryCard label="총 시도" value={summary.total_attempts} />
      <SummaryCard label="총 성공" value={summary.total_successes} positive />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
  positive,
}: {
  label: string;
  value: number;
  accent?: boolean;
  positive?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={`mt-1 text-3xl font-bold tabular-nums ${
          accent ? "text-emerald-600" : positive ? "text-indigo-600" : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function SortBar({ sort, onChange }: { sort: Sort; onChange: (s: Sort) => void }) {
  const items: [Sort, string][] = [
    ["best", "최단기록"],
    ["attempts", "시도수"],
    ["successes", "성공수"],
    ["name", "팀명"],
  ];
  return (
    <div className="mb-3 flex gap-2">
      {items.map(([val, label]) => (
        <button
          key={val}
          onClick={() => onChange(val)}
          className={`rounded-full border px-3 py-1 text-xs ${
            sort === val
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function TeamGrid({ teams }: { teams: LiveTeamCard[] }) {
  if (teams.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        팀이 없습니다.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {teams.map((t) => (
        <TeamCard key={t.id} team={t} />
      ))}
    </div>
  );
}

const TEAM_STATUS_LABEL: Record<string, string> = {
  [TeamLiveStatus.Measuring]: "측정 중",
  [TeamLiveStatus.Waiting]: "대기",
  [TeamLiveStatus.Offline]: "미접속",
  [TeamLiveStatus.NotStarted]: "미시작",
};

const TEAM_STATUS_BADGE: Record<string, string> = {
  [TeamLiveStatus.Measuring]: "bg-emerald-100 text-emerald-700",
  [TeamLiveStatus.Waiting]: "bg-slate-200 text-slate-700",
  [TeamLiveStatus.Offline]: "bg-amber-100 text-amber-700",
  [TeamLiveStatus.NotStarted]: "bg-slate-100 text-slate-500",
};

function TeamCard({ team }: { team: LiveTeamCard }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-bold">{team.name}</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            TEAM_STATUS_BADGE[team.status]
          }`}
        >
          {TEAM_STATUS_LABEL[team.status]}
          {team.current_attempt_no != null && ` · #${team.current_attempt_no}`}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="시도" value={team.attempt_count} />
        <Stat label="성공" value={team.success_count} highlight={team.success_count > 0} />
        <Stat
          label="최단"
          valueText={team.best_duration_ms != null ? formatDurationMs(team.best_duration_ms) : "—"}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  valueText,
  highlight,
}: {
  label: string;
  value?: number;
  valueText?: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-slate-400">{label}</p>
      <p
        className={`mt-0.5 font-mono text-base font-semibold tabular-nums ${
          highlight ? "text-indigo-600" : "text-slate-900"
        }`}
      >
        {valueText ?? value}
      </p>
    </div>
  );
}

function StartRoundModal({
  open,
  onClose,
  roundId,
  live,
}: {
  open: boolean;
  onClose: () => void;
  roundId: number;
  live: LiveResponse | undefined;
}) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const offlineTeams = live?.teams.filter((t) => t.status === TeamLiveStatus.Offline) ?? [];
  const totalTeams = live?.teams.length ?? 0;

  const mut = useMutation({
    mutationFn: () =>
      apiFetch<StartRoundResponse>(`/api/rounds/${roundId}/start`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rounds", roundId, "live"] });
      qc.invalidateQueries({ queryKey: ["rounds", roundId] });
      qc.invalidateQueries({ queryKey: ["rounds"] });
      onClose();
    },
  });

  const onConfirm = async () => {
    setError(null);
    try {
      await mut.mutateAsync();
    } catch (e) {
      if (e instanceof ApiClientError) setError(e.body.error.message);
      else setError("시작에 실패했습니다.");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="차수 시작 확인">
      <p className="mb-3 text-sm">
        총 <b>{totalTeams}</b>팀의 측정을 시작합니다. 시작 후에는 시간/팀 변경이 불가합니다.
      </p>
      {offlineTeams.length > 0 && (
        <div className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          ⚠ 미접속/heartbeat 없는 팀 {offlineTeams.length}개가 있습니다 (
          {offlineTeams.map((t) => t.name).join(", ")}). 그래도 진행하시겠습니까?
        </div>
      )}
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
        >
          취소
        </button>
        <button
          disabled={mut.isPending || totalTeams === 0}
          onClick={onConfirm}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {mut.isPending ? "시작 중…" : "전체 시작"}
        </button>
      </div>
    </Modal>
  );
}

function EndRoundModal({
  open,
  onClose,
  roundId,
}: {
  open: boolean;
  onClose: () => void;
  roundId: number;
}) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () => apiFetch(`/api/rounds/${roundId}/end`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rounds", roundId, "live"] });
      qc.invalidateQueries({ queryKey: ["rounds", roundId] });
      qc.invalidateQueries({ queryKey: ["rounds"] });
      onClose();
    },
  });

  const onConfirm = async () => {
    setError(null);
    try {
      await mut.mutateAsync();
    } catch (e) {
      if (e instanceof ApiClientError) setError(e.body.error.message);
      else setError("종료에 실패했습니다.");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="차수 종료 확인">
      <p className="mb-3 text-sm">
        차수를 종료합니다. 진행 중인 측정은 자동 종료 처리됩니다. 되돌릴 수 없습니다.
      </p>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
        >
          취소
        </button>
        <button
          disabled={mut.isPending}
          onClick={onConfirm}
          className="rounded-lg border border-red-300 bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {mut.isPending ? "종료 중…" : "차수 종료"}
        </button>
      </div>
    </Modal>
  );
}
