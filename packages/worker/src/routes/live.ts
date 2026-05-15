// 라이브 운영 관련 라우트 (SPEC 5절).
// /api/rounds/:id/{start,end,live} 와 /api/teams/:id/heartbeat.

import { Hono } from "hono";
import { eq, and, sql, count, isNull, asc } from "drizzle-orm";
import {
  ErrorCode,
  type LiveResponse,
  type StartRoundResponse,
  type HeartbeatResponse,
  type LiveTeamCard,
  HEARTBEAT_OFFLINE_THRESHOLD_MS,
  TeamLiveStatus,
  RoundStatus,
} from "@desco/shared";
import { getDb } from "../db/client.js";
import { rounds, teams, attempts } from "../db/schema.js";
import { apiError } from "../middleware/error.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/role.js";
import { ensureRoundFresh } from "../lib/lazy-end.js";
import type { AppBindings } from "../env.js";

export const liveRoutes = new Hono<AppBindings>();
liveRoutes.use("*", requireAuth);

// POST /api/rounds/:id/start  — 동기화 시작
liveRoutes.post("/:id/start", requireRole("admin"), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) {
    return apiError(c, ErrorCode.ValidationFailed, "잘못된 차수 ID 입니다.");
  }
  const db = getDb(c.env);
  const round = await db.select().from(rounds).where(eq(rounds.id, id)).get();
  if (!round) return apiError(c, ErrorCode.NotFound, "차수를 찾을 수 없습니다.");
  if (round.status !== "preparing") {
    return apiError(c, ErrorCode.RoundNotPreparing, "준비 단계의 차수만 시작할 수 있습니다.");
  }

  const teamRows = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.round_id, id))
    .all();
  if (teamRows.length === 0) {
    return apiError(c, ErrorCode.ValidationFailed, "차수에 팀이 한 명도 없습니다.");
  }

  const T0 = Date.now();
  // D1 batch (트랜잭션). UPDATE 영향행 검사를 위해 별도 select + race-aware
  // (실제 race는 동일 차수에 두 관리자가 동시 시작 클릭하는 극히 드문 케이스)
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE rounds SET status='active', started_at_ms=?1 WHERE id=?2 AND status='preparing'`,
    ).bind(T0, id),
    c.env.DB.prepare(
      `INSERT INTO attempts (team_id, attempt_no, client_uuid, started_at_ms)
       SELECT id, 1, lower(hex(randomblob(16))), ?1 FROM teams WHERE round_id=?2`,
    ).bind(T0, id),
  ]);

  return c.json<StartRoundResponse>({
    started_at_ms: T0,
    attempts_created: teamRows.length,
  });
});

// POST /api/rounds/:id/end  — 수동 종료
liveRoutes.post("/:id/end", requireRole("admin"), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) {
    return apiError(c, ErrorCode.ValidationFailed, "잘못된 차수 ID 입니다.");
  }
  const db = getDb(c.env);
  // lazy-end 가 시간 만료된 경우 이미 ended 로 바꿔둠
  const fresh = await ensureRoundFresh(db, id);
  if (!fresh) return apiError(c, ErrorCode.NotFound, "차수를 찾을 수 없습니다.");
  if (fresh.status === "ended") {
    return c.json({ ok: true, already_ended: true });
  }
  if (fresh.status !== "active") {
    return apiError(c, ErrorCode.RoundNotActive, "진행 중인 차수만 종료할 수 있습니다.");
  }
  const endedAtMs = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE rounds SET status='ended', ended_at_ms=?1 WHERE id=?2 AND status='active'`,
    ).bind(endedAtMs, id),
    c.env.DB.prepare(
      `UPDATE attempts
       SET stopped_at_ms=?1,
           duration_ms = ?1 - started_at_ms,
           user_notes = CASE
             WHEN user_notes IS NULL OR user_notes='' THEN '[자동 종료]'
             ELSE user_notes || ' [자동 종료]'
           END
       WHERE stopped_at_ms IS NULL
         AND team_id IN (SELECT id FROM teams WHERE round_id=?2)`,
    ).bind(endedAtMs, id),
  ]);
  return c.json({ ok: true });
});

