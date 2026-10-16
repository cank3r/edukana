import Link from "next/link";
import { notFound } from "next/navigation";
import { getOperatorEmail } from "@/server/platform/operator-session";
import { getPlatformMetrics } from "@/server/platform/metrics";

export const dynamic = "force-dynamic";

export default async function PlatformDashboard() {
  const metrics = await getPlatformMetrics(await getOperatorEmail());
  if (!metrics) notFound();
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
        <p className="text-2xl font-bold" style={{ color: "var(--navy)" }}>{value.toLocaleString("es-DO")}</p>
        <h2 className="text-sm text-slate-700">{label}</h2>
      </article>)}
    </section>
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-semibold" style={{ color: "var(--navy)" }}>Ventas del catálogo este mes</h2>
      {metrics.sales.length ? metrics.sales.map((sale) => <p key={sale.currency}>
        {new Intl.NumberFormat("es-DO", { style: "currency", currency: sale.currency }).format(sale.amountCents / 100)} · {sale.count} pedidos pagados
      </p>) : <p className="text-sm text-slate-600">Todavía no hay pedidos pagados este mes.</p>}
    </section>
    <section className="space-y-3"><h2 className="text-lg font-semibold" style={{ color: "var(--navy)" }}>Instituciones que requieren atención</h2>
      <p className="text-sm text-slate-600">La actividad se basa en operaciones registradas. Los accesos anteriores a este tablero no se registraban; una entrada sin registro no confirma que nadie haya entrado.</p>
      {metrics.attention.length ? <ul className="space-y-2">{metrics.attention.map((item) => <li key={`${item.id}-${item.reason}`} className="rounded-xl border border-slate-200 bg-white p-4">
        <Link href={`/operador/${item.id}`} className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline">{item.name}</Link>
        <p className="text-sm text-slate-700">{item.reason}</p>
      </li>)}</ul> : <p className="rounded-xl border border-dashed p-4 text-sm text-slate-600">No hay instituciones que requieran atención por estos motivos.</p>}
    </section>
  </div>;
}
