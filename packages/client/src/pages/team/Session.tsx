// 팀 세션 컨테이너 — heartbeat 폴링 후 round_status 별로 화면 분기.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  HEARTBEAT_INTERVAL_MS,
  RoundStatus,
  type Attempt,
  type HeartbeatResponse,
} from "@desco/shared";
import { apiFetch, ApiClientError } from "../../lib/api.js";
import { clearSession, getUser } from "../../lib/auth.js";
import { db } from "../../lib/db.js";
import Waiting from "./Waiting.js";
import Measure from "./Measure.js";
import Ended from "./Ended.js";

type RoundLifecycle = "preparing" | "active" | "ended";

export default function TeamSession() {
  const navigate = useNavigate();
  const user = getUser();
  const teamId = user?.id;

  const [status, setStatus] = useState<RoundLifecycle | null>(null);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [timeLimitSeconds, setTimeLimitSeconds] = useState<number>(900);
  const [bootstrapped, setBootstrapped] = useState(false);

  // 초기: 서버의 attempts 목록을 IndexedDB 에 sync
  useEffect(() => {
    if (!teamId) return;
    (async () => {
      try {
        const rows = await apiFetch<Attempt[]>(`/api/teams/${teamId}/attempts`);
        await Promise.all(
          rows.map((a) =>
            db.attempts.put({
              client_uuid: a.client_uuid,
              team_id: a.team_id,
              attempt_no: a.attempt_no,
              started_at_ms: a.started_at_ms,
              stopped_at_ms: a.stopped_at_ms,
              duration_ms: a.duration_ms,
              assembly_order_1: a.assembly_order_1,
              assembly_order_2: a.assembly_order_2,
              assembly_order_3: a.assembly_order_3,
              assembly_order_4: a.assembly_order_4,
              assembly_order_5: a.assembly_order_5,
              turn_t: a.turn_t,
              turn_extra: a.turn_extra,
              user_notes: a.user_notes,
              is_success: a.is_success ? 1 : 0,
            }),
          ),
        );
      } catch {
        // 오프라인이면 IndexedDB 기존값으로 진행
      } finally {
        setBootstrapped(true);
      }
    })();
  }, [teamId]);

  // heartbeat 폴링
  useEffect(() => {
    if (!teamId) return;
    let stopped = false;
    const beat = async () => {
      try {
        const res = await apiFetch<HeartbeatResponse>(
          `/api/teams/${teamId}/heartbeat`,
          { method: "POST" },
        );
        if (stopped) return;
        setStatus(res.round_status);
        setStartedAtMs(res.started_at_ms);
        setTimeLimitSeconds(res.time_limit_seconds);
      } catch (e) {
        if (e instanceof ApiClientError && e.status === 401) {
          clearSession();
          navigate("/team/login", { replace: true });
        }
      }
    };
    beat();
    const id = window.setInterval(beat, HEARTBEAT_INTERVAL_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [teamId, navigate]);

  const onLogout = () => {
    clearSession();
    navigate("/team/login", { replace: true });
  };

  if (!user || user.role !== "team") {
    navigate("/team/login", { replace: true });
    return null;
  }
  if (!bootstrapped || !status) {
    return <FullscreenMessage text="불러오는 중…" />;
  }
  if (status === RoundStatus.Preparing) {
    return <Waiting teamName={user.display_name} onLogout={onLogout} />;
  }
  if (status === RoundStatus.Active) {
    return (
      <Measure
        teamId={user.id}
        teamName={user.display_name}
        startedAtMs={startedAtMs}
        timeLimitSeconds={timeLimitSeconds}
        onLogout={onLogout}
      />
    );
  }
  return <Ended teamName={user.display_name} onLogout={onLogout} />;
}

function FullscreenMessage({ text }: { text: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <p className="text-sm text-slate-600">{text}</p>
    </div>
  );
}
