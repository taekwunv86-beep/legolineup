import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import {
  ErrorCode,
  createUserBodySchema,
  updateUserBodySchema,
  type User,
} from "@desco/shared";
import { getDb } from "../db/client.js";
import { users } from "../db/schema.js";
import { apiError } from "../middleware/error.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/role.js";
import { hashPassword } from "../lib/password.js";
import type { AppBindings } from "../env.js";

export const userRoutes = new Hono<AppBindings>();

userRoutes.use("*", requireAuth, requireRole("admin"));

const toUser = (u: typeof users.$inferSelect): User => ({
  id: u.id,
  username: u.username,
  role: u.role,
  display_name: u.display_name,
  is_active: u.is_active === 1,
  created_at: u.created_at,
});

userRoutes.get("/", async (c) => {
  const db = getDb(c.env);
  const list = await db.select().from(users).orderBy(desc(users.created_at)).all();
  return c.json<User[]>(list.map(toUser));
});

userRoutes.post("/", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = createUserBodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(c, ErrorCode.ValidationFailed, "입력값이 올바르지 않습니다.", parsed.error.flatten());
  }
  const db = getDb(c.env);
  try {
    const inserted = await db
      .insert(users)
      .values({
        username: parsed.data.username,
        password_hash: await hashPassword(parsed.data.password),
        role: parsed.data.role,
        display_name: parsed.data.display_name,
      })
      .returning()
      .get();
    return c.json<User>(toUser(inserted), 201);
  } catch (e) {
    if (String(e).includes("UNIQUE")) {
      return apiError(c, ErrorCode.DuplicateResource, "이미 사용 중인 아이디입니다.");
    }
    throw e;
  }
});

userRoutes.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) {
    return apiError(c, ErrorCode.ValidationFailed, "잘못된 사용자 ID 입니다.");
  }
  const raw = await c.req.json().catch(() => null);
  const parsed = updateUserBodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(c, ErrorCode.ValidationFailed, "입력값이 올바르지 않습니다.", parsed.error.flatten());
  }
  const db = getDb(c.env);
  const existing = await db.select().from(users).where(eq(users.id, id)).get();
  if (!existing) return apiError(c, ErrorCode.NotFound, "계정을 찾을 수 없습니다.");

  const patch: Partial<typeof users.$inferInsert> = {};
  if (parsed.data.display_name !== undefined) patch.display_name = parsed.data.display_name;
  if (parsed.data.password !== undefined) patch.password_hash = await hashPassword(parsed.data.password);
  if (parsed.data.is_active !== undefined) patch.is_active = parsed.data.is_active ? 1 : 0;

  const updated = await db.update(users).set(patch).where(eq(users.id, id)).returning().get();
  return c.json<User>(toUser(updated));
});

// soft delete = is_active 0
userRoutes.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) {
    return apiError(c, ErrorCode.ValidationFailed, "잘못된 사용자 ID 입니다.");
  }
  const auth = c.get("auth")!;
  if (auth.user_id === id) {
    return apiError(c, ErrorCode.ValidationFailed, "본인 계정은 비활성화할 수 없습니다.");
  }
  const db = getDb(c.env);
  const existing = await db.select().from(users).where(eq(users.id, id)).get();
  if (!existing) return apiError(c, ErrorCode.NotFound, "계정을 찾을 수 없습니다.");
  const updated = await db
    .update(users)
    .set({ is_active: 0 })
    .where(eq(users.id, id))
    .returning()
    .get();
  return c.json<User>(toUser(updated));
});
