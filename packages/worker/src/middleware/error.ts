import type { Context } from "hono";
import { ErrorCode, ERROR_HTTP_STATUS, type ErrorCodeValue } from "@desco/shared";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export class ApiException extends Error {
  constructor(
    public readonly code: ErrorCodeValue,
    public readonly userMessage: string,
    public readonly details?: unknown,
  ) {
    super(userMessage);
  }
}

export const apiError = (
  c: Context,
  code: ErrorCodeValue,
  message: string,
  details?: unknown,
) => {
  const status = ERROR_HTTP_STATUS[code] as ContentfulStatusCode;
  return c.json({ error: { code, message, ...(details ? { details } : {}) } }, status);
};

export const wrapErrors = async (
  c: Context,
  next: () => Promise<void>,
): Promise<Response | void> => {
  try {
    await next();
  } catch (e) {
    if (e instanceof ApiException) {
      return apiError(c, e.code, e.userMessage, e.details);
    }
    console.error("[unhandled]", e);
    return apiError(c, ErrorCode.ValidationFailed, "서버 오류가 발생했습니다.");
  }
};
