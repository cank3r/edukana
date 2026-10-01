import type { EdukanaRole } from "@/types/next-auth";

const PUBLIC_ROUTES = ["/login"] as const;

const DASHBOARD_ACCESS: ReadonlyArray<{
  prefix: string;
  roles: readonly EdukanaRole[];
}> = [
  { prefix: "/dashboard/portal", roles: ["STUDENT"] },
  { prefix: "/dashboard/gestion", roles: ["SUPER_ADMIN", "ADMIN", "COORDINATOR"] },
  { prefix: "/dashboard/admisiones", roles: ["SUPER_ADMIN", "ADMIN", "COORDINATOR"] },
  { prefix: "/dashboard/pagos", roles: ["SUPER_ADMIN", "ADMIN"] },
  { prefix: "/dashboard/analitica", roles: ["SUPER_ADMIN", "ADMIN", "COORDINATOR"] },
  { prefix: "/dashboard/configuracion", roles: ["SUPER_ADMIN", "ADMIN"] },
];

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isPublicPath(pathname: string) {
  return PUBLIC_ROUTES.some((route) => matchesPrefix(pathname, route));
}

export function canAccessDashboardPath(pathname: string, role: EdukanaRole) {
  const rule = DASHBOARD_ACCESS.find(({ prefix }) => matchesPrefix(pathname, prefix));
  return !rule || rule.roles.includes(role);
}
