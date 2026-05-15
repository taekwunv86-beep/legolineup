// TM-03 측정 화면 (상태 A: 측정 중, 상태 B: 다음 시도 대기).
// SPEC 6절 — 정지 핸들러는 첫 줄에서 Date.now() 캡처, 어떤 await 도 끼우지 않음.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  COLOR_CODES,
  COLOR_LABEL_KO,
  formatDurationMs,
  type ColorCode,
  type CreateAttemptBody,
  type UpdateAttemptBody,
} from "@desco/shared";
import { db, type LocalAttempt } from "../../lib/db.js";
import { enqueueCreateAttempt, enqueueUpdateAttempt } from "../../lib/sync.js";
import { useStopwatch } from "../../hooks/useStopwatch.js";
import { useCountdown } from "../../hooks/useCountdown.js";
import { useSyncStatus } from "../../hooks/useSyncStatus.js";
import { Modal } from "../../components/Modal.js";

type Props = {
  teamId: number;
  teamName: string;
  startedAtMs: number | null;
  timeLimitSeconds: number;
  onLogout: () => void;
};

export default function Measure({
  teamId,
  teamName,
  startedAtMs,
  timeLimitSeconds,
  onLogout,
}: Props) {
  // 모든 attempts 를 Dexie 에서 라이브 구독
  const localAttempts = useLiveQuery(
    () => db.attempts.where({ team_id: teamId }).toArray(),
    [teamId],
    [] as LocalAttempt[],
  );

  const sorted = useMemo(
    () => [...localAttempts].sort((a, b) => a.attempt_no - b.attempt_no),
    [localAttempts],
  );

  // 진행 중 attempt = stopped_at_ms 가 null
  const active = useMemo(
    () => sorted.find((a) => a.stopped_at_ms == null) ?? null,
    [sorted],
  );

  // 직전 시도 (정지된 가장 최근)
  const previous = useMemo(() => {
    const stopped = sorted.filter((a) => a.stopped_at_ms != null);
    return stopped[stopped.length - 1] ?? null;
  }, [sorted]);

  // 통계
  const attemptCount = sorted.length;
  const successCount = sorted.filter((a) => a.is_success === 1).length;
  const bestDurationMs = sorted
    .filter((a) => a.is_success === 1 && a.duration_ms != null)
    .reduce<number | null>((min, a) => {
      const d = a.duration_ms!;
      return min == null ? d : Math.min(min, d);
    }, null);

  // 카운트다운 (만료 시 자동 정지)
  const [forceStopUuid, setForceStopUuid] = useState<string | null>(null);
  const [inputTarget, setInputTarget] = useState<LocalAttempt | null>(null);
  const [forceInputMode, setForceInputMode] = useState(false);

  const handleAutoExpire = useCallback(() => {
    // 진행 중 attempt 가 있으면 자동 정지
    void (async () => {
      const current = await db.attempts
        .where({ team_id: teamId })
        .filter((a) => a.stopped_at_ms == null)
        .first();
      if (!current) return;
      const stoppedAtMs = Date.now();
      const durationMs = stoppedAtMs - current.started_at_ms;
      await db.attempts.update(current.client_uuid, {
        stopped_at_ms: stoppedAtMs,
        duration_ms: durationMs,
      });
      await enqueueUpdateAttempt(current.client_uuid, {
        stopped_at_ms: stoppedAtMs,
        duration_ms: durationMs,
      });
      setForceStopUuid(current.client_uuid);
      setInputTarget({
        ...current,
        stopped_at_ms: stoppedAtMs,
        duration_ms: durationMs,
      });
      setForceInputMode(true);
    })();
  }, [teamId]);

  useCountdown({
    startedAtMs,
    timeLimitSeconds,
    active: startedAtMs != null,
    onExpire: handleAutoExpire,
  });

  // 정지 — 핵심: 첫 줄에 Date.now() 캡처, await 끼우지 않음
  const onStop = (target: LocalAttempt) => {
    const stoppedAtMs = Date.now();
    const durationMs = stoppedAtMs - target.started_at_ms;
    // IndexedDB 와 sync 큐는 빨리 끝나는 fire-and-forget 으로
    void db.attempts.update(target.client_uuid, {
      stopped_at_ms: stoppedAtMs,
      duration_ms: durationMs,
    });
    void enqueueUpdateAttempt(target.client_uuid, {
      stopped_at_ms: stoppedAtMs,
      duration_ms: durationMs,
    });
    setInputTarget({
      ...target,
      stopped_at_ms: stoppedAtMs,
      duration_ms: durationMs,
    });
  };

  // 시작 — 다음 attempt
  const onStart = () => {
    const startedAtMs2 = Date.now();
    const nextNo =
      sorted.reduce((max, a) => Math.max(max, a.attempt_no), 0) + 1;
    const uuid = crypto.randomUUID();
    const newAttempt: LocalAttempt = {
      client_uuid: uuid,
      team_id: teamId,
      attempt_no: nextNo,
      started_at_ms: startedAtMs2,
      stopped_at_ms: null,
      duration_ms: null,
      assembly_order_1: null,
      assembly_order_2: null,
      assembly_order_3: null,
      assembly_order_4: null,
      assembly_order_5: null,
      turn_t: null,
      turn_extra: null,
      user_notes: null,
      is_success: 0,
    };
    void db.attempts.put(newAttempt);
    void enqueueCreateAttempt({
      client_uuid: uuid,
      team_id: teamId,
      attempt_no: nextNo,
      started_at_ms: startedAtMs2,
    } satisfies CreateAttemptBody);
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-900 text-white">
      <TopBar
        teamName={teamName}
        startedAtMs={startedAtMs}
        timeLimitSeconds={timeLimitSeconds}
        onLogout={onLogout}
      />
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-6">
        {active ? (
          <StateA active={active} onStop={() => onStop(active)} />
        ) : (
          <StateB
            attemptCount={attemptCount}
            successCount={successCount}
            bestDurationMs={bestDurationMs}
            previous={previous}
            onStart={onStart}
          />
        )}
      </main>
      <InputModal
        target={inputTarget}
        forceMode={forceInputMode}
        onClose={() => {
          if (!forceInputMode) setInputTarget(null);
        }}
        onSaved={() => {
          setInputTarget(null);
          setForceInputMode(false);
          setForceStopUuid(null);
        }}
      />
      {forceStopUuid && !inputTarget && (
        <p className="bg-slate-800 p-2 text-center text-xs">시간 만료 자동 정지</p>
      )}
    </div>
  );
}

