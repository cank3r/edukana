import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AlertCircle, BookOpen, CalendarCheck, ChevronRight, CreditCard, Megaphone, Users } from "lucide-react";

const roleLabel = { SUPER_ADMIN: "Súper administrador", ADMIN: "Administrador", COORDINATOR: "Coordinador", TEACHER: "Docente", STUDENT: "Estudiante", PARENT: "Tutor" } as const;
type TaskLink = { href: string; title: string; detail: string; icon: React.ReactNode };
type Summary = { label: string; value: number; href: string };

export default async function DashboardPage() {
  const session = await auth();
  const user = session!.user;
  const iid = user.institutionId;
  let attention: TaskLink[] = [];
  let continueItems: TaskLink[] = [];
  let summary: Summary[] = [];

  if (["ADMIN", "COORDINATOR", "SUPER_ADMIN"].includes(user.role)) {
    const [students, courses, admissions, announcements] = await Promise.all([
      db.user.count({ where: { institutionId: iid, role: "STUDENT", status: "ACTIVE" } }),
      db.course.count({ where: { institutionId: iid } }),
      db.admissionLead.count({ where: { institutionId: iid, stage: { in: ["INTERESTED", "DOCUMENTS", "REVIEW"] } } }),
      db.announcement.count({ where: { institutionId: iid } }),
    ]);
    attention = admissions > 0 ? [{ href: "/dashboard/admisiones", title: "Revisar admisiones", detail: `${admissions} solicitudes abiertas`, icon: <AlertCircle size={18} /> }] : [];
    continueItems = [
      { href: "/dashboard/aula", title: "Gestionar cursos", detail: `${courses} cursos disponibles`, icon: <BookOpen size={18} /> },
      { href: "/dashboard/gestion", title: "Consultar personas", detail: `${students} estudiantes activos`, icon: <Users size={18} /> },
      { href: "/dashboard/comunidad", title: "Publicar un aviso", detail: `${announcements} avisos publicados`, icon: <Megaphone size={18} /> },
    ];
    summary = [{ label: "Estudiantes activos", value: students, href: "/dashboard/gestion" }, { label: "Cursos", value: courses, href: "/dashboard/aula" }, { label: "Admisiones abiertas", value: admissions, href: "/dashboard/admisiones" }];
  } else if (user.role === "TEACHER") {
    const [courses, students, submissions] = await Promise.all([
      db.course.count({ where: { institutionId: iid, teacherId: user.id } }),
      db.enrollment.count({ where: { status: "ACTIVE", course: { institutionId: iid, teacherId: user.id } } }),
      db.submission.count({ where: { status: "SUBMITTED", assignment: { course: { institutionId: iid, teacherId: user.id } } } }),
    ]);
    attention = submissions > 0 ? [{ href: "/dashboard/aula", title: "Calificar entregas", detail: `${submissions} entregas esperan revisión`, icon: <AlertCircle size={18} /> }] : [];
    continueItems = [{ href: "/dashboard/aula", title: "Continuar en mis cursos", detail: `${courses} cursos asignados`, icon: <BookOpen size={18} /> }, { href: "/dashboard/aula", title: "Ver estudiantes por curso", detail: `${students} inscripciones activas`, icon: <Users size={18} /> }];
    summary = [{ label: "Mis cursos", value: courses, href: "/dashboard/aula" }, { label: "Estudiantes", value: students, href: "/dashboard/aula" }, { label: "Por calificar", value: submissions, href: "/dashboard/aula" }];
  } else if (user.role === "STUDENT") {
    const [courses, pendingTasks, pendingPayments] = await Promise.all([
      db.enrollment.count({ where: { studentId: user.id, status: "ACTIVE", course: { institutionId: iid } } }),
      db.assignment.count({ where: { isPublished: true, submissions: { none: { studentId: user.id } }, course: { institutionId: iid, enrollments: { some: { studentId: user.id, status: "ACTIVE" } } } } }),
      db.paymentConcept.count({ where: { institutionId: iid, studentId: user.id, status: { in: ["PENDING", "OVERDUE", "PARTIAL"] } } }),
    ]);
    attention = [
      ...(pendingTasks > 0 ? [{ href: "/dashboard/portal", title: "Completar tareas", detail: `${pendingTasks} tareas pendientes`, icon: <CalendarCheck size={18} /> }] : []),
      ...(pendingPayments > 0 ? [{ href: "/dashboard/portal", title: "Revisar estado de cuenta", detail: `${pendingPayments} pagos pendientes`, icon: <CreditCard size={18} /> }] : []),
    ];
    continueItems = [{ href: "/dashboard/portal", title: "Continuar aprendiendo", detail: `${courses} cursos activos`, icon: <BookOpen size={18} /> }, { href: "/dashboard/calendario", title: "Ver próximas fechas", detail: "Calendario académico", icon: <CalendarCheck size={18} /> }];
    summary = [{ label: "Cursos activos", value: courses, href: "/dashboard/portal" }, { label: "Tareas pendientes", value: pendingTasks, href: "/dashboard/portal" }, { label: "Pagos pendientes", value: pendingPayments, href: "/dashboard/portal" }];
  } else {
    const announcements = await db.announcement.count({
      where: {
        institutionId: iid,
        OR: [{ audience: "ALL" }, { audience: "ROLE", audienceId: user.role }],
      },
    });
    attention = announcements > 0 ? [{ href: "/dashboard/comunidad", title: "Leer avisos", detail: `${announcements} avisos publicados`, icon: <Megaphone size={18} /> }] : [];
    continueItems = [{ href: "/dashboard/calendario", title: "Consultar calendario", detail: "Fechas de la institución", icon: <CalendarCheck size={18} /> }];
    summary = [{ label: "Avisos", value: announcements, href: "/dashboard/comunidad" }];
  }

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <header className="mb-8"><p className="mb-1 text-sm text-slate-600">Hola, {user.name?.split(" ")[0]}</p><h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>¿Qué necesitas hacer hoy?</h1><span className="mt-2 inline-block rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{roleLabel[user.role]}</span></header>
      <DashboardSection title="Requiere tu atención" description="Pendientes basados en la información actual de tu institución.">{attention.length > 0 ? <div className="grid gap-3 sm:grid-cols-2">{attention.map((item) => <TaskCard item={item} key={item.title} />)}</div> : <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="font-semibold text-emerald-900">Todo al día</p><p className="text-sm text-emerald-800">No tienes pendientes que requieran atención ahora.</p></div>}</DashboardSection>
      <DashboardSection title="Continuar" description="Accede directamente a tus tareas más frecuentes."><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{continueItems.map((item) => <TaskCard item={item} key={item.title} />)}</div></DashboardSection>
      <DashboardSection title="Resumen" description="Una vista rápida con enlaces a cada detalle."><div className="grid gap-3 sm:grid-cols-3">{summary.map((item) => <Link className="rounded-xl border border-slate-200 bg-white p-5 hover:border-blue-300 hover:shadow-sm" href={item.href} key={item.label}><p className="text-2xl font-bold text-slate-900">{item.value}</p><p className="text-sm text-slate-600">{item.label}</p></Link>)}</div></DashboardSection>
    </div>
  );
}

function DashboardSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="mb-8"><h2 className="text-lg font-bold text-slate-900">{title}</h2><p className="mb-3 text-sm text-slate-600">{description}</p>{children}</section>;
}

function TaskCard({ item }: { item: TaskLink }) {
  return <Link href={item.href} className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:border-blue-300 hover:shadow-sm"><span className="rounded-lg bg-blue-50 p-2 text-blue-700">{item.icon}</span><span className="min-w-0 flex-1"><span className="block font-semibold text-slate-900">{item.title}</span><span className="block text-sm text-slate-600">{item.detail}</span></span><ChevronRight className="text-slate-400 group-hover:text-blue-700" size={18} aria-hidden="true" /></Link>;
}
