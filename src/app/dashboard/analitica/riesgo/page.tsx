import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { resolveBoardContext } from "@/server/dashboard/context";
import { formatCount, formatPercent, NO_DATA } from "@/server/dashboard/format";
import { RISK_SIGNALS, RISK_SIGNAL_NAMES, getAtRiskStudents, parseRiskSignal, riskSignalLabel } from "@/server/dashboard/risk";
import { NAVY, RangeSwitch, Tag } from "../../_tablero/parts";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Lista completa de estudiantes en riesgo, con filtro por señal y por ventana de tiempo.
 * Se abre desde «Ver todos» del inicio. Solo para quien ve reportes y todos los cursos.
 * Consultas: 2 de permisos y período + 1 de la lista (+1 de totales si el filtro no trae a nadie).
 */
export default async function RiesgoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  const raw = await searchParams;
  const ctx = await resolveBoardContext({ id: user.id, institutionId: user.institutionId, role: user.role }, capabilities, first(raw.rango));
  if (!ctx.can.fullRiskList) redirect("/dashboard");

  const signal = parseRiskSignal(first(raw.senal));
  const page = Math.max(1, Math.min(1000, Number.parseInt(first(raw.pagina) ?? "1", 10) || 1));
  const list = await getAtRiskStudents(ctx, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, signal });
  const signals = RISK_SIGNALS.filter((key) => key !== "cobros" || ctx.can.finance);

  const href = (changes: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { rango: first(raw.rango) ? ctx.range.key : undefined, senal: signal ?? undefined, ...changes };
    for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value);
    const query = params.toString();
    return `/dashboard/analitica/riesgo${query ? `?${query}` : ""}`;
  };
  const ranges = [
    { key: "semana", label: "Esta semana" },
    { key: "mes", label: "Este mes" },
    ...(ctx.period ? [{ key: "periodo", label: "Este período" }] : []),
  ].map((option) => ({ ...option, href: href({ rango: option.key, pagina: undefined }) }));
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-8">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Estudiantes en riesgo</h1>
          <p className="mt-1 text-sm text-slate-600">
            Quienes reúnen señales de alerta en sus cursos activos. La asistencia se cuenta en {ctx.range.label.toLowerCase()}; las tareas vencidas, las notas y el avance, en todo el curso.
          </p>
        </div>
        <RangeSwitch options={ranges} current={ctx.range.key} />
      </header>

      <nav aria-label="Filtrar por señal" className="flex flex-wrap gap-2">
        <Link href={href({ senal: undefined, pagina: undefined })} aria-current={!signal ? "true" : undefined} className={chip(!signal)}>Todas las señales</Link>
        {signals.map((key) => (
          <Link key={key} href={href({ senal: key, pagina: undefined })} aria-current={signal === key ? "true" : undefined} className={chip(signal === key)}>
            {RISK_SIGNAL_NAMES[key]} ({formatCount(list.counts[key])})
          </Link>
        ))}
      </nav>

      <section aria-labelledby="lista-riesgo" className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 id="lista-riesgo" className="mb-3 text-lg font-bold" style={{ color: NAVY }}>
          {list.total === 0 ? "Nadie con esta señal" : `${formatCount(list.total)} ${list.total === 1 ? "estudiante" : "estudiantes"}`}
        </h2>
        {list.rows.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {signal ? "Ningún estudiante tiene esta señal ahora. Prueba con otra señal o con otro período." : "Ningún estudiante tiene señales de alerta por ahora. La lista se llena sola con la asistencia, las tareas y las notas."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.rows.map((row) => (
              <li key={row.studentId} className="flex flex-col gap-2 py-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  {ctx.can.personLink ? (
                    <Link href={`/dashboard/gestion/personas/${row.studentId}`} className="inline-flex min-h-11 items-center font-semibold text-slate-900 underline-offset-2 hover:underline md:min-h-0">{row.name}</Link>
                  ) : (
                    <span className="font-semibold text-slate-900">{row.name}</span>
                  )}
                  <p className="text-xs text-slate-500">
                    {row.courses === 1 ? "1 curso" : `${row.courses} cursos`}, asistencia {row.classes > 0 ? `${formatPercent((row.attended / row.classes) * 100)} (${row.attended} de ${row.classes})` : NO_DATA}, avance {formatPercent(row.averageProgress)}
                  </p>
                </div>
                <ul className="flex flex-wrap gap-1.5 md:max-w-[55%] md:justify-end" aria-label={`Señales de ${row.name}`}>
                  {row.signals.map((key) => <li key={key}><Tag>{riskSignalLabel(key, row)}</Tag></li>)}
                </ul>
              </li>
            ))}
          </ul>
        )}
        {pages > 1 && (
          <nav aria-label="Páginas" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-slate-600">Página {page} de {pages}</span>
            <span className="flex gap-2">
              {page > 1 && <Link href={href({ pagina: String(page - 1) })} className={chip(false)}>Anterior</Link>}
              {page < pages && <Link href={href({ pagina: String(page + 1) })} className={chip(false)}>Siguiente</Link>}
            </span>
          </nav>
        )}
      </section>
    </div>
  );
}

function chip(active: boolean) {
  return `inline-flex min-h-11 items-center rounded-full border px-3 text-sm font-semibold ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"}`;
}
