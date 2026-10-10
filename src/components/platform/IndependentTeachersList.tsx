import Link from "next/link";
import { notFound } from "next/navigation";
import { getOperatorEmail } from "@/server/platform/operator-session";
import { listIndependentTeachers } from "@/server/platform/independent-report";
import { formatMoney } from "@/server/finance/money";

export async function IndependentTeachersList({ query = "" }: { query?: string }) {
  const rows = await listIndependentTeachers(await getOperatorEmail(), query);
  if (!rows) notFound();
  return <section aria-label="Docentes independientes" className="space-y-3">
    <p className="text-sm text-slate-600">Hasta 200 espacios, del más reciente al más antiguo. Ventas pagadas del mes (UTC).</p>
    {rows.length === 0 && <p>No hay docentes independientes que coincidan con la búsqueda.</p>}
    <ul className="space-y-3">{rows.map((row) => <li key={row.id} className="rounded-xl border border-slate-200 bg-white p-4">
      <Link href={`/operador/${row.id}`} className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline">{row.teacherName}</Link>
      <p className="text-sm">{row.name}</p>
      <p className="break-all text-sm text-slate-600">{row.email ?? "Sin correo de administración"}</p>
      <p className="text-sm">{row.publishedCourses} cursos públicos publicados · Alta: {row.createdAt.toLocaleDateString("es-DO", { timeZone: "UTC" })}</p>
      <p className="text-sm">Ventas del mes: {row.sales.length ? row.sales.map((sale) =>
        `${formatMoney(sale.amountCents, sale.currency)} (${sale.count} pedidos)`).join(" · ") : "Sin ventas pagadas"}</p>
    </li>)}</ul>
  </section>;
}
