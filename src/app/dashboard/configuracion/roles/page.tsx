import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { CAPABILITIES, ROLE_ALLOWED_CAPABILITIES, ROLES, resolveEffectiveCapabilities } from "@/lib/capabilities";
import { roleEditRestriction } from "@/lib/role-permissions";
import { RolePermissionsEditor } from "@/components/dashboard/RolePermissionsEditor";

export default async function RolesPermissionsPage() {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.institutionId) redirect("/login");

  const actorCapabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!actorCapabilities.has("roles.permissions.manage")) redirect("/dashboard");

  const overrides = await db.roleCapabilityOverride.findMany({
    where: { institutionId: user.institutionId, capability: { in: [...CAPABILITIES] } },
    select: { role: true, capability: true, enabled: true },
  });
  const roles = ROLES.map((role) => ({
    role,
    enabled: [...resolveEffectiveCapabilities(role, overrides.filter((item) => item.role === role))],
    allowed: [...ROLE_ALLOWED_CAPABILITIES[role]],
    restriction: roleEditRestriction(user.role, role),
  }));

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-8">
      <header className="mb-8"><p className="text-sm font-semibold text-blue-700">Configuración</p><h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Roles y permisos</h1><p className="mt-1 max-w-3xl text-sm text-slate-500">Define qué puede hacer cada rol dentro de tu institución. Todo permiso no listado o desactivado se deniega.</p></header>
      <RolePermissionsEditor roles={roles} actorCapabilities={[...actorCapabilities]} />
    </div>
  );
}
