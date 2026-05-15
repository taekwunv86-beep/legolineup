import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import { ErrorCode, noteBodySchema, type Note } from "@desco/shared";
import { getDb } from "../db/client.js";
import { ft_notes, teams, users } from "../db/schema.js";
import { apiError } from "../middleware/error.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/role.js";
import type { AppBindings } from "../env.js";

// ---- /api/teams/:id/notes ----
export const teamNoteRoutes = new Hono<AppBindings>();
teamNoteRoutes.use("*", requireAuth, requireRole("admin", "ft"));

teamNoteRoutes.get("/:id/notes", async (c) => {
  const teamId = Number(c.req.param("id"));
  if (!Number.isFinite(teamId)) {
    return apiError(c, ErrorCode.ValidationFailed, "잘못된 팀 ID 입니다.");
  }
  const db = getDb(c.env);
  const rows = await db
    .select({
      id: ft_notes.id,
      team_id: ft_notes.team_id,
      author_id: ft_notes.author_id,
      author_display_name: users.display_name,
      content: ft_notes.content,
      created_at: ft_notes.created_at,
      updated_at: ft_notes.updated_at,
    })
    .from(ft_notes)
    .innerJoin(users, eq(ft_notes.author_id, users.id))
    .where(eq(ft_notes.team_id, teamId))
    .orderBy(desc(ft_notes.created_at))
    .all();
  return c.json<Note[]>(rows);
});

teamNoteRoutes.post("/:id/notes", async (c) => {
  const teamId = Number(c.req.param("id"));
  if (!Number.isFinite(teamId)) {
    return apiError(c, ErrorCode.ValidationFailed, "잘못된 팀 ID 입니다.");
  }
  const raw = await c.req.json().catch(() => null);
  const parsed = noteBodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(c, ErrorCode.ValidationFailed, "메모 내용이 비어있습니다.");
  }
  const auth = c.get("auth")!;
  const db = getDb(c.env);
  const team = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId)).get();
  if (!team) return apiError(c, ErrorCode.NotFound, "팀을 찾을 수 없습니다.");

  const inserted = await db
    .insert(ft_notes)
    .values({
      team_id: teamId,
      author_id: auth.user_id,
      content: parsed.data.content,
    })
    .returning()
    .get();
  const author = await db
    .select({ display_name: users.display_name })
    .from(users)
    .where(eq(users.id, auth.user_id))
    .get();
  return c.json<Note>({
    ...inserted,
    author_display_name: author?.display_name,
  }, 201);
});

// ---- /api/notes/:id ----
export const noteRoutes = new Hono<AppBindings>();
noteRoutes.use("*", requireAuth, requireRole("admin", "ft"));

noteRoutes.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) {
    return apiError(c, ErrorCode.ValidationFailed, "잘못된 메모 ID 입니다.");
  }
  const raw = await c.req.json().catch(() => null);
  const parsed = noteBodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(c, ErrorCode.ValidationFailed, "메모 내용이 비어있습니다.");
  }
  const auth = c.get("auth")!;
  const db = getDb(c.env);
  const existing = await db.select().from(ft_notes).where(eq(ft_notes.id, id)).get();
  if (!existing) return apiError(c, ErrorCode.NotFound, "메모를 찾을 수 없습니다.");
  if (existing.author_id !== auth.user_id && auth.role !== "admin") {
    return apiError(c, ErrorCode.PermissionDenied, "본인이 작성한 메모만 수정할 수 있습니다.");
  }
  const updated = await db
    .update(ft_notes)
    .set({
      content: parsed.data.content,
      updated_at: Math.floor(Date.now() / 1000),
    })
    .where(eq(ft_notes.id, id))
    .returning()
    .get();
  return c.json<Note>(updated);
});

noteRoutes.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) {
    return apiError(c, ErrorCode.ValidationFailed, "잘못된 메모 ID 입니다.");
  }
  const auth = c.get("auth")!;
  const db = getDb(c.env);
  const existing = await db.select().from(ft_notes).where(eq(ft_notes.id, id)).get();
  if (!existing) return apiError(c, ErrorCode.NotFound, "메모를 찾을 수 없습니다.");
  if (existing.author_id !== auth.user_id && auth.role !== "admin") {
    return apiError(c, ErrorCode.PermissionDenied, "본인이 작성한 메모만 삭제할 수 있습니다.");
  }
  await db.delete(ft_notes).where(eq(ft_notes.id, id)).run();
  return c.json({ ok: true });
});
