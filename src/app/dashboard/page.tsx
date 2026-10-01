import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Bell, BookOpen, CalendarCheck, ChevronRight, CreditCard, TrendingUp, Users } from "lucide-react";

export default async function DashboardPage() {
  const session = await auth();
  const user = session!.user;
  const iid = user.institutionId;

  let cards: Array<{ label: string; value: number; color: string; bg: string; icon: React.ReactNode }> = [];
  if (["ADMIN", "COORDINATOR", "SUPER_ADMIN"].includes(user.role)) {
    const [students, courses, announcements] = await Promise.all([
      db.user.count({ where: { institutionId: iid, role: "STUDENT", status: "ACTIVE" } }),
      db.course.count({ where: { institutionId: iid } }),
      db.announcement.count({ where: { institutionId: iid } }),
    ]);
    cards = [
      { label: "Estudiantes activos", value: students, color: "var(--blue)", bg: "var(--blue-light)", icon: <Users size={20} /> },
      { label: "Cursos activos", value: courses, color: "var(--cyan)", bg: "var(--cyan-light)", icon: <BookOpen size={20} /> },
      { label: "Anuncios publicados", value: announcements, color: "var(--coral)", bg: "var(--coral-light)", icon: <Bell size={20} /> },
    ];
  } else if (user.role === "TEACHER") {
    const [courses, students, tasks] = await Promise.all([
      db.course.count({ where: { institutionId: iid, teacherId: user.id } }),
      db.enrollment.count({ where: { status: "ACTIVE", course: { institutionId: iid, teacherId: user.id } } }),
      db.assignment.count({ where: { course: { institutionId: iid, teacherId: user.id }, isPublished: true } }),
    ]);
    cards = [
      { label: "Mis cursos", value: courses, color: "var(--blue)", bg: "var(--blue-light)", icon: <BookOpen size={20} /> },
      { label: "Estudiantes", value: students, color: "var(--green)", bg: "var(--green-light)", icon: <Users size={20} /> },
      { label: "Tareas publicadas", value: tasks, color: "var(--coral)", bg: "var(--coral-light)", icon: <CalendarCheck size={20} /> },
    ];
  } else if (user.role === "STUDENT") {
    const [courses, pendingTasks, pendingPayments] = await Promise.all([
      db.enrollment.count({ where: { studentId: user.id, status: "ACTIVE", course: { institutionId: iid } } }),
      db.assignment.count({ where: { isPublished: true, submissions: { none: { studentId: user.id } }, course: { institutionId: iid, enrollments: { some: { studentId: user.id, status: "ACTIVE" } } } } }),
      db.paymentConcept.count({ where: { institutionId: iid, studentId: user.id, status: { in: ["PENDING", "OVERDUE", "PARTIAL"] } } }),
    ]);
    cards = [
      { label: "Cursos inscritos", value: courses, color: "var(--blue)", bg: "var(--blue-light)", icon: <BookOpen size={20} /> },
      { label: "Tareas pendientes", value: pendingTasks, color: "var(--coral)", bg: "var(--coral-light)", icon: <CalendarCheck size={20} /> },
      { label: "Pagos pendientes", value: pendingPayments, color: "#92400E", bg: "#FEF9C3", icon: <CreditCard size={20} /> },
    ];
  }

  const roleLabel = { SUPER_ADMIN: "Súper administrador", ADMIN: "Administrador", COORDINATOR: "Coordinador", TEACHER: "Docente", STUDENT: "Estudiante", PARENT: "Tutor" }[user.role];
  const quick = user.role === "STUDENT"
    ? [{ href: "/dashboard/portal", title: "Mi portal", desc: "Cursos, tareas, calificaciones y pagos", icon: <BookOpen size={18} />, color: "var(--blue)" }, { href: "/dashboard/comunidad", title: "Anuncios", desc: "Comunicados de tu institución", icon: <Bell size={18} />, color: "var(--cyan)" }]
    : [{ href: "/dashboard/aula", title: "Cursos", desc: "Materias, contenidos y tareas", icon: <BookOpen size={18} />, color: "var(--blue)" }, { href: "/dashboard/comunidad", title: "Anuncios", desc: "Comunicados y novedades", icon: <Bell size={18} />, color: "var(--cyan)" }, { href: "/dashboard/calendario", title: "Calendario", desc: "Eventos y fechas importantes", icon: <CalendarCheck size={18} />, color: "var(--green)" }];

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <div className="mb-8"><p className="mb-1 text-sm text-slate-500">Hola, {user.name?.split(" ")[0]}</p><h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Tu institución, conectada</h1><span className="mt-2 inline-block rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: "var(--blue-light)", color: "var(--blue)" }}>{roleLabel}</span></div>
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">{cards.map((card) => <div key={card.label} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5"><div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: card.bg, color: card.color }}>{card.icon}</div><div><p className="text-2xl font-bold" style={{ color: "var(--navy)" }}>{card.value}</p><p className="text-xs text-slate-500">{card.label}</p></div></div>)}</div>
      <h2 className="mb-3 font-semibold" style={{ color: "var(--navy)" }}>Acceso rápido</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{quick.map((item) => <Link key={item.href} href={item.href} className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:shadow-sm"><div className="flex h-9 w-9 items-center justify-center rounded-lg text-white" style={{ background: item.color }}>{item.icon}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold" style={{ color: "var(--navy)" }}>{item.title}</p><p className="truncate text-xs text-slate-500">{item.desc}</p></div><ChevronRight size={16} className="text-slate-300" /></Link>)}</div>
      {["ADMIN", "SUPER_ADMIN"].includes(user.role) && <Link href="/dashboard/analitica" className="mt-6 flex items-center gap-2 text-sm font-medium text-blue-600"><TrendingUp size={16} /> Ver analítica institucional</Link>}
    </div>
  );
}
