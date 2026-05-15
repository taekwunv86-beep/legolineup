import type { ApiError } from "@desco/shared";
import { clearSession, getToken } from "./auth.js";

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiError,
  ) {
    super(body.error.message);
  }
}

type RequestInitJson = Omit<RequestInit, "body"> & { body?: unknown };

export const apiFetch = async <T>(path: string, init: RequestInitJson = {}): Promise<T> => {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(path, {
    ...init,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    let body: ApiError;
    try {
      body = (await res.json()) as ApiError;
    } catch {
      body = {
        error: { code: "VALIDATION_FAILED", message: `요청 실패 (HTTP ${res.status})` },
      };
    }
    if (body.error.code === "AUTH_EXPIRED" || body.error.code === "AUTH_INVALID") {
      clearSession();
    }
    throw new ApiClientError(res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
};
