import { z } from "zod";
import { COLOR_CODES } from "./constants.js";

export const loginBodySchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

// 팀 로그인: 1단계 — 차수 코드로 차수 + 팀 목록 조회
export const teamByCodeBodySchema = z.object({
  code: z
    .string()
    .min(6)
    .max(8)
    .transform((s) => s.replace(/[^A-Z0-9]/gi, "").toUpperCase()),
});
export type TeamByCodeBody = z.infer<typeof teamByCodeBodySchema>;

// 팀 로그인: 2단계 — 코드 + team_id 로 JWT 발급
export const teamLoginBodySchema = z.object({
  code: z
    .string()
    .min(6)
    .max(8)
    .transform((s) => s.replace(/[^A-Z0-9]/gi, "").toUpperCase()),
  team_id: z.number().int().positive(),
});
export type TeamLoginBody = z.infer<typeof teamLoginBodySchema>;

export const createUserBodySchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(4).max(128),
  role: z.enum(["admin", "ft"]),
  display_name: z.string().min(1).max(64),
});
export type CreateUserBody = z.infer<typeof createUserBodySchema>;

export const updateUserBodySchema = z.object({
  display_name: z.string().min(1).max(64).optional(),
  password: z.string().min(4).max(128).optional(),
  is_active: z.boolean().optional(),
});
export type UpdateUserBody = z.infer<typeof updateUserBodySchema>;

export const createRoundBodySchema = z.object({
  name: z.string().min(1).max(128),
  time_limit_seconds: z.number().int().min(60).max(7200).optional(),
});
export type CreateRoundBody = z.infer<typeof createRoundBodySchema>;

export const updateRoundBodySchema = z.object({
  name: z.string().min(1).max(128).optional(),
  time_limit_seconds: z.number().int().min(60).max(7200).optional(),
});
export type UpdateRoundBody = z.infer<typeof updateRoundBodySchema>;

export const createTeamBodySchema = z.object({
  name: z.string().min(1).max(64),
  username: z.string().min(1).max(64).optional(),
});
export type CreateTeamBody = z.infer<typeof createTeamBodySchema>;

export const bulkCreateTeamsBodySchema = z.object({
  count: z.number().int().min(1).max(50),
  name_prefix: z.string().max(32).optional(),
  username_prefix: z.string().max(32).optional(),
});
export type BulkCreateTeamsBody = z.infer<typeof bulkCreateTeamsBodySchema>;

export const updateTeamBodySchema = z.object({
  name: z.string().min(1).max(64).optional(),
});
export type UpdateTeamBody = z.infer<typeof updateTeamBodySchema>;

const colorCodeSchema = z.enum(COLOR_CODES as unknown as [string, ...string[]]);

export const createAttemptBodySchema = z.object({
  client_uuid: z.string().uuid(),
  team_id: z.number().int().positive(),
  attempt_no: z.number().int().min(1),
  started_at_ms: z.number().int().positive(),
});
export type CreateAttemptBody = z.infer<typeof createAttemptBodySchema>;

export const updateAttemptBodySchema = z.object({
  stopped_at_ms: z.number().int().positive().optional(),
  duration_ms: z.number().int().min(0).optional(),
  assembly_order_1: colorCodeSchema.optional(),
  assembly_order_2: colorCodeSchema.optional(),
  assembly_order_3: colorCodeSchema.optional(),
  assembly_order_4: colorCodeSchema.optional(),
  assembly_order_5: colorCodeSchema.optional(),
  turn_t: z.number().int().min(0).optional(),
  turn_extra: z.number().int().min(0).optional(),
  user_notes: z.string().max(1000).optional(),
});
export type UpdateAttemptBody = z.infer<typeof updateAttemptBodySchema>;

export const noteBodySchema = z.object({
  content: z.string().min(1).max(2000),
});
export type NoteBody = z.infer<typeof noteBodySchema>;
