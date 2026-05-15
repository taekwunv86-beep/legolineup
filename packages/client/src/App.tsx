import { Navigate, Route, Routes } from "react-router-dom";
import AdminLogin from "./pages/admin/Login.js";
import AdminHome from "./pages/admin/Home.js";
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
            <AdminHome />
          </RequireRole>
        }
      />

      {/* 추후 추가될 라우트 (TM-*, FT-*, LB-02) */}

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
