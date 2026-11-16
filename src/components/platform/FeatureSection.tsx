import { notFound } from "next/navigation";
import { getOperatorEmail } from "@/server/platform/operator-session";
import { getInstitutionFeatures } from "@/server/platform/features";
import { FeatureForm } from "./FeatureForm";

export async function FeatureSection({ institutionId }: { institutionId: string }) {
  if (!(await getOperatorEmail())) notFound();
  const features = await getInstitutionFeatures(institutionId);
  return <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="institution-features">
    <h2 id="institution-features" className="text-lg font-semibold" style={{ color: "var(--navy)" }}>Funciones</h2>
    <FeatureForm institutionId={institutionId} features={features} />
  </section>;
}
