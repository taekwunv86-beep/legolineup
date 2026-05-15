// 시간 만료 체크 헬퍼. 모든 쓰기 라우트에서 호출.
// SPEC 5.4 절: 별도 cron 없이, API 호출 시점에 시간 만료 체크하여 active → ended 전환.

import { eq, and, sql } from "drizzle-orm";
import { rounds } from "../db/schema.js";
import type { DbClient } from "../db/client.js";

export type EnsureFreshResult = {
  status: "preparing" | "active" | "ended";
  just_ended: boolean;
  started_at_ms: number | null;
  time_limit_seconds: number;
};

export const ensureRoundFresh = async (
  db: DbClient,
  roundId: number,
): Promise<EnsureFreshResult | null> => {
  const row = await db
    .select({
      status: rounds.status,
      started_at_ms: rounds.started_at_ms,
      time_limit_seconds: rounds.time_limit_seconds,
    })
    .from(rounds)
    .where(eq(rounds.id, roundId))
    .get();
  if (!row) return null;

  const baseResult: EnsureFreshResult = {
    status: row.status,
    just_ended: false,
    started_at_ms: row.started_at_ms,
    time_limit_seconds: row.time_limit_seconds,
  };
  if (row.status !== "active" || row.started_at_ms == null) return baseResult;

  const expiresAt = row.started_at_ms + row.time_limit_seconds * 1000;
  if (Date.now() < expiresAt) return baseResult;

  // 만료 → ended 전환 + 진행 중 attempt 보정
  await db
    .update(rounds)
    .set({ status: "ended", ended_at_ms: expiresAt })
    .where(and(eq(rounds.id, roundId), eq(rounds.status, "active")))
    .run();

  await db.run(sql`
    UPDATE attempts
    SET stopped_at_ms = ${expiresAt},
        duration_ms = ${expiresAt} - started_at_ms,
        user_notes = CASE
          WHEN user_notes IS NULL OR user_notes = '' THEN '[자동 종료]'
          ELSE user_notes || ' [자동 종료]'
        END
    WHERE stopped_at_ms IS NULL
      AND team_id IN (SELECT id FROM teams WHERE round_id = ${roundId})
  `);

  return { ...baseResult, status: "ended", just_ended: true };
};
