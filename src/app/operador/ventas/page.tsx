import Link from "next/link";
import { notFound } from "next/navigation";
import { getOperatorEmail } from "@/server/platform/operator-session";
import { getPlatformSales } from "@/server/platform/sales";
import { formatMoney } from "@/server/finance/money";

export const dynamic = "force-dynamic";
export default async function PlatformSalesPage() {
  const sales = await getPlatformSales(await getOperatorEmail());
  if (!sales) notFound();
  return <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-8">
    <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Ventas del catálogo</h1>
    <p className="text-sm text-slate-600">Pedidos pagados este mes (UTC). Comisión estimada con el porcentaje actual de cada institución;
      no representa una liquidación ni cambia el cobro al comprador. Cada moneda se muestra por separado.</p>
    {sales.length === 0 && <p>No hay ventas pagadas este mes.</p>}
    <ul className="space-y-3">{sales.map((sale) => <li key={`${sale.institutionId}:${sale.currency}`}
      className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
      <Link href={`/operador/${sale.institutionId}`} className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline">{sale.name}</Link>
      <p>{sale.count} pedidos · {sale.currency}</p>
      <dl className="grid gap-3 sm:grid-cols-3">
        <div><dt>Bruto</dt><dd className="font-semibold">{formatMoney(sale.grossCents, sale.currency)}</dd></div>
        <div><dt>Comisión ({sale.commissionPercent}%)</dt><dd>{formatMoney(sale.commissionCents, sale.currency)}</dd></div>
        <div><dt>Neto</dt><dd>{formatMoney(sale.netCents, sale.currency)}</dd></div>
      </dl>
    </li>)}</ul>
  </div>;
}
