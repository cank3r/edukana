import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { deleteBlockedReason, listPeriods, type PeriodStatus } from "@/server/academic/periods";
import { DeletePeriodButton, MarkCurrentButton, PeriodForm } from "./PeriodTools";

export const dynamic = "force-dynamic";

const STATUS: Record<PeriodStatus, { label: string; className: string; hint: string }> = {
  CURRENT: { label: "Actual", className: "bg-emerald-100 text-emerald-800", hint: "" },
  UPCOMING: { label: "Próximo", className: "bg-blue-100 text-blue-800", hint: "Todavía no empieza." },
  ENDED: { label: "Terminado", className: "bg-slate-100 text-slate-700", hint: "Ya pasó su fecha final. Queda guardado como historial." },
  UNMARKED: { label: "En fechas", className: "bg-amber-100 text-amber-900", hint: "Hoy cae dentro de sus fechas, pero no es el período actual." },
};

const dayFormat = new Intl.DateTimeFormat("es", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
const formatDay = (key: string) => dayFormat.format(new Date(`${key}T00:00:00.000Z`));
const plural = (count: number, one: string, many: string) => (count === 1 ? `1 ${one}` : `${count} ${many}`);

export default async function PeriodsPage({ searchParams }: { searchParams: Promise<{ crear?: string }> }) {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) redirect("/login");
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!capabilities.has("academic.structure.manage")) redirect("/dashboard");

  const periods = await listPeriods(user.institutionId);
  const asked = Boolean((await searchParams).crear);
  const startOpen = asked || periods.length === 0;
  const ranges = periods.map(({ id, name, startDate, endDate }) => ({ id, name, startDate, endDate }));
  const current = periods.find((period) => period.isCurrent) ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Períodos académicos</h1>
        <p className="mt-1 text-sm text-slate-600">
          Un período es el tramo del año en que se dan las clases, por ejemplo «Enero–Abril 2027» o «Año 2026–2027». Cada curso pertenece a un período.
        </p>
      </header>

      {periods.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="font-semibold text-slate-950">Todavía no hay períodos</p>
          <p className="mt-1 text-sm text-slate-600">Crea el primero para poder abrir cursos. Solo necesitas un nombre y las fechas en que empieza y termina.</p>
        </div>
      ) : !current ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Ningún período está marcado como actual. Elige uno con «Marcar como período actual» para que el inicio muestre el período en curso.
        </p>
      ) : current.currentButEnded ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          El período actual, «{current.name}», ya terminó. Crea el siguiente y márcalo como actual.
        </p>
      ) : null}

      <PeriodForm key={asked ? "abierto" : "cerrado"} others={ranges} startOpen={startOpen} />

      {periods.length > 0 && (
        <ul className="space-y-3">
          {periods.map((period) => {
            const status = STATUS[period.status];
            const blocked = deleteBlockedReason(period.courseCount, period.chargeCount);
            return (
              <li key={period.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="break-words text-lg font-bold text-slate-950">{period.name}</h2>
                    <p className="text-sm text-slate-600">Del {formatDay(period.startDate)} al {formatDay(period.endDate)}</p>
                    <p className="text-sm text-slate-600">
                      {period.courseCount === 0 ? "Sin cursos todavía" : plural(period.courseCount, "curso", "cursos")}
                      {period.chargeCount > 0 ? ` · ${plural(period.chargeCount, "cobro", "cobros")}` : ""}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span>
                </div>
                {status.hint && <p className="mt-2 text-sm text-slate-600">{status.hint}</p>}
                {period.overlapsWith.length > 0 && (
                  <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                    Sus fechas se cruzan con {period.overlapsWith.map((name) => `«${name}»`).join(", ")}. No es un error, pero revísalo si no era tu intención.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-start gap-2">
                  <PeriodForm period={{ id: period.id, name: period.name, startDate: period.startDate, endDate: period.endDate }} others={ranges} />
                  {!period.isCurrent && <MarkCurrentButton periodId={period.id} name={period.name} currentName={current?.name ?? null} />}
                  {!blocked && <DeletePeriodButton periodId={period.id} name={period.name} isCurrent={period.isCurrent} />}
                </div>
                {blocked && (
                  <details className="mt-2">
                    <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-slate-700">¿Por qué no puedo borrarlo?</summary>
                    <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{blocked}</p>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
