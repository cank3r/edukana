import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { BookOpen, ChevronRight, Users } from "lucide-react";

type CourseCard = Prisma.CourseGetPayload<{ include: { _count: { select: { enrollments: true; modules: true } }; teacher: { select: { name: true } }; period: { select: { name: true } } } }>;
const include = { _count: { select: { enrollments: true, modules: true } }, teacher: { select: { name: true } }, period: { select: { name: true } } } as const;

export default async function AulaPage() {
  const session = await auth();
  const user = session!.user;
  let courses: CourseCard[];
  if (user.role === "TEACHER") {
    courses = await db.course.findMany({ where: { institutionId: user.institutionId, teacherId: user.id }, include, orderBy: { createdAt: "desc" } });
  } else if (user.role === "STUDENT") {
    const enrollments = await db.enrollment.findMany({ where: { studentId: user.id, status: { in: ["ACTIVE", "COMPLETED"] }, course: { institutionId: user.institutionId } }, include: { course: { include } }, orderBy: { enrolledAt: "desc" } });
    courses = enrollments.map((enrollment) => enrollment.course);
  } else {
    courses = await db.course.findMany({ where: { institutionId: user.institutionId }, include, orderBy: { createdAt: "desc" }, take: 100 });
  }
  const colors = ["var(--blue)", "var(--cyan)", "var(--green)", "var(--coral)", "#8B5CF6", "#F59E0B"];

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8"><div className="mb-8"><h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Aula</h1><p className="mt-1 text-sm text-slate-500">{user.role === "STUDENT" ? "Tus materias inscritas" : user.role === "TEACHER" ? "Tus cursos asignados" : "Cursos de la institución"}</p></div>
      {courses.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center"><BookOpen size={40} className="mx-auto mb-3 text-slate-300" /><p className="font-semibold">{user.role === "STUDENT" ? "No tienes cursos inscritos" : "No hay cursos disponibles"}</p><p className="mt-1 text-sm text-slate-500">Contacta a la administración de tu institución.</p></div> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{courses.map((course, index) => { const color = colors[index % colors.length]; return <Link key={course.id} href={`/dashboard/aula/${course.id}`} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white transition-all hover:shadow-md"><div className="h-2" style={{ background: color }} /><div className="p-5"><span className="rounded px-2 py-0.5 text-xs font-mono" style={{ background: `${color}18`, color }}>{course.code ?? "CURSO"}</span><h2 className="mt-3 font-bold" style={{ color: "var(--navy)" }}>{course.name}</h2>{course.description && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{course.description}</p>}<div className="mt-4 flex gap-4 text-xs text-slate-500"><span className="flex items-center gap-1"><Users size={12} />{course._count.enrollments}</span><span className="flex items-center gap-1"><BookOpen size={12} />{course._count.modules}</span></div><div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-500"><span>{course.teacher.name} · {course.period.name}</span><ChevronRight size={16} /></div></div></Link>; })}</div>}
    </div>
  );
}
