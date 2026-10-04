import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { db } from "@/lib/db";
import { canManageOrganizationalUnits } from "@/lib/organizational-units";
import { roleLabel } from "@/lib/ux";
import { OrganizationalUnitsManager } from "@/components/dashboard/OrganizationalUnitsManager";

export default async function OrganizationalUnitsPage() {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.institutionId) redirect("/login");
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!canManageOrganizationalUnits(capabilities)) redirect("/dashboard");
  const [units, people] = await Promise.all([
    db.organizationalUnit.findMany({
      where: { institutionId: user.institutionId },
      select: { id: true, name: true, memberships: { where: { institutionId: user.institutionId, user: { institutionId: user.institutionId, status: "ACTIVE" } }, select: { user: { select: { id: true, name: true, role: true } } }, orderBy: { user: { name: "asc" } } } },
      orderBy: { name: "asc" },
      take: 500,
    }),
    db.user.findMany({ where: { institutionId: user.institutionId, status: "ACTIVE" }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" }, take: 1000 }),
  ]);
  return <div className="mx-auto max-w-5xl p-4 sm:p-8"><header className="mb-8"><p className="text-sm font-semibold text-blue-700">Configuración</p><h1 className="text-2xl font-bold">Departamentos y unidades</h1><p className="mt-1 text-sm text-slate-500">Organiza personas para segmentar anuncios. Los cambios solo afectan a esta institución.</p></header><OrganizationalUnitsManager people={people.map((person) => ({ id: person.id, name: person.name, detail: roleLabel(person.role) }))} units={units.map((unit) => ({ ...unit, memberships: unit.memberships.map((membership) => ({ user: { id: membership.user.id, name: membership.user.name, detail: roleLabel(membership.user.role) } })) }))} /></div>;
}
