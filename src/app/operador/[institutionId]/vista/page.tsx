import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getOperatorEmail } from "@/server/platform/operator-session";
import { readSupportView, SUPPORT_COOKIE } from "@/server/platform/support";
import { ReadOnlyHome } from "./ReadOnlyHome";
import { SupportFrame } from "./SupportFrame";
export const dynamic = "force-dynamic";

export default async function SupportPage({ params }: { params: Promise<{ institutionId: string }> }) {
  const email = await getOperatorEmail();
  if (!email) notFound();
  const { institutionId } = await params;
  const view = await readSupportView(email, (await cookies()).get(SUPPORT_COOKIE)?.value, institutionId);
  if (!view) return <div className="space-y-3 p-4 sm:p-8">
    <h1 className="text-xl font-bold text-slate-950">La vista de soporte no está activa</h1>
    <p className="text-slate-700">Pudo terminar o no haberse confirmado. Abre una nueva vista desde la ficha.</p>
    <Link href={`/operador/${encodeURIComponent(institutionId)}`} className="inline-flex min-h-11 items-center text-blue-700 underline">Volver a la institución</Link>
  </div>;
  return <SupportFrame name={view.home.institutionName} expiresAt={view.expiresAt.toISOString()}><ReadOnlyHome home={view.home} /></SupportFrame>;
}
