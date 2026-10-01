import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { InstitutionForm } from "@/components/dashboard/MutationForms";
import { Settings } from "lucide-react";

export default async function ConfiguracionPage() {
  const session = await auth();
  const user = session!.user;
  if (!["ADMIN", "SUPER_ADMIN"].includes(user.role)) redirect("/dashboard");
  const institution = await db.institution.findFirst({ where: { id: user.institutionId } });
  if (!institution) redirect("/dashboard");
  const plan = { FREE: "Plan gratuito", STARTER: "Plan básico", PRO: "Plan profesional", ENTERPRISE: "Plan empresarial" }[institution.plan];

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8"><div className="mb-8"><h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Configuración</h1><p className="mt-1 text-sm text-slate-500">Información y preferencias de tu institución</p></div>
      <div className="mb-6 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white"><Settings size={18} /></div><div><p className="text-sm font-semibold text-blue-700">{plan}</p><p className="text-xs text-blue-600">Configuración compatible con el nivel gratuito de Supabase y Vercel.</p></div></div>
      <InstitutionForm institution={{ name: institution.name, type: institution.type, domain: institution.domain, timezone: institution.timezone, language: institution.language }} />
      <dl className="mt-6 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Identificador</dt><dd className="font-mono text-xs">{institution.slug}</dd></div><div><dt className="text-slate-500">Creada</dt><dd>{new Intl.DateTimeFormat("es", { dateStyle: "long" }).format(institution.createdAt)}</dd></div></dl>
    </div>
  );
}
