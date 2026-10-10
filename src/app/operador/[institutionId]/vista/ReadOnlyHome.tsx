import type { AdminHome } from "@/server/admin-home";

/** Presentation-only projection of the same data used by AdminHome; intentionally has no action props or dashboard links. */
export function ReadOnlyHome({ home }: { home: AdminHome }) {
  const labels: Record<keyof AdminHome["numbers"], string> = {
    activeStudents: "Estudiantes activos", activeTeachers: "Docentes activos", courses: "Cursos",
    activeEnrollments: "Inscripciones activas", pendingInvitations: "Personas pendientes de invitación", suspendedPeople: "Personas suspendidas",
  };
  return <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
    <h1 className="break-words text-2xl font-bold" style={{ color: "var(--navy)" }}>{home.institutionName}</h1>
    <section aria-label="Tu institución en números" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {(Object.keys(labels) as Array<keyof typeof labels>).map((key) => <div key={key} className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-2xl font-bold text-slate-950">{home.numbers[key]}</p><p className="text-sm text-slate-700">{labels[key]}</p>
      </div>)}
    </section>
    <section className="space-y-3"><h2 className="text-lg font-semibold text-slate-950">Requiere tu atención</h2>
      {home.alerts.length ? home.alerts.map((alert) => <article key={alert.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <h3 className="font-semibold text-slate-950">{alert.title}</h3><p className="text-sm text-slate-700">{alert.detail}</p>
      </article>) : <p className="text-slate-700">Todo al día. No hay pendientes ahora.</p>}
    </section>
  </div>;
}
