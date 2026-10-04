import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { getLinkedChildren, getParentChildView } from "@/lib/guardian-portal";
import { spanishLabel } from "@/lib/ux";
import { BookOpen, CalendarDays, CheckCircle2, CreditCard, Megaphone, Users } from "lucide-react";

const card = "rounded-xl border border-slate-200 bg-white p-4";
const money = (amount: number, currency: string) => new Intl.NumberFormat("es-DO", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
const date = (value: Date | null) => value ? new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(value) : "Sin fecha";
const time = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const days = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export default async function ChildrenPortalPage({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.institutionId) redirect("/login");
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (user.role !== "PARENT" || !capabilities.has("child.portal.view")) redirect("/dashboard");
  const children = await getLinkedChildren(user, capabilities);
  if (!children.length) return <EmptyPortal />;
  const requestedChild = (await searchParams).child;
  const selectedId = requestedChild ?? children[0].student.id;
  if (requestedChild && !children.some((link) => link.student.id === requestedChild)) notFound();
  const view = await getParentChildView(user, capabilities, selectedId);
  if (!view) notFound();

  return <div className="mx-auto max-w-6xl p-4 sm:p-8"><header className="mb-6"><p className="text-sm font-semibold text-blue-700">Portal de tutores</p><h1 className="text-2xl font-bold">Mis hijos</h1><p className="mt-1 text-sm text-slate-500">Solo se muestran áreas autorizadas para el vínculo activo seleccionado.</p></header>
    <nav aria-label="Seleccionar hijo" className="mb-6 flex flex-wrap gap-2">{children.map((link) => <Link key={link.id} href={`/dashboard/hijos?child=${encodeURIComponent(link.student.id)}`} aria-current={link.student.id === selectedId ? "page" : undefined} className={`rounded-full px-4 py-2 text-sm font-semibold ${link.student.id === selectedId ? "bg-blue-600 text-white" : "border border-slate-300 bg-white text-slate-700"}`}>{link.student.name}</Link>)}</nav>
    <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-5"><h2 className="text-xl font-bold text-blue-950">{view.child.name}</h2><p className="text-sm text-blue-800">Las autorizaciones se aplican por separado a este vínculo.</p></div>

    <div className="space-y-8">
      {view.permissions.academics && <section><Heading icon={<BookOpen />} title="Progreso académico" />{view.courses.length ? <div className="grid gap-4 md:grid-cols-2">{view.courses.map((enrollment) => <article className={card} key={enrollment.id}><h3 className="font-bold">{enrollment.course.name}</h3><p className="text-xs text-slate-500">{enrollment.course.code ?? "Sin código"} · {spanishLabel(enrollment.status)}</p><p className="mt-3 text-2xl font-bold text-blue-700">{Math.round(enrollment.progressPercent)}%</p><p className="text-xs text-slate-500">Progreso registrado</p>{enrollment.course.assignments.length > 0 && <div className="mt-4"><h4 className="text-sm font-semibold">Próximas tareas</h4>{enrollment.course.assignments.map((task) => <p className="mt-1 text-sm text-slate-600" key={task.id}>{task.title} · {date(task.dueDate)}</p>)}</div>}{enrollment.gradeEntries.length > 0 && <div className="mt-4"><h4 className="text-sm font-semibold">Calificaciones publicadas</h4>{enrollment.gradeEntries.map((grade, index) => <p className="mt-1 text-sm text-slate-600" key={`${grade.gradeItem.title}-${index}`}>{grade.gradeItem.title}: {grade.isExcused ? "Excusado" : `${grade.score ?? "Pendiente"}/${grade.gradeItem.maxScore}`}</p>)}</div>}</article>)}</div> : <Empty text="No hay cursos activos o completados para este estudiante." />}</section>}

      {view.permissions.attendance && <section><Heading icon={<Users />} title="Asistencia" />{view.attendance.length ? <div className="space-y-2">{view.attendance.map((record) => <div className={card} key={record.id}><p className="font-semibold">{record.course.name}</p><p className="text-sm text-slate-600">{date(record.date)} · {spanishLabel(record.status)}</p></div>)}</div> : <Empty text="No hay registros de asistencia disponibles." />}</section>}

      {view.permissions.schedule && <section><Heading icon={<CalendarDays />} title="Horario y eventos" /><div className="grid gap-3 md:grid-cols-2">{view.schedule.map((slot) => <article className={card} key={slot.id}><p className="font-semibold">{slot.course.name}</p><p className="text-sm text-slate-600">{days[slot.weekday]} {time(slot.startMinutes)}–{time(slot.endMinutes)} · {slot.classroom}</p></article>)}{view.events.map((event) => <article className={card} key={event.id}><p className="font-semibold">{event.title}</p><p className="text-sm text-slate-600">{date(event.startDate)}</p></article>)}</div>{!view.schedule.length && !view.events.length && <Empty text="No hay horarios o eventos disponibles." />}</section>}

      {view.permissions.announcements && <section><Heading icon={<Megaphone />} title="Avisos relevantes" />{view.announcements.length ? <div className="space-y-3">{view.announcements.map((announcement) => <article className={card} key={announcement.id}><h3 className="font-semibold">{announcement.title}</h3><p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{announcement.content}</p><p className="mt-2 text-xs text-slate-400">{date(announcement.publishedAt)}</p></article>)}</div> : <Empty text="No hay avisos disponibles para este vínculo." />}</section>}

      {view.permissions.finance && <section><Heading icon={<CreditCard />} title="Estado de cuenta autorizado" />{view.finances.length ? <div className="space-y-2">{view.finances.map((payment) => <article className={card} key={payment.id}><div className="flex justify-between gap-3"><div><p className="font-semibold">{payment.concept}</p><p className="text-xs text-slate-500">{date(payment.dueDate)} · {spanishLabel(payment.status)}</p></div><strong>{money(payment.amount, payment.currency)}</strong></div></article>)}</div> : <Empty text="No hay cargos disponibles." />}</section>}

      {!Object.values(view.permissions).some(Boolean) && <Empty text="Este vínculo está activo, pero todavía no tiene áreas de información autorizadas." />}
    </div>
  </div>;
}

function EmptyPortal() { return <div className="mx-auto max-w-2xl p-8"><div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><CheckCircle2 className="mx-auto mb-3 text-slate-300" size={40} /><h1 className="text-xl font-bold">Sin hijos vinculados</h1><p className="mt-2 text-sm text-slate-500">No existe un vínculo activo para tu cuenta. No se muestran datos institucionales ni estudiantiles.</p></div></div>; }
function Heading({ icon, title }: { icon: React.ReactNode; title: string }) { return <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><span className="text-blue-700">{icon}</span>{title}</h2>; }
function Empty({ text }: { text: string }) { return <p className="rounded-xl border border-dashed bg-white p-6 text-center text-sm text-slate-500">{text}</p>; }
