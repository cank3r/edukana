import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { listChargeOptions, listCharges } from "@/server/finance/charges";
import { formatMoney } from "@/server/finance/money";
import { ChargeItem, CreatePanel } from "./ChargeTools";
import { STATUS_LABEL } from "./labels";

export const dynamic = "force-dynamic";

const field = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-500";
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] ?? "" : value ?? "");

export default async function PagosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!capabilities.has("finance.manage")) redirect("/dashboard");

  const params = await searchParams;
  const filters = { query: one(params.q).slice(0, 80), status: one(params.estado), periodId: one(params.periodo) };
  if (!Object.hasOwn(STATUS_LABEL, filters.status)) filters.status = "";
  const actor = { id: user.id, institutionId: user.institutionId, role: user.role };
  const [data, options] = await Promise.all([listCharges(actor, filters), listChargeOptions(actor)]);
  if (!data || !options) redirect("/dashboard");

  const filtering = Boolean(filters.query || filters.status || filters.periodId);
  const money = (cents: number) => formatMoney(cents, data.currency);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Cobros</h1>
        <p className="mt-1 text-sm text-slate-600">Crea cargos, registra los pagos que recibes y mira quién debe.</p>
      </header>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: "Por cobrar", value: money(data.summary.receivableCents), note: "Todo lo que aún se debe" },
          { label: "Vencido", value: money(data.summary.overdueCents), note: "Ya pasó su fecha de vencimiento" },
          { label: "Cobrado este mes", value: money(data.summary.collectedThisMonthCents), note: "Pagos recibidos en el mes" },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <dt className="text-xs font-medium text-slate-600">{item.label}</dt>
            <dd className="mt-1 text-2xl font-bold text-slate-950">{item.value}</dd>
            <dd className="text-xs text-slate-500">{item.note}</dd>
          </div>
        ))}
      </dl>

      <CreatePanel periods={options.periods} targets={options.targets} currency={data.currency} startOpen={data.total === 0} />

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="cargos">
        <h2 id="cargos" className="text-lg font-bold text-slate-950">Cargos ({data.matching})</h2>

        {data.total === 0 ? (
          <p className="mt-2 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
            Todavía no hay cargos. Un cargo es lo que un estudiante debe pagar, por ejemplo una mensualidad. Empieza con «Crear cargo».
          </p>
        ) : (
          <>
            <form method="get" className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
              <div>
                <label className="sr-only" htmlFor="filtro-estudiante">Buscar por estudiante</label>
                <input id="filtro-estudiante" type="search" name="q" defaultValue={filters.query} placeholder="Buscar por estudiante…" className={field} autoComplete="off" />
              </div>
              <div>
                <label className="sr-only" htmlFor="filtro-estado">Estado</label>
                <select id="filtro-estado" name="estado" defaultValue={filters.status} className={field}>
                  <option value="">Todos los estados</option>
                  {Object.entries(STATUS_LABEL).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
                </select>
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
            {filtering && (
              <p className="mt-2 text-sm text-slate-600">
                Mostrando {data.matching} de {data.total}.{" "}
                <Link className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline" href="/dashboard/pagos">Quitar filtros</Link>
              </p>
            )}

            {data.charges.length === 0 ? (
              <p className="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Ningún cargo coincide con esa búsqueda. Prueba con otro nombre o quita los filtros.</p>
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
            {data.matching > data.charges.length && (
              <p className="mt-3 text-sm text-slate-600">Se muestran los primeros {data.charges.length}. Usa la búsqueda o los filtros para ver los demás.</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
