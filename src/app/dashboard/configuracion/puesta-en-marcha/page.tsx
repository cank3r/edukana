import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { db } from "@/lib/db";
import { roleLabel } from "@/lib/ux";
import { AcademicPeriodForm, PilotUserForm } from "@/components/dashboard/PilotSetupForms";

export default async function PilotSetupPage() {
  const current = (await auth())?.user;
  if (!current?.id || !current.institutionId) redirect("/login");
  const capabilities = await getEffectiveCapabilities(current.institutionId, current.role);
  if (!capabilities.has("people.manage") || !capabilities.has("academic.structure.manage")) redirect("/dashboard");
  const [people, periods, unitCount, activeLinks] = await Promise.all([
    db.user.findMany({ where: { institutionId: current.institutionId, role: { in: ["TEACHER", "STUDENT", "PARENT"] } }, select: { id: true, name: true, email: true, role: true, status: true }, orderBy: [{ role: "asc" }, { name: "asc" }] }),
    db.academicPeriod.findMany({ where: { institutionId: current.institutionId }, select: { id: true, name: true, startDate: true, endDate: true, isActive: true }, orderBy: { startDate: "desc" } }),
    db.organizationalUnit.count({ where: { institutionId: current.institutionId } }),
    db.guardianship.count({ where: { institutionId: current.institutionId, status: "ACTIVE" } }),
  ]);
  const roleCounts = new Map(people.map((person) => [person.role, people.filter((candidate) => candidate.role === person.role).length]));
  const checks = [
    ["Docente creado", (roleCounts.get("TEACHER") ?? 0) > 0],
    ["Estudiante creado", (roleCounts.get("STUDENT") ?? 0) > 0],
    ["Tutor creado", (roleCounts.get("PARENT") ?? 0) > 0],
    ["Período activo", periods.some((period) => period.isActive)],
    ["Departamento creado", unitCount > 0],
    ["Vínculo de tutor activo", activeLinks > 0],
  ] as const;
  return <div className="mx-auto max-w-6xl p-4 sm:p-8"><header className="mb-8"><p className="text-sm font-semibold text-blue-700">Configuración</p><h1 className="text-2xl font-bold">Puesta en marcha del piloto</h1><p className="mt-1 max-w-3xl text-sm text-slate-500">Prepara cuentas y período desde la interfaz. Después crea el departamento, configura permisos y activa el vínculo del tutor.</p></header><section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{checks.map(([label, done]) => <div className={`rounded-xl border p-4 text-sm font-semibold ${done ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`} key={label}>{done ? "Completado" : "Pendiente"}: {label}</div>)}</section><div className="grid gap-6 lg:grid-cols-2"><PilotUserForm /><AcademicPeriodForm /></div><section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-bold">Cuentas del piloto</h2>{people.length ? <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr className="border-b text-left text-slate-500"><th className="p-2">Nombre</th><th className="p-2">Correo</th><th className="p-2">Rol</th><th className="p-2">Estado</th></tr></thead><tbody>{people.map((person) => <tr className="border-b last:border-0" key={person.id}><td className="p-2 font-medium">{person.name}</td><td className="p-2 text-slate-600">{person.email}</td><td className="p-2">{roleLabel(person.role)}</td><td className="p-2">{person.status === "ACTIVE" ? "Activo" : "Inactivo"}</td></tr>)}</tbody></table></div> : <p className="mt-2 text-sm text-slate-500">Aún no hay cuentas de docente, estudiante o tutor.</p>}</section><nav className="mt-6 grid gap-3 sm:grid-cols-3"><Link className="rounded-xl border border-slate-200 bg-white p-4 font-semibold text-blue-700 hover:border-blue-400" href="/dashboard/configuracion/roles">Configurar roles y permisos</Link><Link className="rounded-xl border border-slate-200 bg-white p-4 font-semibold text-blue-700 hover:border-blue-400" href="/dashboard/configuracion/unidades">Crear departamento</Link><Link className="rounded-xl border border-slate-200 bg-white p-4 font-semibold text-blue-700 hover:border-blue-400" href="/dashboard/configuracion/tutores">Vincular tutor</Link></nav></div>;
}
