import type { MiddlewareHandler } from "hono";
import { ErrorCode } from "@desco/shared";
import { verifyJwt } from "../lib/jwt.js";
import { apiError } from "./error.js";
import type { AppBindings } from "../env.js";

export const requireAuth: MiddlewareHandler<AppBindings> = async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) return apiError(c, ErrorCode.AuthRequired, "로그인이 필요합니다.");
  const payload = await verifyJwt(m[1]!, c.env.JWT_SECRET);
  if (!payload) return apiError(c, ErrorCode.AuthExpired, "세션이 만료되었습니다.");
  c.set("auth", {
    user_id: payload.sub,
    role: payload.role,
    ...(payload.round_id !== undefined ? { round_id: payload.round_id } : {}),
  });
  await next();
};
