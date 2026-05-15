import { Hono } from "hono";
import { eq } from "drizzle-orm";
import {
  ErrorCode,
  RoundStatus,
  createAttemptBodySchema,
  updateAttemptBodySchema,
  type Attempt,
} from "@desco/shared";
import { getDb } from "../db/client.js";
import { attempts, teams } from "../db/schema.js";
import { apiError } from "../middleware/error.js";
import { requireAuth } from "../middleware/auth.js";
import { ensureRoundFresh } from "../lib/lazy-end.js";
import type { AppBindings } from "../env.js";

export const attemptRoutes = new Hono<AppBindings>();
attemptRoutes.use("*", requireAuth);

const toAttempt = (a: typeof attempts.$inferSelect): Attempt => ({
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
});

// POST /api/attempts  — 멱등 (client_uuid 기준)
attemptRoutes.post("/", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = createAttemptBodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(c, ErrorCode.ValidationFailed, "입력값이 올바르지 않습니다.", parsed.error.flatten());
  }
  const auth = c.get("auth")!;
  if (auth.role === "team" && auth.user_id !== parsed.data.team_id) {
    return apiError(c, ErrorCode.PermissionDenied, "권한이 없습니다.");
  }
  const db = getDb(c.env);

  // 멱등 체크
  const existing = await db
    .select()
    .from(attempts)
    .where(eq(attempts.client_uuid, parsed.data.client_uuid))
    .get();
  if (existing) return c.json<Attempt>(toAttempt(existing));

  const team = await db.select().from(teams).where(eq(teams.id, parsed.data.team_id)).get();
  if (!team) return apiError(c, ErrorCode.NotFound, "팀을 찾을 수 없습니다.");

  const fresh = await ensureRoundFresh(db, team.round_id);
  if (!fresh) return apiError(c, ErrorCode.NotFound, "차수를 찾을 수 없습니다.");
  if (fresh.status !== RoundStatus.Active) {
    return apiError(c, ErrorCode.RoundNotActive, "진행 중인 차수가 아닙니다.");
  }
  const expiresAt = (fresh.started_at_ms ?? 0) + fresh.time_limit_seconds * 1000;
  if (Date.now() >= expiresAt) {
    return apiError(c, ErrorCode.RoundTimeExpired, "차수 시간이 만료되었습니다.");
  }

  const inserted = await db
    .insert(attempts)
    .values({
      team_id: parsed.data.team_id,
      attempt_no: parsed.data.attempt_no,
      client_uuid: parsed.data.client_uuid,
      started_at_ms: parsed.data.started_at_ms,
    })
    .returning()
    .get();
  return c.json<Attempt>(toAttempt(inserted), 201);
});

// PUT /api/attempts/by-uuid/:uuid  — 정지 + 입력 데이터
attemptRoutes.put("/by-uuid/:uuid", async (c) => {
  const uuid = c.req.param("uuid");
  if (!uuid) return apiError(c, ErrorCode.ValidationFailed, "client_uuid 가 필요합니다.");
  const raw = await c.req.json().catch(() => null);
  const parsed = updateAttemptBodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(c, ErrorCode.ValidationFailed, "입력값이 올바르지 않습니다.", parsed.error.flatten());
  }
  const db = getDb(c.env);
  const existing = await db
    .select()
    .from(attempts)
    .where(eq(attempts.client_uuid, uuid))
    .get();
  if (!existing) return apiError(c, ErrorCode.NotFound, "시도를 찾을 수 없습니다.");

  const auth = c.get("auth")!;
  const team = await db.select().from(teams).where(eq(teams.id, existing.team_id)).get();
  if (!team) return apiError(c, ErrorCode.NotFound, "팀을 찾을 수 없습니다.");
  if (auth.role === "team" && auth.user_id !== team.id) {
    return apiError(c, ErrorCode.PermissionDenied, "권한이 없습니다.");
  }

  // 차수 만료 후 PUT 도 허용 (오프라인 큐 복구 케이스). 단 ended 상태에선 자동 종료 보정값을 덮어쓰지 않도록 stopped_at_ms 는 기존 우선.
  const fresh = await ensureRoundFresh(db, team.round_id);
  if (!fresh) return apiError(c, ErrorCode.NotFound, "차수를 찾을 수 없습니다.");

  const patch: Partial<typeof attempts.$inferInsert> = {};
  if (parsed.data.stopped_at_ms !== undefined) {
    if (existing.stopped_at_ms == null) {
      patch.stopped_at_ms = parsed.data.stopped_at_ms;
      patch.duration_ms =
        parsed.data.duration_ms ?? parsed.data.stopped_at_ms - existing.started_at_ms;
    }
    // 이미 stopped 인 경우(자동 종료 등) 무시
  }
  if (parsed.data.duration_ms !== undefined && patch.duration_ms === undefined) {
    patch.duration_ms = parsed.data.duration_ms;
  }
  for (const k of [
    "assembly_order_1",
    "assembly_order_2",
    "assembly_order_3",
    "assembly_order_4",
    "assembly_order_5",
  ] as const) {
    if (parsed.data[k] !== undefined) patch[k] = parsed.data[k];
  }
  if (parsed.data.turn_t !== undefined) patch.turn_t = parsed.data.turn_t;
  if (parsed.data.turn_extra !== undefined) patch.turn_extra = parsed.data.turn_extra;
  if (parsed.data.user_notes !== undefined) patch.user_notes = parsed.data.user_notes;

  if (Object.keys(patch).length === 0) {
    return c.json<Attempt>(toAttempt(existing));
  }

  const updated = await db
    .update(attempts)
    .set(patch)
    .where(eq(attempts.client_uuid, uuid))
    .returning()
    .get();
  return c.json<Attempt>(toAttempt(updated));
});
