import { hasCapability, type Capability } from "@/lib/capabilities";
import type { EdukanaRole } from "@/types/next-auth";

const PUBLIC_ROUTES = ["/login", "/setup", "/certificados", "/recuperar", "/restablecer", "/cursos", "/ensena", "/solicitud", "/catalogo", "/ensenar"] as const;

const DASHBOARD_ACCESS: ReadonlyArray<{ prefix: string; capability: Capability }> = [
  { prefix: "/dashboard/configuracion/tutores", capability: "guardianship.manage" },
  { prefix: "/dashboard/configuracion/roles", capability: "roles.permissions.manage" },
  { prefix: "/dashboard/hijos", capability: "child.portal.view" },
  { prefix: "/dashboard/portal", capability: "student.portal.view" },
  { prefix: "/dashboard/gestion", capability: "people.view" },
  { prefix: "/dashboard/admisiones", capability: "admissions.manage" },
  { prefix: "/dashboard/pagos", capability: "finance.manage" },
  { prefix: "/dashboard/analitica", capability: "analytics.view" },
  { prefix: "/dashboard/configuracion", capability: "tenant.settings.manage" },
  { prefix: "/dashboard/calendario", capability: "schedule.view" },
  { prefix: "/dashboard/aula", capability: "course.view" },
];

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isPublicPath(pathname: string) {
  return PUBLIC_ROUTES.some((route) => matchesPrefix(pathname, route));
}

export function canAccessDashboardPath(pathname: string, role: EdukanaRole, effective?: ReadonlySet<Capability> | readonly Capability[]) {
  const rule = DASHBOARD_ACCESS.find(({ prefix }) => matchesPrefix(pathname, prefix));
  if (rule?.capability === "student.portal.view" && role !== "STUDENT") return false;
  if (rule?.capability === "child.portal.view" && role !== "PARENT") return false;
  return !rule || hasCapability(role, rule.capability, effective);
}
