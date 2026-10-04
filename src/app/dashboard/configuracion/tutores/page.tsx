import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { db } from "@/lib/db";
import { GuardianshipManager } from "@/components/dashboard/GuardianshipManager";

export default async function GuardianshipSettingsPage() {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.institutionId) redirect("/login");
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!capabilities.has("guardianship.manage")) redirect("/dashboard");
  const [parents, students, links] = await Promise.all([
    db.user.findMany({ where: { institutionId: user.institutionId, role: "PARENT", status: "ACTIVE" }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" }, take: 200 }),
    db.user.findMany({ where: { institutionId: user.institutionId, role: "STUDENT", status: "ACTIVE" }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" }, take: 500 }),
    db.guardianship.findMany({ where: { institutionId: user.institutionId }, select: { id: true, relationship: true, status: true, canViewAcademics: true, canViewAttendance: true, canViewSchedule: true, canViewAnnouncements: true, canViewFinance: true, parent: { select: { id: true, name: true, email: true } }, student: { select: { id: true, name: true, email: true } } }, orderBy: { updatedAt: "desc" }, take: 500 }),
  ]);
  return <div className="mx-auto max-w-5xl p-4 sm:p-8"><header className="mb-8"><p className="text-sm font-semibold text-blue-700">Configuración</p><h1 className="text-2xl font-bold">Tutores y estudiantes</h1><p className="mt-1 text-sm text-slate-500">Crea vínculos pendientes, configura cada área y actívalos explícitamente. Ningún vínculo concede acceso mientras no esté activo.</p></header><GuardianshipManager parents={parents} students={students} links={links} managerCapabilities={[...capabilities]} /></div>;
}
