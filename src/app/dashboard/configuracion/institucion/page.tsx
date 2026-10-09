import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { getInstitutionSettings, INSTITUTION_TYPE_OPTIONS, LANGUAGE_OPTIONS, timeZoneOptions } from "@/server/platform/institution-settings";
import { InstitutionSettingsForm } from "./InstitutionSettingsForm";

export const dynamic = "force-dynamic";

export default async function InstitutionSettingsPage() {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) redirect("/login");
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!capabilities.has("tenant.settings.manage")) redirect("/dashboard");
  const institution = await getInstitutionSettings(user.institutionId);
  if (!institution) redirect("/dashboard");
  const zones = timeZoneOptions(institution.timezone);

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Datos de la institución</h1>
        <p className="mt-1 text-sm text-slate-600">Lo básico de tu institución. Puedes cambiarlo cuando quieras.</p>
      </header>
      <InstitutionSettingsForm
        institution={{ name: institution.name, type: institution.type, timezone: institution.timezone, language: institution.language }}
        types={INSTITUTION_TYPE_OPTIONS.map((option) => ({ ...option }))}
        languages={LANGUAGE_OPTIONS.map((option) => ({ ...option }))}
        latinAmerica={zones.latinAmerica}
        otherZones={zones.rest}
      />
      <p className="text-sm text-slate-600">El logo todavía no se puede cambiar desde aquí.</p>
    </div>
  );
}
