import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { BookOpen, GraduationCap, Search, Users } from "lucide-react";

export default async function GestionPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await auth();
  const user = session!.user;
  if (!["ADMIN", "COORDINATOR", "SUPER_ADMIN"].includes(user.role)) redirect("/dashboard");
  const q = (await searchParams).q?.trim().slice(0, 100) ?? "";
  const studentWhere = { institutionId: user.institutionId, role: "STUDENT" as const, status: "ACTIVE" as const, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }] } : {}) };
  const [students, studentCount, teacherCount] = await Promise.all([
    db.user.findMany({ where: studentWhere, orderBy: { name: "asc" }, take: 100, select: { id: true, name: true, email: true, phone: true, createdAt: true, _count: { select: { enrollments: true } } } }),
    db.user.count({ where: { institutionId: user.institutionId, role: "STUDENT", status: "ACTIVE" } }),
    db.user.count({ where: { institutionId: user.institutionId, role: "TEACHER", status: "ACTIVE" } }),
  ]);

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <div className="mb-8"><h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Gestión estudiantil</h1><p className="mt-1 text-sm text-slate-500">Estudiantes activos de tu institución</p></div>
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3"><Stat icon={<GraduationCap size={18} />} label="Estudiantes" value={studentCount} color="var(--blue)" /><Stat icon={<BookOpen size={18} />} label="Docentes" value={teacherCount} color="var(--green)" /><Stat icon={<Users size={18} />} label="Personal activo" value={studentCount + teacherCount} color="var(--navy)" /></div>
      <form className="relative mb-4" role="search"><label className="sr-only" htmlFor="student-search">Buscar estudiante</label><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input id="student-search" name="q" defaultValue={q} placeholder="Buscar por nombre o correo…" className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-4 text-sm outline-none focus:border-blue-500" /></form>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full min-w-[620px] text-sm"><thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-4 py-3 font-medium">Nombre</th><th className="px-4 py-3 font-medium">Correo</th><th className="px-4 py-3 font-medium">Cursos</th><th className="px-4 py-3 font-medium">Estado</th></tr></thead><tbody>{students.map((student) => <tr key={student.id} className="border-t border-slate-100 hover:bg-slate-50"><td className="px-4 py-3"><Link href={`/dashboard/gestion/estudiantes/${student.id}`} className="font-medium text-blue-700 hover:underline">{student.name}</Link></td><td className="px-4 py-3 text-slate-500">{student.email}</td><td className="px-4 py-3 text-slate-500">{student._count.enrollments}</td><td className="px-4 py-3"><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">Activo</span></td></tr>)}{students.length === 0 && <tr><td colSpan={4} className="p-10 text-center text-slate-500">{q ? "No hay resultados para esta búsqueda." : "No hay estudiantes registrados aún."}</td></tr>}</tbody></table></div>
    </div>
  );
}

function Stat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) { return <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50" style={{ color }}>{icon}</div><div><p className="text-xl font-bold" style={{ color: "var(--navy)" }}>{value}</p><p className="text-xs text-slate-500">{label}</p></div></div>; }
