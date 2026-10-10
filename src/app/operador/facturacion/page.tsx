import Link from "next/link";
import { notFound } from "next/navigation";
import { getOperatorEmail } from "@/server/platform/operator-session";
import { listPlatformInvoices } from "@/server/platform/invoices";
import { formatMoney, formatOperatorDay } from "../format";

export const dynamic = "force-dynamic";

const FILTERS = [["OPEN", "Abiertas"], ["OVERDUE", "Vencidas"], ["PAID", "Pagadas"], ["VOID", "Anuladas"], ["ALL", "Todas"]] as const;
const TONE = { Pagada: "bg-emerald-50 text-emerald-800", Anulada: "bg-slate-200 text-slate-700", Vencida: "bg-red-50 text-red-800", Abierta: "bg-slate-100 text-slate-800" };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const operator = await getOperatorEmail(); if (!operator) notFound();
  const { estado = "OPEN" } = await searchParams;
  const filter = FILTERS.some(([value]) => value === estado) ? estado : "OPEN";
  const { invoices, totals } = await listPlatformInvoices(operator, filter);
  const now = new Date();
  return <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-8">
    <header>
      <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Facturación</h1>
      <p className="mt-1 text-sm text-slate-600">Facturas de las instituciones por su plan. El cobro se registra a mano desde la ficha de cada institución.</p>
    </header>
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-medium text-slate-600">Por cobrar este mes</h2>
      {totals.length ? totals.map((total) => <p key={total.currency} className="mt-1 text-2xl font-bold text-slate-950">{formatMoney(total._sum.amountCents ?? 0, total.currency)}</p>)
        : <p className="mt-1 text-sm text-slate-700">No hay cobros abiertos con vencimiento este mes.</p>}
    </section>
    <form className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3">
      <label className="grow text-sm text-slate-700">Mostrar
        <select name="estado" defaultValue={filter} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base">
          {FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
      <button className="min-h-11 shrink-0 rounded-lg border border-slate-300 bg-white px-4 font-semibold text-slate-800">Filtrar</button>
    </form>
    {!invoices.length && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-700">No hay facturas con este estado.</p>}
    <ul className="space-y-3">{invoices.map((invoice) => {
      const status = invoice.status === "PAID" ? "Pagada" : invoice.status === "VOID" ? "Anulada" : invoice.dueDate < now ? "Vencida" : "Abierta";
      return <li key={invoice.id}><article className="space-y-1 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline" href={`/operador/${invoice.institutionId}`}>{invoice.institution.name}</Link>
          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${TONE[status]}`}>{status}</span>
        </div>
        <p className="text-lg font-bold text-slate-950">{formatMoney(invoice.amountCents, invoice.currency)}</p>
        <p className="text-sm text-slate-700">{status === "Vencida" ? "Venció el" : "Vence el"} {formatOperatorDay(invoice.dueDate)}</p>
      </article></li>;
    })}</ul>
    {invoices.length === 200 && <p className="text-sm text-slate-600">Se muestran las primeras 200 facturas. Usa el filtro para acotar la lista.</p>}
  </div>;
}
