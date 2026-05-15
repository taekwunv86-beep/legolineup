import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { LoginResponse } from "@desco/shared";
import { apiFetch, ApiClientError } from "../../lib/api.js";
import { saveSession } from "../../lib/auth.js";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: { username, password },
      });
      if (res.user.role !== "admin") {
        setError("관리자 계정이 아닙니다.");
        return;
      }
      saveSession(res.token, res.user);
      navigate("/admin", { replace: true });
    } catch (e) {
      if (e instanceof ApiClientError) setError(e.body.error.message);
      else setError("로그인에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-md"
      >
        <h1 className="mb-1 text-2xl font-bold">Legolineup 운영 관리자</h1>
        <p className="mb-6 text-sm text-slate-500">관리자 계정으로 로그인하세요.</p>

        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium text-slate-700">아이디</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          />
        </label>

        <label className="mb-5 block">
          <span className="mb-1 block text-sm font-medium text-slate-700">비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          />
        </label>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? "로그인 중…" : "로그인"}
        </button>
      </form>
    </div>
  );
}
