import { Hono } from "hono";
import { cors } from "hono/cors";
import { wrapErrors } from "./middleware/error.js";
import { authRoutes } from "./routes/auth.js";
import type { AppBindings } from "./env.js";

const app = new Hono<AppBindings>();

// 개발 시에만 CORS 허용 (운영은 동일 도메인이라 불필요)
app.use("*", cors({ origin: "*", allowHeaders: ["Authorization", "Content-Type"] }));
app.use("*", wrapErrors);

app.get("/api/health", (c) => c.json({ ok: true, ts: Date.now() }));

app.route("/api/auth", authRoutes);

app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "요청한 리소스가 없습니다." } }, 404));

export default app;
