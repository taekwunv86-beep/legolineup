// 오프라인 큐 동기화 (FIFO + 지수 백오프).
// SPEC 1.3 / 7.4 시나리오 4 참조.

import { db, type SyncJob } from "./db.js";
import { apiFetch, ApiClientError } from "./api.js";
import type { Attempt, CreateAttemptBody, UpdateAttemptBody } from "@desco/shared";

const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;

type SyncStatus = "online" | "syncing" | "offline";

type Listener = (state: { status: SyncStatus; queued: number }) => void;
const listeners = new Set<Listener>();
let currentStatus: SyncStatus = navigator.onLine ? "online" : "offline";
let queuedCount = 0;

const notify = () => {
  for (const fn of listeners) fn({ status: currentStatus, queued: queuedCount });
};

export const subscribeSync = (fn: Listener): (() => void) => {
  listeners.add(fn);
  fn({ status: currentStatus, queued: queuedCount });
  return () => listeners.delete(fn);
};

const refreshQueueCount = async () => {
  queuedCount = await db.syncQueue.count();
  notify();
};

export const enqueueCreateAttempt = async (body: CreateAttemptBody): Promise<void> => {
  await db.syncQueue.add({
    kind: "create_attempt",
    client_uuid: body.client_uuid,
    payload: body,
    attempts: 0,
    next_run_at_ms: Date.now(),
    created_at: Date.now(),
  });
  void refreshQueueCount();
  void tick();
};

export const enqueueUpdateAttempt = async (
  client_uuid: string,
  body: UpdateAttemptBody,
): Promise<void> => {
  // 동일 client_uuid 의 update 가 이미 큐에 있으면 payload merge
  const existing = await db.syncQueue
    .where({ client_uuid })
    .filter((j) => j.kind === "update_attempt")
    .first();
  if (existing) {
    await db.syncQueue.update(existing.id!, {
      payload: { ...(existing.payload as object), ...body },
      attempts: 0,
      last_error: undefined,
      next_run_at_ms: Date.now(),
    });
  } else {
    await db.syncQueue.add({
      kind: "update_attempt",
      client_uuid,
      payload: body,
      attempts: 0,
      next_run_at_ms: Date.now(),
      created_at: Date.now(),
    });
  }
  void refreshQueueCount();
  void tick();
};

let running = false;

export const tick = async (): Promise<void> => {
  if (running) return;
  if (!navigator.onLine) {
    currentStatus = "offline";
    notify();
    return;
  }
  running = true;
  try {
    while (true) {
      const job = await db.syncQueue
        .where("next_run_at_ms")
        .belowOrEqual(Date.now())
        .first();
      if (!job) break;
      currentStatus = "syncing";
      notify();
      try {
        await runJob(job);
        await db.syncQueue.delete(job.id!);
        await refreshQueueCount();
      } catch (e) {
        const isClientError =
          e instanceof ApiClientError && e.status >= 400 && e.status < 500;
        if (isClientError) {
          // 영구 실패: 큐에서 제거
          await db.syncQueue.delete(job.id!);
          await refreshQueueCount();
          console.warn("[sync] permanent failure", job.client_uuid, e);
        } else {
          const attempts = job.attempts + 1;
          const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.min(attempts, 5));
          await db.syncQueue.update(job.id!, {
            attempts,
            last_error: e instanceof Error ? e.message : String(e),
            next_run_at_ms: Date.now() + delay,
          });
          break; // 백오프 대기
        }
      }
    }
  } finally {
    running = false;
    currentStatus = navigator.onLine
      ? queuedCount > 0
        ? "syncing"
        : "online"
      : "offline";
    notify();
  }
};

const runJob = async (job: SyncJob): Promise<void> => {
  if (job.kind === "create_attempt") {
    const result = await apiFetch<Attempt>("/api/attempts", {
      method: "POST",
      body: job.payload,
    });
    await applyServerAttempt(result);
  } else {
    const result = await apiFetch<Attempt>(`/api/attempts/by-uuid/${job.client_uuid}`, {
      method: "PUT",
      body: job.payload,
    });
    await applyServerAttempt(result);
  }
};

const applyServerAttempt = async (a: Attempt) => {
  await db.attempts.put({
    client_uuid: a.client_uuid,
    team_id: a.team_id,
    attempt_no: a.attempt_no,
    started_at_ms: a.started_at_ms,
    stopped_at_ms: a.stopped_at_ms,
    duration_ms: a.duration_ms,
    assembly_order_1: a.assembly_order_1,
    assembly_order_2: a.assembly_order_2,
    assembly_order_3: a.assembly_order_3,
    assembly_order_4: a.assembly_order_4,
    assembly_order_5: a.assembly_order_5,
    turn_t: a.turn_t,
    turn_extra: a.turn_extra,
    user_notes: a.user_notes,
    is_success: a.is_success ? 1 : 0,
  });
};

// 백오프 중인 job 을 깨우는 폴러 (5초마다)
let pollerStarted = false;
const startPoller = () => {
  if (pollerStarted) return;
  pollerStarted = true;
  window.setInterval(() => {
    void tick();
  }, 5_000);
  window.addEventListener("online", () => {
    currentStatus = "online";
    notify();
    void tick();
  });
  window.addEventListener("offline", () => {
    currentStatus = "offline";
    notify();
  });
  void refreshQueueCount();
  void tick();
};

// 모듈 로드 시 한 번
if (typeof window !== "undefined") {
  startPoller();
}
