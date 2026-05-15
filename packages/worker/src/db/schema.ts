import { sqliteTable, integer, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// 관리자 + FT 계정
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password_hash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "ft"] }).notNull(),
  display_name: text("display_name").notNull(),
  is_active: integer("is_active").notNull().default(1),
  created_at: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

// 차수
export const rounds = sqliteTable(
  "rounds",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    time_limit_seconds: integer("time_limit_seconds").notNull().default(900),
    status: text("status", { enum: ["preparing", "active", "ended"] })
      .notNull()
      .default("preparing"),
    share_token: text("share_token").notNull().unique(),
    // 팀 로그인용 6자리 코드 (저장은 대시 없이, 표시는 3-3 형식)
    access_code: text("access_code"),
    started_at_ms: integer("started_at_ms"),
    ended_at_ms: integer("ended_at_ms"),
    created_by: integer("created_by")
      .notNull()
      .references(() => users.id),
    created_at: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    statusIdx: index("idx_rounds_status").on(t.status),
    accessCodeIdx: uniqueIndex("uq_rounds_access_code").on(t.access_code),
  }),
);

// 팀 (= 모바일 로그인 단위)
export const teams = sqliteTable(
  "teams",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    round_id: integer("round_id")
      .notNull()
      .references(() => rounds.id),
    name: text("name").notNull(),
    username: text("username").notNull(),
    password_hash: text("password_hash").notNull(),
    last_heartbeat_at: integer("last_heartbeat_at"),
    created_at: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    roundUsernameUq: uniqueIndex("uq_teams_round_username").on(t.round_id, t.username),
    roundIdx: index("idx_teams_round").on(t.round_id),
  }),
);

// 시도
export const attempts = sqliteTable(
  "attempts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    team_id: integer("team_id")
      .notNull()
      .references(() => teams.id),
    attempt_no: integer("attempt_no").notNull(),
    client_uuid: text("client_uuid").notNull().unique(),
    started_at_ms: integer("started_at_ms").notNull(),
    stopped_at_ms: integer("stopped_at_ms"),
    duration_ms: integer("duration_ms"),
    assembly_order_1: text("assembly_order_1"),
    assembly_order_2: text("assembly_order_2"),
    assembly_order_3: text("assembly_order_3"),
    assembly_order_4: text("assembly_order_4"),
    assembly_order_5: text("assembly_order_5"),
    turn_t: integer("turn_t"),
    turn_extra: integer("turn_extra"),
    is_success: integer("is_success").notNull().default(0),
    success_marked_by: integer("success_marked_by").references(() => users.id),
    success_marked_at_ms: integer("success_marked_at_ms"),
    user_notes: text("user_notes"),
    created_at: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    teamSuccessDurationIdx: index("idx_attempts_team_success_duration").on(
      t.team_id,
      t.is_success,
      t.duration_ms,
    ),
    teamNoIdx: index("idx_attempts_team_no").on(t.team_id, t.attempt_no),
  }),
);

// FT 메모
export const ft_notes = sqliteTable(
  "ft_notes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    team_id: integer("team_id")
      .notNull()
      .references(() => teams.id),
    author_id: integer("author_id")
      .notNull()
      .references(() => users.id),
    content: text("content").notNull(),
    created_at: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
    updated_at: integer("updated_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    teamIdx: index("idx_ft_notes_team").on(t.team_id),
  }),
);

// 감사 로그
export const audit_logs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actor_id: integer("actor_id").references(() => users.id),
  action: text("action").notNull(),
  target_table: text("target_table"),
  target_id: integer("target_id"),
  payload: text("payload"),
  created_at: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
});
