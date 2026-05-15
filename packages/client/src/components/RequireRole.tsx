import { Navigate } from "react-router-dom";
import type { Role } from "@desco/shared";
import { getUser } from "../lib/auth.js";

type Props = {
  role: Role;
  children: React.ReactNode;
};

export function RequireRole({ role, children }: Props) {
  const user = getUser();
  if (!user || user.role !== role) {
    const loginPath =
      role === "admin" ? "/admin/login" : role === "ft" ? "/ft/login" : "/team/login";
    return <Navigate to={loginPath} replace />;
  }
  return <>{children}</>;
}
