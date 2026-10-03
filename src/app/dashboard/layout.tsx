import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Sidebar from "@/components/dashboard/Sidebar";
import DashboardBreadcrumbs from "@/components/dashboard/DashboardBreadcrumbs";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return (
    <div className="flex h-screen flex-col overflow-hidden md:flex-row" style={{ background: "var(--cloud)" }}>
      <a className="skip-link" href="#contenido-principal">Saltar al contenido principal</a>
      <Sidebar user={session.user} />
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <DashboardBreadcrumbs />
        <main id="contenido-principal" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
