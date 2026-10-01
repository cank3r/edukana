import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdmissionForm } from "@/components/dashboard/MutationForms";
import { CheckCircle, Clock, UserPlus, XCircle } from "lucide-react";

const stageLabel = { INTERESTED: "Interesado", DOCUMENTS: "Documentos", REVIEW: "En revisión", ACCEPTED: "Aceptado", ENROLLED: "Matriculado", REJECTED: "Rechazado" };

export default async function AdmisionesPage() {
  const session = await auth();
  const user = session!.user;
  if (!["ADMIN", "COORDINATOR", "SUPER_ADMIN"].includes(user.role)) redirect("/dashboard");
  const applications = await db.admissionLead.findMany({ where: { institutionId: user.institutionId }, orderBy: { createdAt: "desc" }, take: 100 });
  const count = (stages: Array<keyof typeof stageLabel>) => applications.filter((item) => stages.includes(item.stage)).length;

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8"><div className="mb-8"><h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Admisiones</h1><p className="mt-1 text-sm text-slate-500">Pipeline de solicitudes de ingreso</p></div>
      <details className="mb-6"><summary className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-center text-sm font-semibold text-white">Nueva solicitud</summary><div className="mt-3"><AdmissionForm /></div></details>
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4"><Card label="Interesados" value={count(["INTERESTED", "DOCUMENTS"])} icon={<Clock size={18} />} color="#92400E" /><Card label="En revisión" value={count(["REVIEW"])} icon={<UserPlus size={18} />} color="var(--blue)" /><Card label="Aceptados" value={count(["ACCEPTED", "ENROLLED"])} icon={<CheckCircle size={18} />} color="var(--green)" /><Card label="Rechazados" value={count(["REJECTED"])} icon={<XCircle size={18} />} color="var(--coral)" /></div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full min-w-[650px] text-sm"><thead className="bg-slate-50 text-left text-slate-500"><tr><th className="p-3">Aspirante</th><th className="p-3">Programa</th><th className="p-3">Origen</th><th className="p-3">Fecha</th><th className="p-3">Estado</th></tr></thead><tbody>{applications.map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="p-3"><p className="font-medium">{item.name}</p><p className="text-xs text-slate-500">{item.email}</p></td><td className="p-3 text-slate-500">{item.programInterest ?? "—"}</td><td className="p-3 text-slate-500">{item.source ?? "—"}</td><td className="p-3 text-slate-500">{new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(item.createdAt)}</td><td className="p-3"><span className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">{stageLabel[item.stage]}</span></td></tr>)}{applications.length === 0 && <tr><td colSpan={5} className="p-10 text-center text-slate-500">No hay solicitudes registradas.</td></tr>}</tbody></table></div>
    </div>
  );
}

function Card({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) { return <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4"><span style={{ color }}>{icon}</span><div><p className="text-xl font-bold">{value}</p><p className="text-xs text-slate-500">{label}</p></div></div>; }
