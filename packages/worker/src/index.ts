import { Hono } from "hono";
import { cors } from "hono/cors";
import { wrapErrors } from "./middleware/error.js";
import { authRoutes } from "./routes/auth.js";
import { roundRoutes } from "./routes/rounds.js";
import { roundTeamRoutes, teamRoutes } from "./routes/teams.js";
import { userRoutes } from "./routes/users.js";
import { liveRoutes, teamHeartbeatRoutes } from "./routes/live.js";
import { attemptRoutes } from "./routes/attempts.js";
import { teamNoteRoutes, noteRoutes } from "./routes/notes.js";
import type { AppBindings } from "./env.js";

const app = new Hono<AppBindings>();

// 개발 시에만 CORS 허용 (운영은 동일 도메인이라 불필요)
app.use("*", cors({ origin: "*", allowHeaders: ["Authorization", "Content-Type"] }));
app.use("*", wrapErrors);

app.get("/api/health", (c) => c.json({ ok: true, ts: Date.now() }));

app.route("/api/auth", authRoutes);
app.route("/api/users", userRoutes);
app.route("/api/rounds", roundRoutes);
// 라이브 운영 라우트는 /:id/{start,end,live} — round CRUD 보다 먼저 마운트하면 자식 prefix 가 우선되어 안전
app.route("/api/rounds", liveRoutes);
app.route("/api/rounds/:round_id/teams", roundTeamRoutes);
app.route("/api/teams", teamRoutes);
app.route("/api/teams", teamHeartbeatRoutes);
app.route("/api/teams", teamNoteRoutes);
app.route("/api/notes", noteRoutes);
app.route("/api/attempts", attemptRoutes);

app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "요청한 리소스가 없습니다." } }, 404));

export default app;
