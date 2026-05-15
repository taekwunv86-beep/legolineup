import { Hono } from "hono";
import { eq, asc } from "drizzle-orm";
import {
  ErrorCode,
  JWT_TTL_SECONDS,
  Role,
  loginBodySchema,
  teamByCodeBodySchema,
  teamLoginBodySchema,
  type LoginResponse,
  type AuthUser,
  type TeamByCodeResponse,
} from "@desco/shared";
import { getDb } from "../db/client.js";
import { users, teams, rounds } from "../db/schema.js";
import { verifyPassword } from "../lib/password.js";
import { signJwt } from "../lib/jwt.js";
import { apiError } from "../middleware/error.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppBindings } from "../env.js";

export const authRoutes = new Hono<AppBindings>();

// ---- 관리자/FT 로그인 (username + password) ----
authRoutes.post("/login", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = loginBodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(c, ErrorCode.ValidationFailed, "입력값이 올바르지 않습니다.", parsed.error.flatten());
  }
  const { username, password } = parsed.data;
  const db = getDb(c.env);
  const nowSec = Math.floor(Date.now() / 1000);

  const u = await db.select().from(users).where(eq(users.username, username)).get();
  if (!u) return apiError(c, ErrorCode.AuthInvalid, "아이디 또는 비밀번호가 올바르지 않습니다.");
  if (u.is_active === 0) return apiError(c, ErrorCode.AuthInvalid, "비활성화된 계정입니다.");
  if (!(await verifyPassword(password, u.password_hash))) {
    return apiError(c, ErrorCode.AuthInvalid, "아이디 또는 비밀번호가 올바르지 않습니다.");
  }
  const ttl = u.role === "admin" ? JWT_TTL_SECONDS.admin : JWT_TTL_SECONDS.ft;
  const payload = {
    sub: u.id,
    role: u.role as "admin" | "ft",
    display_name: u.display_name,
    iat: nowSec,
    exp: nowSec + ttl,
  };
  const token = await signJwt(payload, c.env.JWT_SECRET);
  const user: AuthUser = {
    id: u.id,
    role: u.role as "admin" | "ft",
    display_name: u.display_name,
  };
  return c.json<LoginResponse>({ token, user });
});

// ---- 팀 로그인 1단계: 차수 코드 → 차수 정보 + 팀 목록 ----
authRoutes.post("/team-by-code", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = teamByCodeBodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(c, ErrorCode.ValidationFailed, "차수 코드 형식이 올바르지 않습니다.");
  }
  const db = getDb(c.env);
  const round = await db
    .select()
    .from(rounds)
    .where(eq(rounds.access_code, parsed.data.code))
    .get();
  if (!round || !round.access_code) {
    return apiError(c, ErrorCode.NotFound, "해당 차수 코드를 찾을 수 없습니다.");
  }
  const teamRows = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.round_id, round.id))
    .orderBy(asc(teams.id))
    .all();
  return c.json<TeamByCodeResponse>({
    round: {
      id: round.id,
      name: round.name,
      status: round.status,
      access_code: round.access_code,
    },
    teams: teamRows,
  });
});

// ---- 팀 로그인 2단계: 코드 + team_id → JWT 발급 ----
authRoutes.post("/team-login", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = teamLoginBodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(c, ErrorCode.ValidationFailed, "입력값이 올바르지 않습니다.", parsed.error.flatten());
  }
  const db = getDb(c.env);
  const round = await db
    .select()
    .from(rounds)
    .where(eq(rounds.access_code, parsed.data.code))
    .get();
  if (!round || !round.access_code) {
    return apiError(c, ErrorCode.NotFound, "차수 코드가 유효하지 않습니다.");
  }
  const team = await db.select().from(teams).where(eq(teams.id, parsed.data.team_id)).get();
  if (!team || team.round_id !== round.id) {
    return apiError(c, ErrorCode.NotFound, "팀을 찾을 수 없습니다.");
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = {
    sub: team.id,
    role: Role.Team,
    round_id: team.round_id,
    display_name: team.name,
    iat: nowSec,
    exp: nowSec + JWT_TTL_SECONDS.team,
  };
  const token = await signJwt(payload, c.env.JWT_SECRET);
  const user: AuthUser = {
    id: team.id,
    role: Role.Team,
    display_name: team.name,
    round_id: team.round_id,
  };
  return c.json<LoginResponse>({ token, user });
});

// ---- 세션 확인 ----
authRoutes.get("/me", requireAuth, async (c) => {
  const auth = c.get("auth")!;
  const db = getDb(c.env);
  if (auth.role === Role.Team) {
    const team = await db.select().from(teams).where(eq(teams.id, auth.user_id)).get();
    if (!team) return apiError(c, ErrorCode.NotFound, "팀을 찾을 수 없습니다.");
    return c.json<{ user: AuthUser }>({
      user: { id: team.id, role: Role.Team, display_name: team.name, round_id: team.round_id },
    });
  }
  const u = await db.select().from(users).where(eq(users.id, auth.user_id)).get();
  if (!u) return apiError(c, ErrorCode.NotFound, "계정을 찾을 수 없습니다.");
  return c.json<{ user: AuthUser }>({
    user: { id: u.id, role: u.role as "admin" | "ft", display_name: u.display_name },
  });
});

authRoutes.post("/logout", (c) => c.json({ ok: true }));
