import Link from "next/link";
import { notFound } from "next/navigation";
import { getOperatorEmail } from "@/server/platform/operator-session";
import { getPlatformSales } from "@/server/platform/sales";
import { formatCount, formatMoney } from "../format";

export const dynamic = "force-dynamic";
export default async function PlatformSalesPage() {
  const sales = await getPlatformSales(await getOperatorEmail());
  if (!sales) notFound();
  return <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-8">
    <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Ventas del catálogo</h1>
    <p className="text-sm text-slate-600">Pedidos pagados este mes (UTC). Comisión estimada con el porcentaje actual de cada institución;
      no representa una liquidación ni cambia el cobro al comprador. Cada moneda se muestra por separado.</p>
    {sales.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-700">No hay ventas pagadas este mes.</p>}
    <ul className="space-y-3">{sales.map((sale) => <li key={`${sale.institutionId}:${sale.currency}`}
      className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
      <Link href={`/operador/${sale.institutionId}`} className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline">{sale.name}</Link>
      <p className="text-sm text-slate-700">{formatCount(sale.count)} {sale.count === 1 ? "pedido pagado" : "pedidos pagados"}</p>
      <dl className="grid gap-3 sm:grid-cols-3">
        <div><dt className="text-sm text-slate-600">Bruto</dt><dd className="font-semibold">{formatMoney(sale.grossCents, sale.currency)}</dd></div>
        <div><dt className="text-sm text-slate-600">Comisión ({sale.commissionPercent} %)</dt><dd>{formatMoney(sale.commissionCents, sale.currency)}</dd></div>
        <div><dt className="text-sm text-slate-600">Neto</dt><dd>{formatMoney(sale.netCents, sale.currency)}</dd></div>
      </dl>
    </li>)}</ul>
  </div>;
}
