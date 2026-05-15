import { Hono } from "hono";
import { eq, count, desc, asc } from "drizzle-orm";
import {
  ErrorCode,
  createTeamBodySchema,
  bulkCreateTeamsBodySchema,
  updateTeamBodySchema,
  type Team,
  type TeamWithPasswordHint,
  type Attempt,
} from "@desco/shared";
import { getDb } from "../db/client.js";
import { rounds, teams, attempts, ft_notes } from "../db/schema.js";
import { apiError } from "../middleware/error.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/role.js";
import { hashPassword } from "../lib/password.js";
import type { AppBindings } from "../env.js";

const toTeam = (t: typeof teams.$inferSelect): Team => ({
  id: t.id,
  round_id: t.round_id,
  name: t.name,
  username: t.username,
  last_heartbeat_at: t.last_heartbeat_at,
  created_at: t.created_at,
});

const interpolate = (pattern: string | undefined, fallback: string, i: number): string => {
  const p = pattern ?? fallback;
  return p.includes("{i}") ? p.replace(/\{i\}/g, String(i)) : `${p}${i}`;
};

// ---- /api/rounds/:round_id/teams ----
export const roundTeamRoutes = new Hono<AppBindings>();
roundTeamRoutes.use("*", requireAuth);

// GET 목록 (관리자/FT/팀: 단, 팀은 자기 차수만)
roundTeamRoutes.get("/", async (c) => {
  const round_id = Number(c.req.param("round_id"));
  if (!Number.isFinite(round_id)) {
    return apiError(c, ErrorCode.ValidationFailed, "잘못된 차수 ID 입니다.");
  }
  const auth = c.get("auth")!;
  if (auth.role === "team" && auth.round_id !== round_id) {
    return apiError(c, ErrorCode.PermissionDenied, "권한이 없습니다.");
  }
  const db = getDb(c.env);
  const list = await db
    .select()
    .from(teams)
    .where(eq(teams.round_id, round_id))
    .orderBy(desc(teams.id))
    .all();
  return c.json<Team[]>(list.map(toTeam));
});

// POST 개별 생성 (관리자, preparing만)
roundTeamRoutes.post("/", requireRole("admin"), async (c) => {
  const round_id = Number(c.req.param("round_id"));
  if (!Number.isFinite(round_id)) {
    return apiError(c, ErrorCode.ValidationFailed, "잘못된 차수 ID 입니다.");
  }
  const raw = await c.req.json().catch(() => null);
  const parsed = createTeamBodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(c, ErrorCode.ValidationFailed, "입력값이 올바르지 않습니다.", parsed.error.flatten());
  }
  const db = getDb(c.env);
  const round = await db.select().from(rounds).where(eq(rounds.id, round_id)).get();
  if (!round) return apiError(c, ErrorCode.NotFound, "차수를 찾을 수 없습니다.");
  if (round.status !== "preparing") {
    return apiError(c, ErrorCode.RoundNotPreparing, "준비 단계의 차수에만 팀을 추가할 수 있습니다.");
  }
  // username 은 더 이상 입력으로 받지 않음 (코드 기반 로그인). 자동 생성.
  const username = parsed.data.username ?? `t${round_id}_${crypto.randomUUID().slice(0, 6)}`;
  // password_hash 컬럼은 NOT NULL 이라 dummy 해시 저장. 실제로는 사용 안 됨.
  const dummyHash = await hashPassword(crypto.randomUUID());
  try {
    const inserted = await db
      .insert(teams)
      .values({
        round_id,
        name: parsed.data.name,
        username,
        password_hash: dummyHash,
      })
      .returning()
      .get();
    return c.json<Team>(toTeam(inserted), 201);
  } catch (e) {
    if (String(e).includes("UNIQUE")) {
      return apiError(c, ErrorCode.DuplicateResource, "동일 차수에 같은 아이디의 팀이 이미 있습니다.");
    }
    throw e;
  }
});

