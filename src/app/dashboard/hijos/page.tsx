import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CalendarDays, ChevronRight, Users } from "lucide-react";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { listMyChildren } from "@/server/family/guardian-portal";

export default async function ChildrenPortalPage({ searchParams }: { searchParams: Promise<{ child?: string | string[] }> }) {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.institutionId) redirect("/login");
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (user.role !== "PARENT" || !capabilities.has("child.portal.view")) redirect("/dashboard");

  // `listMyChildren` vuelve a comprobar el vínculo activo y los permisos de cada hijo en el servidor.
  const children = await listMyChildren({ id: user.id, institutionId: user.institutionId, role: user.role });
  if (children.length === 0) return <EmptyPortal />;

  // Enlaces antiguos (`?child=`) y familias con un solo hijo van directo al resumen.
  const requested = (await searchParams).child;
  const target = typeof requested === "string" ? children.find((child) => child.studentId === requested) : children.length === 1 ? children[0] : undefined;
  if (target) redirect(`/dashboard/hijos/${encodeURIComponent(target.studentId)}`);

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Mis hijos</h1>
        <p className="mt-1 text-sm text-slate-600">Elige a quién quieres ver. Aquí solo se consulta: no se cambia nada.</p>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2">
        {children.map((child) => (
          <li key={child.studentId}>
            <Link href={`/dashboard/hijos/${encodeURIComponent(child.studentId)}`} className="block min-h-11 rounded-xl border border-slate-200 bg-white p-4 hover:border-blue-300 hover:shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <h2 className="min-w-0 break-words text-lg font-bold text-slate-900">{child.name}</h2>
                <ChevronRight className="shrink-0 text-slate-400" size={20} aria-hidden="true" />
              </div>
              {child.activeCourses !== null && (
                <>
                  <p className="mt-2 text-sm text-slate-700">
                    {child.activeCourses === 0 ? "Sin cursos en marcha" : child.activeCourses === 1 ? "1 curso en marcha" : `${child.activeCourses} cursos en marcha`}
                    {child.averageProgress !== null && ` · avance promedio ${child.averageProgress} %`}
                  </p>
                  {child.averageProgress !== null && (
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={child.averageProgress} aria-label={`Avance promedio de ${child.name}`}>
                      <div className="h-full rounded-full bg-blue-700" style={{ width: `${child.averageProgress}%` }} />
                    </div>
                  )}
                </>
              )}
              {child.permissions.schedule && (
                <p className="mt-3 flex items-start gap-2 text-sm text-slate-700">
                  <CalendarDays className="mt-0.5 shrink-0 text-blue-700" size={16} aria-hidden="true" />
                  <span>{child.nextClass ? `Próxima clase: ${child.nextClass.title} (${child.nextClass.courseName}) · ${child.nextClass.when}` : "Sin clases en vivo programadas"}</span>
                </p>
              )}
              {child.alerts.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {child.alerts.map((alert) => (
                    <li key={alert.kind} className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
                      <AlertTriangle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />{alert.text}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-sm font-semibold text-blue-700">Ver su resumen</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyPortal() {
  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-8">
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <Users className="mx-auto mb-3 text-slate-400" size={40} aria-hidden="true" />
        <h1 className="text-xl font-bold" style={{ color: "var(--navy)" }}>Todavía no tienes hijos vinculados</h1>
        <p className="mt-2 text-sm text-slate-700">Para ver el avance, las notas y la asistencia de tu hijo o hija, la institución debe vincular tu cuenta con la suya.</p>
        <p className="mt-2 text-sm text-slate-700">Pídelo en la administración o la coordinación de la institución. Cuando activen el vínculo, aparecerá aquí sin que tengas que hacer nada más.</p>
      </div>
    </div>
  );
}
