import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { CourseModuleForm } from "@/components/dashboard/MutationForms";
import { Calendar, ChevronLeft, FileText, Users } from "lucide-react";

export default async function CourseDetailPage({ params }: { params: Promise<{ courseId: string }> }) {
  const session = await auth();
  const user = session!.user;
  const { courseId } = await params;
  const isStaff = ["ADMIN", "COORDINATOR", "SUPER_ADMIN"].includes(user.role);
  const canManage = isStaff || user.role === "TEACHER";

  const course = await db.course.findFirst({
    where: {
      id: courseId,
      institutionId: user.institutionId,
      ...(user.role === "TEACHER" ? { teacherId: user.id } : {}),
      ...(user.role === "STUDENT" ? { enrollments: { some: { studentId: user.id, status: "ACTIVE" } } } : {}),
    },
    include: {
      teacher: { select: { name: true, email: true } },
      period: { select: { name: true, startDate: true, endDate: true } },
      enrollments: { where: { status: "ACTIVE" }, include: { student: { select: { id: true, name: true } } }, take: 50 },
      modules: { where: canManage ? {} : { isPublished: true }, orderBy: { order: "asc" }, take: 50 },
      assignments: { where: canManage ? {} : { isPublished: true }, orderBy: { dueDate: "asc" }, take: 50 },
    },
  });
  if (!course) notFound();

  const formatDate = (date: Date) => new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(date);
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <Link href="/dashboard/aula" className="mb-6 flex w-fit items-center gap-1 text-sm text-slate-500"><ChevronLeft size={16} /> Volver a Aula</Link>
      <header className="mb-6 rounded-2xl p-6 text-white" style={{ background: "var(--navy)" }}><span className="rounded bg-white/10 px-2 py-1 text-xs font-mono text-cyan-300">{course.code ?? "CURSO"}</span><h1 className="mt-3 text-2xl font-bold">{course.name}</h1>{course.description && <p className="mt-1 text-sm text-slate-300">{course.description}</p>}<div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-400"><span>{course.teacher.name}</span><span>{course.period.name}</span><span>{course.enrollments.length} estudiantes</span></div></header>
      <div className="grid gap-6 lg:grid-cols-3"><main className="space-y-6 lg:col-span-2"><section><div className="mb-3 flex items-center justify-between"><h2 className="font-bold" style={{ color: "var(--navy)" }}>Materiales y contenidos</h2></div>{course.modules.length ? <div className="space-y-2">{course.modules.map((module) => <article key={module.id} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex gap-3"><FileText className="mt-0.5 text-blue-600" size={18} /><div><p className="font-medium" style={{ color: "var(--navy)" }}>{module.title}</p>{module.description && <p className="text-sm text-slate-500">{module.description}</p>}<p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{module.content}</p>{canManage && <span className="mt-2 inline-block text-xs text-slate-400">{module.isPublished ? "Publicado" : "Borrador"}</span>}</div></div></article>)}</div> : <Empty text="No hay contenidos publicados." />}</section>
      {canManage && <details className="rounded-xl"><summary className="cursor-pointer rounded-lg bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">Agregar contenido</summary><div className="mt-3"><CourseModuleForm courseId={course.id} /></div></details>}
      <section><h2 className="mb-3 font-bold" style={{ color: "var(--navy)" }}>Tareas</h2>{course.assignments.length ? <div className="space-y-2">{course.assignments.map((assignment) => <div key={assignment.id} className="rounded-xl border border-slate-200 bg-white p-4"><p className="font-medium">{assignment.title}</p><p className="text-xs text-slate-500">{assignment.dueDate ? `Entrega: ${formatDate(assignment.dueDate)}` : "Sin fecha límite"} · {assignment.maxScore} puntos{canManage && !assignment.isPublished ? " · Borrador" : ""}</p></div>)}</div> : <Empty text="Sin tareas publicadas." />}</section></main>
      <aside className="space-y-4"><section className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="mb-3 flex items-center justify-between text-sm font-semibold" style={{ color: "var(--navy)" }}>Estudiantes <Users size={16} /></h3>{canManage ? <div className="space-y-2">{course.enrollments.map((enrollment) => <Link key={enrollment.id} href={`/dashboard/gestion/estudiantes/${enrollment.student.id}`} className="block rounded-lg px-2 py-1 text-sm hover:bg-slate-50">{enrollment.student.name}</Link>)}{course.enrollments.length === 0 && <p className="text-xs text-slate-500">Sin estudiantes inscritos.</p>}</div> : <p className="text-xs text-slate-500">{course.enrollments.length} compañeros inscritos.</p>}</section><section className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Calendar size={16} className="text-cyan-600" /> Período</h3><p className="text-sm">{course.period.name}</p><p className="text-xs text-slate-500">{formatDate(course.period.startDate)} – {formatDate(course.period.endDate)}</p></section></aside></div>
    </div>
  );
}

function Empty({ text }: { text: string }) { return <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">{text}</div>; }