// POST 일괄 생성 (관리자, preparing만)
roundTeamRoutes.post("/bulk", requireRole("admin"), async (c) => {
  const round_id = Number(c.req.param("round_id"));
  if (!Number.isFinite(round_id)) {
    return apiError(c, ErrorCode.ValidationFailed, "잘못된 차수 ID 입니다.");
  }
  const raw = await c.req.json().catch(() => null);
  const parsed = bulkCreateTeamsBodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(c, ErrorCode.ValidationFailed, "입력값이 올바르지 않습니다.", parsed.error.flatten());
  }
  const db = getDb(c.env);
  const round = await db.select().from(rounds).where(eq(rounds.id, round_id)).get();
  if (!round) return apiError(c, ErrorCode.NotFound, "차수를 찾을 수 없습니다.");
  if (round.status !== "preparing") {
    return apiError(c, ErrorCode.RoundNotPreparing, "준비 단계의 차수에만 팀을 추가할 수 있습니다.");
  }
  const existing = await db
    .select({ username: teams.username })
    .from(teams)
    .where(eq(teams.round_id, round_id))
    .all();
  const existingNames = new Set(existing.map((e) => e.username));

  const created: TeamWithPasswordHint[] = [];
  for (let i = 1; i <= parsed.data.count; i++) {
    const name = interpolate(parsed.data.name_prefix, "{i}팀", i);
    let username = interpolate(parsed.data.username_prefix, "team{i}", i);
    let bump = 0;
    while (existingNames.has(username)) {
      bump += 1;
      username = `${interpolate(parsed.data.username_prefix, "team{i}", i)}_${bump}`;
    }
    existingNames.add(username);
    const dummyHash = await hashPassword(crypto.randomUUID());
    const inserted = await db
      .insert(teams)
      .values({
        round_id,
        name,
        username,
        password_hash: dummyHash,
      })
      .returning()
      .get();
    created.push(toTeam(inserted));
  }
  return c.json<TeamWithPasswordHint[]>(created, 201);
});

// ---- /api/teams/:id ----
export const teamRoutes = new Hono<AppBindings>();
teamRoutes.use("*", requireAuth);

// GET 단건
teamRoutes.get("/:id", async (c) => {
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
  return c.json<Team>(toTeam(t));
});

// GET /api/teams/:id/attempts
teamRoutes.get("/:id/attempts", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) {
    return apiError(c, ErrorCode.ValidationFailed, "잘못된 팀 ID 입니다.");
  }
  const auth = c.get("auth")!;
  if (auth.role === "team" && auth.user_id !== id) {
    return apiError(c, ErrorCode.PermissionDenied, "권한이 없습니다.");
  }
  const db = getDb(c.env);
  const list = await db
    .select()
    .from(attempts)
    .where(eq(attempts.team_id, id))
    .orderBy(asc(attempts.attempt_no))
    .all();
  const mapped: Attempt[] = list.map((a) => ({
    id: a.id,
    team_id: a.team_id,
    attempt_no: a.attempt_no,
    client_uuid: a.client_uuid,
    started_at_ms: a.started_at_ms,
    stopped_at_ms: a.stopped_at_ms,
    duration_ms: a.duration_ms,
    assembly_order_1: a.assembly_order_1 as Attempt["assembly_order_1"],
    assembly_order_2: a.assembly_order_2 as Attempt["assembly_order_2"],
    assembly_order_3: a.assembly_order_3 as Attempt["assembly_order_3"],
    assembly_order_4: a.assembly_order_4 as Attempt["assembly_order_4"],
    assembly_order_5: a.assembly_order_5 as Attempt["assembly_order_5"],
    turn_t: a.turn_t,
    turn_extra: a.turn_extra,
    is_success: a.is_success === 1,
    success_marked_by: a.success_marked_by,
    success_marked_at_ms: a.success_marked_at_ms,
    user_notes: a.user_notes,
    created_at: a.created_at,
  }));
  return c.json<Attempt[]>(mapped);
});

// PUT 수정 (관리자)
teamRoutes.put("/:id", requireRole("admin"), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) {
    return apiError(c, ErrorCode.ValidationFailed, "잘못된 팀 ID 입니다.");
  }
  const raw = await c.req.json().catch(() => null);
  const parsed = updateTeamBodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(c, ErrorCode.ValidationFailed, "입력값이 올바르지 않습니다.", parsed.error.flatten());
  }
  const db = getDb(c.env);
  const t = await db.select().from(teams).where(eq(teams.id, id)).get();
  if (!t) return apiError(c, ErrorCode.NotFound, "팀을 찾을 수 없습니다.");

  const patch: Partial<typeof teams.$inferInsert> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  const updated = await db.update(teams).set(patch).where(eq(teams.id, id)).returning().get();
  return c.json<Team>(toTeam(updated));
});

// DELETE (관리자, 시도없는 팀만)
teamRoutes.delete("/:id", requireRole("admin"), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) {
    return apiError(c, ErrorCode.ValidationFailed, "잘못된 팀 ID 입니다.");
  }
  const db = getDb(c.env);
  const t = await db.select().from(teams).where(eq(teams.id, id)).get();
  if (!t) return apiError(c, ErrorCode.NotFound, "팀을 찾을 수 없습니다.");

  const attemptCount = await db
    .select({ n: count() })
    .from(attempts)
    .where(eq(attempts.team_id, id))
    .get();
  if ((attemptCount?.n ?? 0) > 0) {
    return apiError(c, ErrorCode.ValidationFailed, "시도 기록이 있는 팀은 삭제할 수 없습니다.");
  }

  // ft_notes 먼저 정리 (FK)
  await db.delete(ft_notes).where(eq(ft_notes.team_id, id)).run();
  await db.delete(teams).where(eq(teams.id, id)).run();
  return c.json({ ok: true });
});
