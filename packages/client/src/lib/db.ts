// IndexedDB (Dexie). attempt 와 sync 큐를 로컬에 저장.

import Dexie, { type Table } from "dexie";
import type { ColorCode } from "@desco/shared";

export type LocalAttempt = {
  client_uuid: string;
  team_id: number;
  attempt_no: number;
  started_at_ms: number;
  stopped_at_ms: number | null;
  duration_ms: number | null;
  assembly_order_1: ColorCode | null;
  assembly_order_2: ColorCode | null;
  assembly_order_3: ColorCode | null;
  assembly_order_4: ColorCode | null;
  assembly_order_5: ColorCode | null;
  turn_t: number | null;
  turn_extra: number | null;
  user_notes: string | null;
  is_success: number; // 서버에서 받아온 success 상태 (0/1). 로컬은 항상 0.
};

export type SyncJob = {
  id?: number;
  kind: "create_attempt" | "update_attempt";
  client_uuid: string;
  payload: unknown;
  attempts: number;
  next_run_at_ms: number;
  last_error?: string;
  created_at: number;
};

class DescoDb extends Dexie {
  attempts!: Table<LocalAttempt, string>; // client_uuid 가 PK
  syncQueue!: Table<SyncJob, number>;

  constructor() {
    super("desco-edu");
    this.version(1).stores({
      attempts: "&client_uuid, team_id, attempt_no",
      syncQueue: "++id, kind, client_uuid, next_run_at_ms",
    });
  }
}

export const db = new DescoDb();
