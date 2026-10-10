import Link from "next/link";
import { notFound } from "next/navigation";
import { getOperatorEmail } from "@/server/platform/operator-session";
import { listPlatformInvoices } from "@/server/platform/invoices";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const operator = await getOperatorEmail(); if (!operator) notFound();
  const { estado = "OPEN" } = await searchParams;
  const filter = ["OPEN", "OVERDUE", "PAID", "VOID", "ALL"].includes(estado) ? estado : "OPEN";
  const { invoices, totals } = await listPlatformInvoices(operator, filter);
  return <main className="mx-auto max-w-5xl space-y-5 p-4"><h1 className="text-2xl font-bold text-[var(--navy)]">Facturación</h1>
    <section className="rounded-xl border bg-white p-4"><h2 className="font-semibold">Por cobrar este mes</h2>
      {totals.length ? totals.map((total) => <p key={total.currency}>{((total._sum.amountCents ?? 0) / 100).toFixed(2)} {total.currency}</p>)
        : <p>No hay cobros abiertos con vencimiento este mes.</p>}</section>
    <form className="flex flex-wrap gap-3"><label>Mostrar<select name="estado" defaultValue={filter} className="ml-2 min-h-11 rounded-lg border px-3">
      <option value="OPEN">Abiertas</option><option value="OVERDUE">Vencidas</option><option value="PAID">Pagadas</option>
      <option value="VOID">Anuladas</option><option value="ALL">Todas</option></select></label>
      <button className="min-h-11 rounded-lg bg-[var(--navy)] px-4 text-white">Filtrar</button></form>
    {!invoices.length && <p>No hay facturas con este estado.</p>}
    {invoices.map((invoice) => <article key={invoice.id} className="space-y-2 rounded-xl border bg-white p-4">
      <Link className="inline-flex min-h-11 items-center font-semibold underline" href={`/operador/${invoice.institutionId}`}>{invoice.institution.name}</Link>
      <p>{(invoice.amountCents / 100).toFixed(2)} {invoice.currency} · Vence {invoice.dueDate.toISOString().slice(0, 10)}</p>
      <p>{invoice.status === "PAID" ? "Pagada" : invoice.status === "VOID" ? "Anulada" : invoice.dueDate < new Date() ? "Vencida" : "Abierta"}</p>
    </article>)}
    {invoices.length === 200 && <p>Mostrando las primeras 200 facturas. Usa el filtro para acotar la lista.</p>}
  </main>;
}