function TopBar({
  teamName,
  startedAtMs,
  timeLimitSeconds,
  onLogout,
}: {
  teamName: string;
  startedAtMs: number | null;
  timeLimitSeconds: number;
  onLogout: () => void;
}) {
  const remainingMs = useCountdown({
    startedAtMs,
    timeLimitSeconds,
    active: startedAtMs != null,
  });
  const sync = useSyncStatus();
  return (
    <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
      <div className="flex items-center gap-3">
        <p className="text-base font-bold">{teamName}</p>
        <SyncBadge status={sync.status} queued={sync.queued} />
      </div>
      <div className="flex items-center gap-4">
        <p className="font-mono text-sm tabular-nums text-slate-300">
          남은 {remainingMs != null ? formatDurationMs(remainingMs) : "--:--.--"}
        </p>
        <button
          onClick={onLogout}
          className="text-xs text-slate-400 hover:text-white"
        >
          로그아웃
        </button>
      </div>
    </div>
  );
}

function SyncBadge({ status, queued }: { status: string; queued: number }) {
  const label =
    status === "offline"
      ? `오프라인 · 큐 ${queued}`
      : status === "syncing"
        ? `동기화 중 · ${queued}`
        : "온라인";
  const color =
    status === "offline"
      ? "bg-amber-500/20 text-amber-300"
      : status === "syncing"
        ? "bg-slate-500/30 text-slate-200"
        : "bg-emerald-500/20 text-emerald-300";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] ${color}`}>{label}</span>;
}

function StateA({ active, onStop }: { active: LocalAttempt; onStop: () => void }) {
  const elapsedMs = useStopwatch(active.started_at_ms, active.stopped_at_ms == null);
  return (
    <div className="w-full max-w-sm text-center">
      <p className="mb-3 text-xs uppercase tracking-wider text-slate-400">
        시도 #{active.attempt_no} 측정 중
      </p>
      <p className="mb-8 font-mono text-7xl font-bold tabular-nums">
        {formatDurationMs(elapsedMs)}
      </p>
      <button
        onClick={onStop}
        className="w-full rounded-2xl bg-red-500 py-6 text-2xl font-bold text-white shadow-lg active:bg-red-600"
      >
        정 지
      </button>
    </div>
  );
}

function StateB({
  attemptCount,
  successCount,
  bestDurationMs,
  previous,
  onStart,
}: {
  attemptCount: number;
  successCount: number;
  bestDurationMs: number | null;
  previous: LocalAttempt | null;
  onStart: () => void;
}) {
  return (
    <div className="w-full max-w-sm">
      {previous && (
        <div className="mb-6 rounded-xl bg-slate-800 p-4">
          <p className="mb-1 text-xs text-slate-400">직전 시도 #{previous.attempt_no}</p>
          <p className="font-mono text-2xl tabular-nums">
            {previous.duration_ms != null ? formatDurationMs(previous.duration_ms) : "—"}
          </p>
          {previous.assembly_order_1 && (
            <p className="mt-2 flex gap-1 text-xs">
              {[1, 2, 3, 4, 5].map((i) => {
                const v = previous[
                  `assembly_order_${i}` as keyof LocalAttempt
                ] as ColorCode | null;
                return (
                  <span
                    key={i}
                    className="inline-block w-6 rounded bg-slate-700 px-1 py-0.5 text-center"
                  >
                    {v ? COLOR_LABEL_KO[v] : "·"}
                  </span>
                );
              })}
              {previous.turn_t != null && (
                <span className="ml-2 text-slate-400">
                  {previous.turn_t}T+{previous.turn_extra ?? 0}
                </span>
              )}
            </p>
          )}
        </div>
      )}
      <div className="mb-6 grid grid-cols-3 gap-2 text-center">
        <Stat label="시도" value={attemptCount} />
        <Stat label="성공" value={successCount} highlight={successCount > 0} />
        <Stat
          label="최단"
          valueText={bestDurationMs != null ? formatDurationMs(bestDurationMs) : "—"}
        />
      </div>
      <button
        onClick={onStart}
        className="w-full rounded-2xl bg-emerald-500 py-6 text-2xl font-bold text-white shadow-lg active:bg-emerald-600"
      >
        시 작
      </button>
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
    <div className="rounded-lg bg-slate-800 px-2 py-3">
      <p className="text-[10px] uppercase tracking-wider text-slate-400">{label}</p>
      <p
        className={`mt-0.5 font-mono text-lg font-semibold tabular-nums ${
          highlight ? "text-indigo-300" : "text-slate-100"
        }`}
      >
        {valueText ?? value}
      </p>
    </div>
  );
}

// ----- TM-04 시퀀스 입력 (모달로 구현) -----

function InputModal({
  target,
  forceMode,
  onClose,
  onSaved,
}: {
  target: LocalAttempt | null;
  forceMode: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [colors, setColors] = useState<(ColorCode | null)[]>([null, null, null, null, null]);
  const [turnT, setTurnT] = useState<string>("");
  const [turnExtra, setTurnExtra] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (target) {
      setColors([
        target.assembly_order_1,
        target.assembly_order_2,
        target.assembly_order_3,
        target.assembly_order_4,
        target.assembly_order_5,
      ]);
      setTurnT(target.turn_t != null ? String(target.turn_t) : "");
      setTurnExtra(target.turn_extra != null ? String(target.turn_extra) : "");
      setNotes(target.user_notes ?? "");
    }
  }, [target]);

  if (!target) return null;

  const onSelect = (idx: number, code: ColorCode) => {
    setColors((arr) => {
      const next = [...arr];
      next[idx] = next[idx] === code ? null : code;
      return next;
    });
  };

  const onSave = async () => {
    setSaving(true);
    const patch: UpdateAttemptBody = {};
    colors.forEach((c, i) => {
      if (c) (patch as Record<string, unknown>)[`assembly_order_${i + 1}`] = c;
    });
    if (turnT !== "") patch.turn_t = Number(turnT);
    if (turnExtra !== "") patch.turn_extra = Number(turnExtra);
    if (notes !== "") patch.user_notes = notes;

    const localPatch: Partial<LocalAttempt> = {};
    colors.forEach((c, i) => {
      (localPatch as Record<string, unknown>)[`assembly_order_${i + 1}`] = c;
    });
    if (turnT !== "") localPatch.turn_t = Number(turnT);
    if (turnExtra !== "") localPatch.turn_extra = Number(turnExtra);
    if (notes !== "") localPatch.user_notes = notes;

    await db.attempts.update(target.client_uuid, localPatch);
    await enqueueUpdateAttempt(target.client_uuid, patch);
    setSaving(false);
    onSaved();
  };

  return (
    <Modal
      open={target !== null}
      onClose={() => {
        if (!forceMode) onClose();
      }}
      title={`시도 #${target.attempt_no} 입력`}
      widthClass="max-w-md"
    >
      {forceMode && (
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          시간이 만료되어 자동 정지되었습니다. 입력 후 저장하세요.
        </p>
      )}
      <p className="mb-3 text-sm text-slate-700">
        측정 시간{" "}
        <span className="font-mono tabular-nums">
          {target.duration_ms != null ? formatDurationMs(target.duration_ms) : "—"}
        </span>
      </p>

      <p className="mb-2 text-xs font-medium text-slate-600">조립 순서 (1~5)</p>
      <div className="mb-4 space-y-2">
        {[0, 1, 2, 3, 4].map((idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="w-4 text-xs text-slate-500">{idx + 1}</span>
            {COLOR_CODES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onSelect(idx, c)}
                className={`flex-1 rounded-md border py-1.5 text-sm font-semibold ${
                  colors[idx] === c
                    ? `border-slate-900 ${COLOR_SOLID[c]} text-white`
                    : `border-slate-300 ${COLOR_LIGHT[c]} text-slate-800`
                }`}
              >
                {COLOR_LABEL_KO[c]}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium">T 값</span>
          <input
            type="number"
            min={0}
            value={turnT}
            onChange={(e) => setTurnT(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium">추가</span>
          <input
            type="number"
            min={0}
            value={turnExtra}
            onChange={(e) => setTurnExtra(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          />
        </label>
      </div>

      <label className="mb-4 block">
        <span className="mb-1 block text-xs font-medium">메모 (선택)</span>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
        />
      </label>

      <div className="flex justify-end gap-2">
        {!forceMode && (
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
          >
            취소
          </button>
        )}
        <button
          onClick={onSave}
          disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </Modal>
  );
}

const COLOR_LIGHT: Record<ColorCode, string> = {
  R: "bg-red-50",
  Y: "bg-yellow-50",
  G: "bg-green-50",
  B: "bg-blue-50",
  W: "bg-white",
};

const COLOR_SOLID: Record<ColorCode, string> = {
  R: "bg-red-500",
  Y: "bg-yellow-500",
  G: "bg-green-500",
  B: "bg-blue-500",
  W: "bg-slate-600",
};
