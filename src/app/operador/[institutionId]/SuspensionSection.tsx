import { notFound } from "next/navigation";
import { getOperatorEmail } from "@/server/platform/operator-session";
import { getInstitutionSuspension } from "@/server/platform/suspension";
import { SuspensionForm } from "./SuspensionForm";

export async function SuspensionSection({ institutionId }: { institutionId: string }) {
  const institution = await getInstitutionSuspension(await getOperatorEmail(), institutionId);
  if (!institution) notFound();
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="institution-access-title">
      <h2 id="institution-access-title" className="text-lg font-semibold" style={{ color: "var(--navy)" }}>Acceso a la institución</h2>
      <p className={institution.status === "SUSPENDED" ? "font-semibold text-red-700" : "font-semibold text-emerald-700"}>
        {institution.status === "SUSPENDED" ? "Suspendida" : "Activa"}
      </p>
      {institution.suspendedReason && <p className="break-words text-sm text-slate-700">Motivo: {institution.suspendedReason}</p>}
      <SuspensionForm key={institution.status} institutionId={institution.id} name={institution.name} status={institution.status} />
    </section>
  );
}