// GET /api/rounds/:id/live  — 실시간 데이터
liveRoutes.get("/:id/live", requireRole("admin", "ft"), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) {
    return apiError(c, ErrorCode.ValidationFailed, "잘못된 차수 ID 입니다.");
  }
  const db = getDb(c.env);
  await ensureRoundFresh(db, id);
  const r = await db.select().from(rounds).where(eq(rounds.id, id)).get();
  if (!r) return apiError(c, ErrorCode.NotFound, "차수를 찾을 수 없습니다.");

  // 팀별 집계
  const teamRows = await db
    .select({
      id: teams.id,
      name: teams.name,
      last_heartbeat_at: teams.last_heartbeat_at,
    })
    .from(teams)
    .where(eq(teams.round_id, id))
    .orderBy(asc(teams.id))
    .all();

  const aggs = await db
    .select({
      team_id: attempts.team_id,
      attempt_count: count(attempts.id),
      success_count: sql<number>`COALESCE(SUM(${attempts.is_success}), 0)`,
      best_duration_ms: sql<number | null>`MIN(CASE WHEN ${attempts.is_success}=1 THEN ${attempts.duration_ms} END)`,
      max_attempt_no: sql<number | null>`MAX(${attempts.attempt_no})`,
      last_activity_at_sec: sql<number | null>`MAX(${attempts.created_at})`,
    })
    .from(attempts)
    .innerJoin(teams, eq(attempts.team_id, teams.id))
    .where(eq(teams.round_id, id))
    .groupBy(attempts.team_id)
    .all();
  const aggByTeam = new Map(aggs.map((a) => [a.team_id, a]));

  // 진행 중 attempt 보유 팀
  const measuringRows = await db
    .select({ team_id: attempts.team_id })
    .from(attempts)
    .innerJoin(teams, eq(attempts.team_id, teams.id))
    .where(and(eq(teams.round_id, id), isNull(attempts.stopped_at_ms)))
    .all();
  const measuringSet = new Set(measuringRows.map((m) => m.team_id));

  const nowMs = Date.now();
  const heartbeatThresholdSec = (nowMs - HEARTBEAT_OFFLINE_THRESHOLD_MS) / 1000;

  let totalAttempts = 0;
  let totalSuccesses = 0;
  const teamCards: LiveTeamCard[] = teamRows.map((t) => {
    const a = aggByTeam.get(t.id);
    const attemptCount = a?.attempt_count ?? 0;
    const successCount = Number(a?.success_count ?? 0);
    totalAttempts += attemptCount;
    totalSuccesses += successCount;
    const isOffline =
      t.last_heartbeat_at != null && t.last_heartbeat_at < heartbeatThresholdSec;
    const hasNoHeartbeatYet = t.last_heartbeat_at == null;
    let status: LiveTeamCard["status"];
    if (measuringSet.has(t.id)) status = TeamLiveStatus.Measuring;
    else if (attemptCount === 0) status = TeamLiveStatus.NotStarted;
    else if (isOffline || hasNoHeartbeatYet) status = TeamLiveStatus.Offline;
    else status = TeamLiveStatus.Waiting;

    return {
      id: t.id,
      name: t.name,
      status,
      attempt_count: attemptCount,
      success_count: successCount,
      best_duration_ms: a?.best_duration_ms ?? null,
      current_attempt_no: measuringSet.has(t.id) ? a?.max_attempt_no ?? null : null,
      last_activity_at_ms: a?.last_activity_at_sec != null ? a.last_activity_at_sec * 1000 : null,
    };
  });

  const timeRemainingMs =
    r.status === RoundStatus.Active && r.started_at_ms != null
      ? Math.max(0, r.started_at_ms + r.time_limit_seconds * 1000 - nowMs)
      : null;

  const response: LiveResponse = {
    round: {
      id: r.id,
      name: r.name,
      status: r.status,
      access_code: r.access_code,
      started_at_ms: r.started_at_ms,
      time_limit_seconds: r.time_limit_seconds,
      time_remaining_ms: timeRemainingMs,
    },
    summary: {
      total_teams: teamRows.length,
      measuring_teams: measuringSet.size,
      total_attempts: totalAttempts,
      total_successes: totalSuccesses,
    },
    teams: teamCards,
  };
  return c.json(response);
});

// POST /api/teams/:id/heartbeat
export const teamHeartbeatRoutes = new Hono<AppBindings>();
teamHeartbeatRoutes.use("*", requireAuth);

teamHeartbeatRoutes.post("/:id/heartbeat", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) {
    return apiError(c, ErrorCode.ValidationFailed, "잘못된 팀 ID 입니다.");
  }
  const auth = c.get("auth")!;
  const db = getDb(c.env);
  const t = await db.select().from(teams).where(eq(teams.id, id)).get();
  if (!t) return apiError(c, ErrorCode.NotFound, "팀을 찾을 수 없습니다.");
  if (auth.role === "team" && auth.user_id !== t.id) {
    return apiError(c, ErrorCode.PermissionDenied, "권한이 없습니다.");
  }
  const nowSec = Math.floor(Date.now() / 1000);
  await db.update(teams).set({ last_heartbeat_at: nowSec }).where(eq(teams.id, id)).run();
  const fresh = await ensureRoundFresh(db, t.round_id);
  if (!fresh) return apiError(c, ErrorCode.NotFound, "차수를 찾을 수 없습니다.");
  const timeRemainingMs =
    fresh.status === RoundStatus.Active && fresh.started_at_ms != null
      ? Math.max(0, fresh.started_at_ms + fresh.time_limit_seconds * 1000 - Date.now())
      : null;
  return c.json<HeartbeatResponse>({
    round_status: fresh.status,
    started_at_ms: fresh.started_at_ms,
    time_limit_seconds: fresh.time_limit_seconds,
    time_remaining_ms: timeRemainingMs,
  });
});
