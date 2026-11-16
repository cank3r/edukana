import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getOperatorEmail } from "@/server/platform/operator-session";
import { SupportForm } from "./vista/SupportForm";

export async function SupportSection({ institutionId }: { institutionId: string }) {
  if (!await getOperatorEmail()) notFound();
  const institution = await db.institution.findUnique({ where: { id: institutionId }, select: { name: true } });
  if (!institution) notFound();
  return <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
    <h2 className="text-lg font-semibold" style={{ color: "var(--navy)" }}>Soporte</h2>
    <p className="text-sm text-slate-700">Consulta las cifras y pendientes del inicio de administración durante 30 minutos.
      La vista es de solo lectura. La entrada y la salida quedan registradas.</p>
    <SupportForm institutionId={institutionId} name={institution.name} />
  </section>;
}
