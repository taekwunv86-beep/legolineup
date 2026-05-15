import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearSession, getUser } from "../lib/auth.js";

const navItems = [
  { to: "/admin/rounds", label: "차수 관리" },
  { to: "/admin/users", label: "계정 관리" },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const user = getUser();

  const onLogout = () => {
    clearSession();
    navigate("/admin/login", { replace: true });
  };

  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside className="w-56 shrink-0 border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-5">
          <p className="text-xs uppercase tracking-wider text-slate-400">DESCO</p>
          <p className="text-base font-bold text-slate-900">운영 관리자</p>
        </div>
        <nav className="flex flex-col gap-1 px-3 py-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm transition ${
                  isActive
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-100"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="absolute bottom-0 w-56 border-t border-slate-200 bg-white px-5 py-4">
          <p className="text-xs text-slate-500">로그인</p>
          <p className="mb-2 truncate text-sm font-medium">{user?.display_name}</p>
          <button
            onClick={onLogout}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100"
          >
            로그아웃
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-x-auto">
        <div className="mx-auto max-w-6xl p-6 pb-32">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
