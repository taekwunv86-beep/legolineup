import { Navigate, Route, Routes } from "react-router-dom";
import AdminLogin from "./pages/admin/Login.js";
import AdminLayout from "./components/AdminLayout.js";
import AdminRounds from "./pages/admin/Rounds.js";
import AdminLive from "./pages/admin/Live.js";
import AdminTeams from "./pages/admin/Teams.js";
import AdminUsers from "./pages/admin/Users.js";
import TeamLogin from "./pages/team/Login.js";
import TeamSession from "./pages/team/Session.js";
import FtLogin from "./pages/ft/Login.js";
import FtLayout from "./components/FtLayout.js";
import FtRoundsList from "./pages/ft/Rounds.js";
import { RequireRole } from "./components/RequireRole.js";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin/login" replace />} />

      <Route path="/admin/login" element={<AdminLogin />} />
      <Route
        path="/admin"
        element={
          <RequireRole role="admin">
            <AdminLayout />
          </RequireRole>
        }
      >
        <Route index element={<Navigate to="/admin/rounds" replace />} />
        <Route path="rounds" element={<AdminRounds />} />
        <Route path="rounds/:roundId" element={<AdminLive />} />
        <Route path="rounds/:roundId/teams" element={<AdminTeams />} />
        <Route path="users" element={<AdminUsers />} />
      </Route>

      <Route path="/team/login" element={<TeamLogin />} />
      <Route path="/team/login/:roundId" element={<TeamLogin />} />
      <Route
        path="/team"
        element={
          <RequireRole role="team">
            <TeamSession />
          </RequireRole>
        }
      />

      <Route path="/ft/login" element={<FtLogin />} />
      <Route
        path="/ft"
        element={
          <RequireRole role="ft">
            <FtLayout />
          </RequireRole>
        }
      >
        <Route index element={<Navigate to="/ft/rounds" replace />} />
        <Route path="rounds" element={<FtRoundsList />} />
      </Route>

      {/* 추후 추가될 라우트 (LB-02, ADM-06/07) */}

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-slate-600">페이지를 찾을 수 없습니다.</p>
    </div>
  );
}
