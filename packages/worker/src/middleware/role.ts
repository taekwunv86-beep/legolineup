import type { MiddlewareHandler } from "hono";
import { ErrorCode } from "@desco/shared";
import { apiError } from "./error.js";
import type { AppBindings } from "../env.js";

type AllowedRole = "admin" | "ft" | "team";

export const requireRole = (...roles: AllowedRole[]): MiddlewareHandler<AppBindings> => {
  return async (c, next) => {
    const auth = c.get("auth");
    if (!auth) return apiError(c, ErrorCode.AuthRequired, "로그인이 필요합니다.");
    if (!roles.includes(auth.role)) {
      return apiError(c, ErrorCode.PermissionDenied, "권한이 없습니다.");
    }
    await next();
  };
};
