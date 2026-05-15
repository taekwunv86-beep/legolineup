export const ErrorCode = {
  AuthRequired: "AUTH_REQUIRED",
  AuthInvalid: "AUTH_INVALID",
  AuthExpired: "AUTH_EXPIRED",
  PermissionDenied: "PERMISSION_DENIED",
  NotFound: "NOT_FOUND",
  ValidationFailed: "VALIDATION_FAILED",
  DuplicateResource: "DUPLICATE_RESOURCE",
  RoundNotPreparing: "ROUND_NOT_PREPARING",
  RoundNotActive: "ROUND_NOT_ACTIVE",
  RoundTimeExpired: "ROUND_TIME_EXPIRED",
  RateLimited: "RATE_LIMITED",
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export type ApiError = {
  error: {
    code: ErrorCodeValue;
    message: string;
    details?: unknown;
  };
};

export const ERROR_HTTP_STATUS: Record<ErrorCodeValue, number> = {
  AUTH_REQUIRED: 401,
  AUTH_INVALID: 401,
  AUTH_EXPIRED: 401,
  PERMISSION_DENIED: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 400,
  DUPLICATE_RESOURCE: 409,
  ROUND_NOT_PREPARING: 409,
  ROUND_NOT_ACTIVE: 409,
  ROUND_TIME_EXPIRED: 410,
  RATE_LIMITED: 429,
};
