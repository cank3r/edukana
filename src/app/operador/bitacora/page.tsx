import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getOperatorEmail } from "@/server/platform/operator-session";
import { listAuditLog, type AuditFilters } from "@/server/platform/audit-log";
import { formatOperatorDateTime } from "../format";
export const dynamic = "force-dynamic";
const control = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950";

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const email = await getOperatorEmail();
  if (!email) notFound();
  const params = await searchParams;
  const filters: AuditFilters = {};
  for (const key of ["institutionId", "action", "operator", "from", "to", "cursor"] as const) {
    if (typeof params[key] === "string") filters[key] = params[key];
  }
  let error = "";
  let result: Awaited<ReturnType<typeof listAuditLog>> = null;
  try { result = await listAuditLog(email, filters); }
  catch (cause) {
    if (cause instanceof Error && /^(Revisa las fechas|La página de la bitácora)/.test(cause.message)) error = cause.message;
    else throw cause;
  }
  const institutions = await db.institution.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: 250 });
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value && key !== "cursor") next.set(key, value);
  if (result?.nextCursor) next.set("cursor", result.nextCursor);
  return <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-8">
    <header><h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Bitácora</h1>
      <p className="text-sm text-slate-600">Consulta quién hizo cada cambio. Las horas se muestran en hora de Santo Domingo; el filtro «Desde» y «Hasta» cuenta días completos en UTC.</p></header>
    <form className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
      <label className="text-sm">Institución<select name="institutionId" defaultValue={filters.institutionId ?? ""} className={control}>
        <option value="">Todas las instituciones</option>{institutions.map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}
      </select></label>
      <label className="text-sm">Acción<input name="action" list="audit-actions" defaultValue={filters.action ?? "PLATFORM_*"} className={control} />
        <datalist id="audit-actions"><option value="PLATFORM_*">Acciones de plataforma</option><option value="all">Todas las acciones</option>
          <option value="PLATFORM_SUPPORT_ENTERED" /><option value="PLATFORM_SUPPORT_EXITED" /></datalist>
        <span className="text-xs text-slate-600">PLATFORM_* para plataforma, all para todas o el nombre exacto.</span>
      </label>
      <label className="text-sm">Correo del operador<input type="email" name="operator" defaultValue={filters.operator ?? ""} maxLength={254} className={control} /></label>
      <div className="grid grid-cols-2 gap-2"><label className="text-sm">Desde<input type="date" name="from" defaultValue={filters.from ?? ""} className={control} /></label>
        <label className="text-sm">Hasta<input type="date" name="to" defaultValue={filters.to ?? ""} className={control} /></label></div>
      <button className="min-h-11 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">Filtrar</button>
      <Link href="/operador/bitacora" className="inline-flex min-h-11 items-center justify-center text-blue-700 underline">Limpiar filtros</Link>
    </form>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">{error}</p>}
    {result && !result.rows.length && <p className="rounded-xl border border-dashed border-slate-300 p-4 text-slate-700">No hay registros con estos filtros. Cambia las fechas o limpia los filtros.</p>}
    <ol className="space-y-3">{result?.rows.map((row) => <li key={row.id} className="space-y-1 rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-600"><time dateTime={row.createdAt.toISOString()}>{formatOperatorDateTime(row.createdAt)}</time></p>
      <p className="break-all font-semibold text-slate-950">{row.operator}</p>
      <p className="break-all text-sm text-slate-700">{row.action}</p>
      <p className="break-words text-sm text-slate-700">{row.institutionName} · {row.entity}</p>
      {row.href && <Link href={row.href} className="inline-flex min-h-11 items-center text-sm text-blue-700 underline">Ver {row.entity === "Institution" ? "institución" : "registro relacionado"}</Link>}
    </li>)}</ol>
    {result?.nextCursor && <Link href={`/operador/bitacora?${next}`} className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 font-semibold text-slate-950">Ver registros anteriores</Link>}
  </div>;
}
