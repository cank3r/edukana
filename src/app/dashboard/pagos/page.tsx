import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { CHARGE_VIEWS, listChargeOptions, listCharges, type ChargeView } from "@/server/finance/charges";
import { formatMoney } from "@/server/finance/money";
import { ChargeItem, CreatePanel } from "./ChargeTools";

export const dynamic = "force-dynamic";

const field = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-500";
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] ?? "" : value ?? "");
const VIEW_LABEL: Record<ChargeView, string> = { vencidos: "Vencidos", "por-cobrar": "Por cobrar", pagados: "Pagados", todos: "Todos" };
const EMPTY_VIEW: Record<ChargeView, string> = {
  vencidos: "No hay cargos vencidos. Todo lo que se debe está al día.",
  "por-cobrar": "No hay nada por cobrar: todos los cargos están pagados o anulados.",
  pagados: "Todavía no hay cargos pagados.",
  todos: "Ningún cargo coincide con esa búsqueda.",
};
/** Estados antiguos en el enlace (`?estado=OVERDUE`) siguen funcionando. */
const OLD_STATUS: Record<string, ChargeView> = { OVERDUE: "vencidos", PENDING: "por-cobrar", PARTIAL: "por-cobrar", PAID: "pagados" };

export default async function PagosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!capabilities.has("finance.manage")) redirect("/dashboard");

  const params = await searchParams;
  const asked = one(params.estado);
  const view: ChargeView = (CHARGE_VIEWS as readonly string[]).includes(asked) ? (asked as ChargeView) : OLD_STATUS[asked] ?? "por-cobrar";
  const filters = { query: one(params.q).slice(0, 80), view, periodId: one(params.periodo), page: Number(one(params.pagina)) || 1 };
  const actor = { id: user.id, institutionId: user.institutionId, role: user.role };
  const [data, options] = await Promise.all([listCharges(actor, filters), listChargeOptions(actor)]);
  if (!data || !options) redirect("/dashboard");

  const searching = Boolean(filters.query || filters.periodId);
  const money = (cents: number) => formatMoney(cents, data.currency);
  /** Enlace a la lista conservando la búsqueda; la página vuelve a 1 salvo que se pida otra. */
  const href = (changes: { estado?: ChargeView; pagina?: number }) => {
    const query = new URLSearchParams();
    if (filters.query) query.set("q", filters.query);
    if (filters.periodId) query.set("periodo", filters.periodId);
    const nextView = changes.estado ?? data.view;
    if (nextView !== "por-cobrar") query.set("estado", nextView);
    if (changes.pagina && changes.pagina > 1) query.set("pagina", String(changes.pagina));
    const text = query.toString();
    return `/dashboard/pagos${text ? `?${text}` : ""}`;
  };
  const first = data.matching === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const last = (data.page - 1) * data.pageSize + data.charges.length;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Cobros</h1>
        <p className="mt-1 text-sm text-slate-600">Crea cargos, registra los pagos que recibes y mira quién debe.</p>
      </header>

      <dl className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
        {[
          { label: "Vencido", value: money(data.summary.overdueCents), note: "Ya pasó su fecha de vencimiento", tone: data.summary.overdueCents > 0 ? "text-red-700" : "text-slate-950" },
          { label: "Por cobrar", value: money(data.summary.receivableCents), note: "Todo lo que aún se debe, con lo vencido", tone: "text-slate-950" },
          { label: "Cobrado este mes", value: money(data.summary.collectedThisMonthCents), note: "Pagos recibidos en el mes", tone: "text-emerald-700" },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <dt className="text-xs font-medium text-slate-600">{item.label}</dt>
            <dd className={`mt-1 text-2xl font-bold ${item.tone}`}>{item.value}</dd>
            <dd className="text-xs text-slate-500">{item.note}</dd>
          </div>
        ))}
      </dl>

      <CreatePanel periods={options.periods} targets={options.targets} currency={data.currency} startOpen={data.total === 0} />

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="cargos">
        <h2 id="cargos" className="text-lg font-bold text-slate-950">Cargos</h2>

        {data.total === 0 ? (
          <p className="mt-2 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
            Todavía no hay cargos. Un cargo es lo que un estudiante debe pagar, por ejemplo una mensualidad. Empieza con «Crear cargo».
          </p>
        ) : (
          <>
            <nav aria-label="Qué cargos ver" className="mt-3 flex flex-wrap gap-2">
              {CHARGE_VIEWS.map((item) => (
                <Link
                  key={item}
                  href={href({ estado: item })}
                  aria-current={data.view === item ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold ${data.view === item ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-800 hover:border-blue-500"}`}
                >
                  {VIEW_LABEL[item]}
                  <span className={`rounded-full px-2 text-xs ${data.view === item ? "bg-white/20" : item === "vencidos" && data.counts.vencidos > 0 ? "bg-red-50 text-red-800" : "bg-slate-100 text-slate-700"}`}>{data.counts[item].toLocaleString("es-DO")}</span>
                </Link>
              ))}
            </nav>
            <form method="get" className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
              {data.view !== "por-cobrar" && <input type="hidden" name="estado" value={data.view} />}
              <div>
                <label className="sr-only" htmlFor="filtro-estudiante">Buscar por estudiante</label>
                <input id="filtro-estudiante" type="search" name="q" defaultValue={filters.query} placeholder="Buscar por estudiante…" className={field} autoComplete="off" />
              </div>
              {options.periods.length > 0 && (
                <div>
                  <label className="sr-only" htmlFor="filtro-periodo">Período</label>
                  <select id="filtro-periodo" name="periodo" defaultValue={filters.periodId} className={field}>
                    <option value="">Todos los períodos</option>
                    {options.periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}
                  </select>
                </div>
              )}
              <button type="submit" className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800">Buscar</button>
            </form>
            <p className="mt-2 text-sm text-slate-600">
              {data.matching === 0 ? "Sin cargos en esta vista." : `Mostrando ${first.toLocaleString("es-DO")}–${last.toLocaleString("es-DO")} de ${data.matching.toLocaleString("es-DO")}.`}
              {data.view !== "todos" && data.view !== "pagados" && data.matching > 0 && " Primero lo vencido, luego lo que vence antes."}
              {searching && <>{" "}<Link className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline" href={data.view === "por-cobrar" ? "/dashboard/pagos" : `/dashboard/pagos?estado=${data.view}`}>Quitar búsqueda</Link></>}
            </p>

            {data.charges.length === 0 ? (
              <div className="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
                <p>{searching ? "Ningún cargo coincide con esa búsqueda en esta vista. Prueba con otro nombre o mira «Todos»." : EMPTY_VIEW[data.view]}</p>
                {data.view !== "todos" && <Link className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline" href={href({ estado: "todos" })}>Ver todos los cargos</Link>}
              </div>
            ) : (
              <ul className="mt-3 space-y-3 md:space-y-0 md:divide-y md:divide-slate-100">
                {data.charges.map((charge) => (
                  <ChargeItem
                    key={charge.id}
                    todayKey={data.todayKey}
                    charge={{
                      id: charge.id,
                      studentName: charge.studentName,
                      concept: charge.concept,
                      periodName: charge.periodName,
                      currency: charge.currency,
                      amountCents: charge.amountCents,
                      paidCents: charge.paidCents,
                      balanceCents: charge.balanceCents,
                      dueKey: charge.dueKey,
                      status: charge.status,
                      cancelReason: charge.cancelReason,
                      payments: charge.payments,
                    }}
                  />
                ))}
              </ul>
            )}
            {data.pages > 1 && (
              <nav aria-label="Páginas de cargos" className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
                {data.page > 1
                  ? <Link className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 font-semibold text-slate-800" href={href({ pagina: data.page - 1 })}>Anterior</Link>
                  : <span />}
                <span className="text-sm text-slate-600">Página {data.page} de {data.pages}</span>
                {data.page < data.pages
                  ? <Link className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 font-semibold text-slate-800" href={href({ pagina: data.page + 1 })}>Siguiente</Link>
                  : <span />}
              </nav>
            )}
          </>
        )}
      </section>
    </div>
  );
}
