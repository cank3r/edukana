import Link from "next/link";
import { AlertCircle, BookOpen, Building2, CalendarPlus, ChevronRight, Megaphone, UserPlus, Users } from "lucide-react";
import { ALERTS_IN_FIRST_STEPS, getAdminHome } from "@/server/admin-home";
import { getFirstStepsGuide } from "@/server/first-steps";
import { FirstSteps } from "./FirstSteps";

type Props = { institutionId: string; userName?: string | null; canManagePeople: boolean; canPublish: boolean };

/** Inicio de quien administra: qué hacer ahora, accesos directos y la institución en números. */
export async function AdminHome({ institutionId, userName, canManagePeople, canPublish }: Props) {
  const [{ institutionName, hasPeriod, numbers, alerts: allAlerts }, guide] = await Promise.all([
    getAdminHome(institutionId),
    canManagePeople ? getFirstStepsGuide(institutionId) : null,
  ]);
  const firstName = userName?.split(" ")[0];
  const showGuide = Boolean(guide?.visible);
  // Lo que ya pide «Primeros pasos» no se repite en «Requiere tu atención».
  const alerts = showGuide ? allAlerts.filter((alert) => !ALERTS_IN_FIRST_STEPS.includes(alert.id)) : allAlerts;
  const isEmpty = Object.values(numbers).every((value) => value === 0);

  const actions = [
    ...(canManagePeople ? [{ href: "/dashboard/gestion/accesos", label: "Agregar personas", icon: <UserPlus size={20} aria-hidden="true" /> }] : []),
    hasPeriod
      ? { href: "/dashboard/aula", label: "Crear un curso", icon: <BookOpen size={20} aria-hidden="true" /> }
      : { href: "/dashboard/configuracion/periodos", label: "Crear un período", icon: <CalendarPlus size={20} aria-hidden="true" /> },
    ...(canPublish ? [{ href: "/dashboard/comunidad", label: "Publicar un aviso", icon: <Megaphone size={20} aria-hidden="true" /> }] : []),
    { href: "/dashboard/gestion", label: "Ver personas", icon: <Users size={20} aria-hidden="true" /> },
    { href: "/dashboard/configuracion", label: "Datos de la institución", icon: <Building2 size={20} aria-hidden="true" /> },
  ];

  const figures = [
    { label: "Estudiantes activos", value: numbers.activeStudents, href: "/dashboard/gestion?rol=estudiantes", empty: "Aún no hay estudiantes. Agrega los primeros." },
    { label: "Docentes activos", value: numbers.activeTeachers, href: "/dashboard/gestion?rol=docentes", empty: "Aún no hay docentes. Agrega el primero." },
    { label: "Cursos", value: numbers.courses, href: "/dashboard/aula", empty: "Aún no hay cursos. Crea el primero." },
    { label: "Inscripciones activas", value: numbers.activeEnrollments, href: "/dashboard/aula", empty: "Nadie está inscrito todavía. Abre un curso e inscribe estudiantes." },
    { label: "Personas que aún no pueden entrar", value: numbers.pendingInvitations, href: "/dashboard/gestion/accesos", empty: "Todas las personas ya pueden entrar." },
    { label: "Personas suspendidas", value: numbers.suspendedPeople, href: "/dashboard/gestion?estado=suspendidos", empty: "No hay nadie suspendido." },
  ];

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <header className="mb-8">
        <p className="mb-1 text-sm text-slate-600">Hola{firstName ? `, ${firstName}` : ""}</p>
        <h1 className="break-words text-2xl font-bold" style={{ color: "var(--navy)" }}>{institutionName || "Tu institución"}</h1>
      </header>

      {showGuide && guide && <FirstSteps steps={guide.steps} />}

      {isEmpty ? (
        // Institución recién creada: sin cifras en cero ni avisos; solo la guía.
        <p className="text-slate-700">
          Aquí verás los números de tu institución y lo que requiera tu atención cuando empiece a funcionar.
          {showGuide ? " Empieza por los primeros pasos." : ""}
        </p>
      ) : (
      <>

      <section className="mb-8" aria-labelledby="acciones-frecuentes">
        <h2 id="acciones-frecuentes" className="mb-3 text-lg font-bold text-slate-900">Acciones frecuentes</h2>
        <div className="grid gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
          {actions.map((action) => (
            <Link key={action.label} href={action.href} className="flex min-h-14 items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 font-semibold text-slate-900 hover:border-blue-300 hover:shadow-sm">
              <span className="rounded-lg bg-blue-50 p-2 text-blue-700">{action.icon}</span>
              <span className="min-w-0 flex-1">{action.label}</span>
              <ChevronRight className="shrink-0 text-slate-400" size={18} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      <section className="mb-8" aria-labelledby="en-numeros">
        <h2 id="en-numeros" className="mb-3 text-lg font-bold text-slate-900">Tu institución en números</h2>
        {/* En el celular, dos cifras por fila para no obligar a bajar tanto. */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
          {figures.map((figure) => (
            <Link key={figure.label} href={figure.href} className="block min-h-11 rounded-xl border border-slate-200 bg-white p-3 hover:border-blue-300 hover:shadow-sm sm:p-5">
              <p className="text-xl font-bold text-slate-900 sm:text-2xl">{figure.value}</p>
              <p className="text-xs leading-snug text-slate-600 sm:text-sm">{figure.label}</p>
              {figure.value === 0 && <p className="mt-1 text-xs leading-snug text-slate-700 sm:mt-2 sm:text-sm">{figure.empty}</p>}
            </Link>
          ))}
        </div>
      </section>

      <section className="mb-8" aria-labelledby="requiere-atencion">
        <h2 id="requiere-atencion" className="mb-3 text-lg font-bold text-slate-900">Requiere tu atención</h2>
        {alerts.length === 0 ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="font-semibold text-emerald-900">Todo al día</p>
            <p className="text-sm text-emerald-800">No hay pendientes que requieran tu atención ahora.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {alerts.map((alert) => (
              <li key={alert.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 shrink-0 text-amber-700" size={20} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-950">{alert.title}</p>
                    <p className="mt-1 text-sm text-slate-700">{alert.detail}</p>
                    <Link href={alert.href} className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:border-amber-500">{alert.action}</Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      </>
      )}
    </div>
  );
}
