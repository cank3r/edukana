import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Sidebar from "@/components/dashboard/Sidebar";
import DashboardBreadcrumbs from "@/components/dashboard/DashboardBreadcrumbs";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { brandCssVariables } from "@/server/platform/brand-color";
import { getInstitutionBranding } from "@/server/platform/branding";
import { getOperatorEmail } from "@/server/platform/operator-session";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const capabilities = await getEffectiveCapabilities(session.user.institutionId, session.user.role);
  const branding = await getInstitutionBranding(session.user.institutionId);
  const isPlatformOperator = Boolean(await getOperatorEmail());
  return (
    <div className="flex h-screen flex-col overflow-hidden md:flex-row" style={{ background: "var(--cloud)", ...brandCssVariables(branding?.brandColor) } as React.CSSProperties}>
      <a className="skip-link" href="#contenido-principal">Saltar al contenido principal</a>
      <Sidebar user={session.user} capabilities={[...capabilities]}
        institution={branding ? { name: branding.name, logoUrl: branding.logoUrl } : undefined} isPlatformOperator={isPlatformOperator} />
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <DashboardBreadcrumbs />
        <main id="contenido-principal" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
