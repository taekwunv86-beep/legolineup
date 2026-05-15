import { Hono } from "hono";
import { eq, desc, sql, count } from "drizzle-orm";
import {
  ErrorCode,
  RoundStatus,
  createRoundBodySchema,
  updateRoundBodySchema,
  type Round,
  type RoundSummary,
} from "@desco/shared";
import { getDb } from "../db/client.js";
import { rounds, teams, attempts } from "../db/schema.js";
import { apiError } from "../middleware/error.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/role.js";
import { generateShareToken } from "../lib/share-token.js";
import { ensureRoundFresh } from "../lib/lazy-end.js";
import type { AppBindings } from "../env.js";

export const roundRoutes = new Hono<AppBindings>();

roundRoutes.use("*", requireAuth);

const toRound = (r: typeof rounds.$inferSelect): Round => ({
  id: r.id,
  name: r.name,
  time_limit_seconds: r.time_limit_seconds,
  status: r.status,
  share_token: r.share_token,
  started_at_ms: r.started_at_ms,
  ended_at_ms: r.ended_at_ms,
  created_by: r.created_by,
  created_at: r.created_at,
});

// GET /api/rounds?status=active
roundRoutes.get("/", requireRole("admin", "ft"), async (c) => {
  const db = getDb(c.env);
  const status = c.req.query("status");
  const allowed = Object.values(RoundStatus) as string[];
  const list = await db
    .select()
    .from(rounds)
    .where(status && allowed.includes(status) ? eq(rounds.status, status as never) : undefined)
    .orderBy(desc(rounds.created_at))
    .all();
  return c.json<Round[]>(list.map(toRound));
});

// POST /api/rounds  { name, time_limit_seconds? }
roundRoutes.post("/", requireRole("admin"), async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = createRoundBodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(c, ErrorCode.ValidationFailed, "입력값이 올바르지 않습니다.", parsed.error.flatten());
  }
  const auth = c.get("auth")!;
  const db = getDb(c.env);
  const inserted = await db
    .insert(rounds)
    .values({
      name: parsed.data.name,
      time_limit_seconds: parsed.data.time_limit_seconds ?? 900,
      share_token: generateShareToken(),
      created_by: auth.user_id,
    })
    .returning()
    .get();
  return c.json<Round>(toRound(inserted), 201);
});

// GET /api/rounds/:id  (요약 포함)
roundRoutes.get("/:id", requireRole("admin", "ft"), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) {
    return apiError(c, ErrorCode.ValidationFailed, "잘못된 차수 ID 입니다.");
  }
  const db = getDb(c.env);
  await ensureRoundFresh(db, id);
  const r = await db.select().from(rounds).where(eq(rounds.id, id)).get();
  if (!r) return apiError(c, ErrorCode.NotFound, "차수를 찾을 수 없습니다.");

  const teamCount = await db
    .select({ n: count() })
    .from(teams)
    .where(eq(teams.round_id, id))
    .get();

  const attemptStats = await db
    .select({
      total: count(),
      successes: sql<number>`COALESCE(SUM(${attempts.is_success}), 0)`,
    })
    .from(attempts)
    .innerJoin(teams, eq(attempts.team_id, teams.id))
    .where(eq(teams.round_id, id))
    .get();

  const summary: RoundSummary = {
    ...toRound(r),
    team_count: teamCount?.n ?? 0,
    total_attempts: attemptStats?.total ?? 0,
    total_successes: Number(attemptStats?.successes ?? 0),
  };
  return c.json(summary);
});

// PUT /api/rounds/:id  (preparing 상태에서만)
roundRoutes.put("/:id", requireRole("admin"), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) {
    return apiError(c, ErrorCode.ValidationFailed, "잘못된 차수 ID 입니다.");
  }
  const raw = await c.req.json().catch(() => null);
  const parsed = updateRoundBodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(c, ErrorCode.ValidationFailed, "입력값이 올바르지 않습니다.", parsed.error.flatten());
  }
  const db = getDb(c.env);
  const current = await db.select().from(rounds).where(eq(rounds.id, id)).get();
  if (!current) return apiError(c, ErrorCode.NotFound, "차수를 찾을 수 없습니다.");
  if (current.status !== "preparing") {
    return apiError(c, ErrorCode.RoundNotPreparing, "준비 단계의 차수만 수정할 수 있습니다.");
  }
  const updated = await db
    .update(rounds)
    .set({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.time_limit_seconds !== undefined
        ? { time_limit_seconds: parsed.data.time_limit_seconds }
        : {}),
    })
    .where(eq(rounds.id, id))
    .returning()
    .get();
  return c.json<Round>(toRound(updated));
});

// DELETE /api/rounds/:id  (preparing 또는 시도없는 ended만)
roundRoutes.delete("/:id", requireRole("admin"), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) {
    return apiError(c, ErrorCode.ValidationFailed, "잘못된 차수 ID 입니다.");
  }
  const db = getDb(c.env);
  const r = await db.select().from(rounds).where(eq(rounds.id, id)).get();
  if (!r) return apiError(c, ErrorCode.NotFound, "차수를 찾을 수 없습니다.");

  const attemptCount = await db
    .select({ n: count() })
    .from(attempts)
    .innerJoin(teams, eq(attempts.team_id, teams.id))
    .where(eq(teams.round_id, id))
    .get();

  if (r.status === "active") {
    return apiError(c, ErrorCode.ValidationFailed, "진행 중인 차수는 삭제할 수 없습니다.");
  }
  if (r.status === "ended" && (attemptCount?.n ?? 0) > 0) {
    return apiError(c, ErrorCode.ValidationFailed, "시도 기록이 있는 차수는 삭제할 수 없습니다.");
  }

  // 종속 삭제: ft_notes → attempts → teams → rounds
  await db.run(sql`DELETE FROM ft_notes WHERE team_id IN (SELECT id FROM teams WHERE round_id = ${id})`);
  await db.run(sql`DELETE FROM attempts WHERE team_id IN (SELECT id FROM teams WHERE round_id = ${id})`);
  await db.run(sql`DELETE FROM teams WHERE round_id = ${id}`);
  await db.delete(rounds).where(eq(rounds.id, id)).run();
  return c.json({ ok: true });
});
