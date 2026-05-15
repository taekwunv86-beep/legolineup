import { Outlet, useNavigate } from "react-router-dom";
import { clearSession, getUser } from "../lib/auth.js";

export default function FtLayout() {
  const navigate = useNavigate();
  const user = getUser();

  const onLogout = () => {
    clearSession();
    navigate("/ft/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400">
              Legolineup · FT
            </p>
            <p className="text-base font-bold text-slate-900">{user?.display_name ?? "FT"}</p>
          </div>
          <button
            onClick={onLogout}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100"
          >
            로그아웃
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-5 pb-24">
        <Outlet />
      </main>
    </div>
  );
}
