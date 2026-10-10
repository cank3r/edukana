import Link from "next/link";
import { notFound } from "next/navigation";
import { getOperatorEmail } from "@/server/platform/operator-session";
import { getPlatformMetrics, type AttentionInstitution } from "@/server/platform/metrics";
import { formatCount, formatMoney } from "../format";

/** Una fila por institución: si está en varias listas (por ejemplo, suspendida y con el plan vencido), junta los motivos. */
function groupAttention(items: AttentionInstitution[]) {
  const byId = new Map<string, { id: string; name: string; reasons: string[] }>();
  for (const item of items) {
    const current = byId.get(item.id);
    if (!current) byId.set(item.id, { id: item.id, name: item.name, reasons: [item.reason] });
    else if (!current.reasons.includes(item.reason)) current.reasons.push(item.reason);
  }
  return [...byId.values()];
}

export const dynamic = "force-dynamic";

export default async function PlatformDashboard() {
  const metrics = await getPlatformMetrics(await getOperatorEmail());
  if (!metrics) notFound();
  const attention = groupAttention(metrics.attention);
  const cards = [
    ["Instituciones activas", metrics.institutions - metrics.independent],
    ["Docentes independientes activos", metrics.independent],
    ["Estudiantes activos", metrics.students], ["Docentes activos", metrics.teachers],
    ["Altas en 7 días", metrics.signups7], ["Altas en 30 días", metrics.signups30],
    ["Pedidos de IA este mes", metrics.aiRequests], ["Tokens de IA este mes", metrics.aiTokens],
    ["Sin actividad registrada en 14 días", metrics.inactive14],
  ] as const;
  return <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
    <header className="space-y-2"><h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Tablero del negocio</h1>
      <p className="text-sm text-slate-600">Un vistazo a Edukana. Los períodos mensuales se calculan en UTC.</p>
      <Link href="/operador" className="inline-flex min-h-11 items-center rounded-lg bg-blue-700 px-4 font-semibold text-white">Ver instituciones</Link>
    </header>
    <section aria-label="Resumen del negocio" className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-3">
      {cards.map(([label, value]) => <article key={label} className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-2xl font-bold" style={{ color: "var(--navy)" }}>{formatCount(value)}</p>
        <h2 className="text-sm text-slate-700">{label}</h2>
      </article>)}
    </section>
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-semibold" style={{ color: "var(--navy)" }}>Ventas del catálogo este mes</h2>
      {metrics.sales.length ? metrics.sales.map((sale) => <p key={sale.currency}>
        <span className="font-semibold text-slate-950">{formatMoney(sale.amountCents, sale.currency)}</span> · {formatCount(sale.count)} {sale.count === 1 ? "pedido pagado" : "pedidos pagados"}
      </p>) : <p className="text-sm text-slate-600">Todavía no hay pedidos pagados este mes.</p>}
    </section>
    <section className="space-y-3"><h2 className="text-lg font-semibold" style={{ color: "var(--navy)" }}>Instituciones que requieren atención</h2>
      <p className="text-sm text-slate-600">La actividad se basa en operaciones registradas. Los accesos anteriores a este tablero no se registraban; una entrada sin registro no confirma que nadie haya entrado.</p>
      {attention.length ? <ul className="space-y-2">{attention.map((item) => <li key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
        <Link href={`/operador/${item.id}`} className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline">{item.name}</Link>
        <ul className="flex flex-wrap gap-2" aria-label={`Motivos para ${item.name}`}>{item.reasons.map((reason) =>
          <li key={reason} className="rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-900">{reason}</li>)}</ul>
      </li>)}</ul> : <p className="rounded-xl border border-dashed p-4 text-sm text-slate-600">No hay instituciones que requieran atención por estos motivos.</p>}
    </section>
  </div>;
}
