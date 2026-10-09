import Link from "next/link";
import { AlertTriangle, CalendarDays, ChevronRight, CreditCard, Users } from "lucide-react";
import type { GuardianActor } from "@/server/family/guardian-portal";
import { getParentHome } from "@/server/parent-home";

type Props = { user: GuardianActor; userName?: string | null };

const sectionTitle = "mb-3 text-lg font-bold text-slate-900";
const plural = (count: number, one: string, many: string) => (count === 1 ? `1 ${one}` : `${count} ${many}`);

/** Inicio del tutor: qué pasa con cada hijo y qué requiere su atención. */
export async function ParentHome({ user, userName }: Props) {
  const home = await getParentHome(user);
  const firstName = userName?.split(" ")[0];

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      <header className="mb-6">
        <p className="mb-1 text-sm text-slate-600">Hola{firstName ? `, ${firstName}` : ""}</p>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>¿Cómo van mis hijos?</h1>
        {home.children.length > 0 && <p className="mt-1 text-sm text-slate-700">{plural(home.children.length, "hijo vinculado", "hijos vinculados")}</p>}
      </header>

      {home.children.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
          <Users className="mx-auto mb-3 text-slate-400" size={32} aria-hidden="true" />
          <p className="font-semibold text-slate-900">Todavía no tienes hijos vinculados</p>
          <p className="mt-1 text-sm text-slate-700">La institución debe vincular tu cuenta con la de tu hijo o hija. Pídelo en la administración; cuando lo hagan, aparecerá aquí.</p>
        </div>
      ) : (
        <>
          <section className="mb-8" aria-labelledby="atencion">
            <h2 id="atencion" className={sectionTitle}>Requiere tu atención</h2>
            {home.alertsTotal === 0 ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="font-semibold text-emerald-900">Todo al día</p>
                <p className="text-sm text-emerald-800">No hay tareas vencidas, asistencia baja ni cargos vencidos.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {home.children.flatMap((child) => {
                  const href = `/dashboard/hijos/${encodeURIComponent(child.studentId)}`;
                  const items = child.alerts.map((alert) => ({ key: `${child.studentId}-${alert.kind}`, text: alert.text, href, icon: <AlertTriangle size={20} aria-hidden="true" /> }));
                  if (child.overdueCharges) {
                    items.push({ key: `${child.studentId}-charges`, text: plural(child.overdueCharges, "cargo vencido por pagar", "cargos vencidos por pagar"), href, icon: <CreditCard size={20} aria-hidden="true" /> });
                  }
                  return items.map((item) => (
                    <li key={item.key}>
                      <Link href={item.href} className="flex min-h-14 items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 hover:border-amber-400">
                        <span className="shrink-0 rounded-lg bg-white p-2 text-amber-700">{item.icon}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block break-words font-semibold text-slate-950">{child.name}</span>
                          <span className="block text-sm text-slate-700">{item.text}</span>
                        </span>
                        <ChevronRight className="shrink-0 text-slate-500" size={18} aria-hidden="true" />
                      </Link>
                    </li>
                  ));
                })}
              </ul>
            )}
          </section>

          <section className="mb-8" aria-labelledby="mis-hijos">
            <h2 id="mis-hijos" className={sectionTitle}>Mis hijos</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {home.children.map((child) => (
                <li key={child.studentId}>
                  <Link href={`/dashboard/hijos/${encodeURIComponent(child.studentId)}`} className="block min-h-11 rounded-xl border border-slate-200 bg-white p-4 hover:border-blue-300 hover:shadow-sm">
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0 break-words font-semibold text-slate-900">{child.name}</span>
                      <ChevronRight className="shrink-0 text-slate-400" size={18} aria-hidden="true" />
                    </span>
                    {child.activeCourses !== null && (
                      <span className="mt-1 block text-sm text-slate-700">
                        {child.activeCourses === 0 ? "Sin cursos en marcha" : plural(child.activeCourses, "curso en marcha", "cursos en marcha")}
                        {child.averageProgress !== null && ` · avance promedio ${child.averageProgress} %`}
                      </span>
                    )}
                    {child.permissions.schedule && (
                      <span className="mt-2 flex items-start gap-2 text-sm text-slate-700">
                        <CalendarDays className="mt-0.5 shrink-0 text-blue-700" size={16} aria-hidden="true" />
                        <span>{child.nextClass ? `Próxima clase: ${child.nextClass.title} · ${child.nextClass.when}` : "Sin clases en vivo programadas"}</span>
                      </span>
                    )}
                    <span className="mt-3 block text-sm font-semibold text-blue-700">Ver su resumen</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

        </>
      )}
    </div>
  );
}
