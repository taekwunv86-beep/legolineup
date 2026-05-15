import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { Round } from "@desco/shared";
import { apiFetch } from "../../lib/api.js";
import { clearSession, getUser } from "../../lib/auth.js";

export default function AdminHome() {
  const navigate = useNavigate();
  const user = getUser();
  const { data, isLoading, error } = useQuery({
    queryKey: ["rounds"],
    queryFn: () => apiFetch<Round[]>("/api/rounds"),
  });

  const onLogout = () => {
    clearSession();
    navigate("/admin/login", { replace: true });
  };

  return (
    <div className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">DESCO 운영 — 차수 관리</h1>
          <p className="text-sm text-slate-500">{user?.display_name}님 로그인 중</p>
        </div>
        <button
          onClick={onLogout}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
        >
          로그아웃
        </button>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold">차수 목록</h2>
        {isLoading && <p className="text-sm text-slate-500">불러오는 중…</p>}
        {error && (
          <p className="text-sm text-red-600">
            (라우트 미구현) /api/rounds 가 아직 없습니다. Phase 2 에서 추가합니다.
          </p>
        )}
        {data && data.length === 0 && (
          <p className="text-sm text-slate-500">아직 등록된 차수가 없습니다.</p>
        )}
        {data && data.length > 0 && (
          <ul className="divide-y divide-slate-200">
            {data.map((r) => (
              <li key={r.id} className="py-3">
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-slate-500">상태: {r.status}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
