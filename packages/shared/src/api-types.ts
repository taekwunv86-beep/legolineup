import type { Role, RoundStatus, TeamLiveStatus, ColorCode } from "./constants.js";

export type AuthUser = {
  id: number;
  role: Role;
  display_name: string;
  round_id?: number;
};

export type LoginResponse = {
  token: string;
  user: AuthUser;
};

export type User = {
  id: number;
  username: string;
  role: "admin" | "ft";
  display_name: string;
  is_active: boolean;
  created_at: number;
};

export type Round = {
  id: number;
  name: string;
  time_limit_seconds: number;
  status: RoundStatus;
  share_token: string;
  started_at_ms: number | null;
  ended_at_ms: number | null;
  created_by: number;
  created_at: number;
};

export type RoundSummary = Round & {
  team_count: number;
  total_attempts: number;
  total_successes: number;
};

export type Team = {
  id: number;
  round_id: number;
  name: string;
  username: string;
  last_heartbeat_at: number | null;
  created_at: number;
};

export type TeamWithPasswordHint = Team & {
  password_plain?: string;
};

export type Attempt = {
  id: number;
  team_id: number;
  attempt_no: number;
  client_uuid: string;
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
  is_success: boolean;
  success_marked_by: number | null;
  success_marked_at_ms: number | null;
  user_notes: string | null;
  created_at: number;
};

export type Note = {
  id: number;
  team_id: number;
  author_id: number;
  author_display_name?: string;
  content: string;
  created_at: number;
  updated_at: number;
};

export type StartRoundResponse = {
  started_at_ms: number;
  attempts_created: number;
};

export type HeartbeatResponse = {
  round_status: RoundStatus;
  time_remaining_ms: number | null;
};

export type LiveTeamCard = {
  id: number;
  name: string;
  status: TeamLiveStatus;
  attempt_count: number;
  success_count: number;
  best_duration_ms: number | null;
  current_attempt_no: number | null;
  last_activity_at_ms: number | null;
};

export type LiveResponse = {
  round: {
    id: number;
    name: string;
    status: RoundStatus;
    started_at_ms: number | null;
    time_limit_seconds: number;
    time_remaining_ms: number | null;
  };
  summary: {
    total_teams: number;
    measuring_teams: number;
    total_attempts: number;
    total_successes: number;
  };
  teams: LiveTeamCard[];
};

export type LeaderboardTeam = {
  team_id: number;
  team_name: string;
  best_duration_ms: number | null;
  success_count: number;
  attempt_count: number;
  last_success_at_ms: number | null;
};

export type LeaderboardResponse = {
  round_name: string;
  round_status: RoundStatus;
  time_remaining_ms: number | null;
  teams: LeaderboardTeam[];
};
