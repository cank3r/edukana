import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getOperatorEmail } from "@/server/platform/operator-session";
import { settingsObject } from "@/server/platform/feature-policy";
import { safeBrandLogoUrl } from "@/server/platform/white-label";
import { BrandingForm } from "./BrandingForm";

export async function BrandingSection({ institutionId }: { institutionId: string }) {
  if (!(await getOperatorEmail())) notFound();
  const institution = await db.institution.findUnique({ where: { id: institutionId }, select: {
    name: true, logoUrl: true, brandColor: true, domain: true, settings: true,
  } });
  if (!institution) notFound();
  return <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="institution-brand">
    <h2 id="institution-brand" className="text-lg font-semibold text-slate-900">Marca</h2>
    <BrandingForm institutionId={institutionId} values={{ ...institution, logoUrl: safeBrandLogoUrl(institution.logoUrl),
      hideEdukanaBrand: settingsObject(settingsObject(institution.settings).platform).hideEdukanaBrand === true }} />
  </section>;
}
