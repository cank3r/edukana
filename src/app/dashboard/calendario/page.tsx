import { auth } from "@/lib/auth";
import { hasCapability } from "@/lib/capabilities";
import { db } from "@/lib/db";
import { CalendarDays, Clock3, MapPin, UserRound } from "lucide-react";

const days = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const time = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export default async function CalendarPage() {
  const session = await auth(); const user = session!.user;
  const [events, slots] = await Promise.all([
    db.calendarEvent.findMany({ where: { institutionId: user.institutionId }, orderBy: { startDate: "asc" }, take: 50 }),
    db.scheduleSlot.findMany({ where: { institutionId: user.institutionId, ...(!hasCapability(user.role, "schedule.view") ? { id: "__restricted__" } : {}), ...(user.role === "TEACHER" ? { teacherId: user.id } : {}), ...(user.role === "STUDENT" ? { course: { enrollments: { some: { studentId: user.id, status: { in: ["ACTIVE", "COMPLETED"] } } } } } : {}) }, include: { course: { select: { name: true, code: true } }, teacher: { select: { name: true } } }, orderBy: [{ weekday: "asc" }, { startMinutes: "asc" }] }),
  ]);
  return <div className="mx-auto max-w-7xl p-4 sm:p-8"><div className="mb-8"><h1 className="flex items-center gap-3 text-2xl font-bold"><CalendarDays className="text-blue-600" /> Horario institucional</h1><p className="text-sm text-slate-500">Cursos por día, hora, docente y aula. Los nuevos bloques se validan contra conflictos.</p></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{slots.map((slot) => <article className="rounded-2xl border bg-white p-5" key={slot.id}><span className="text-xs font-bold uppercase text-blue-600">{days[slot.weekday]}</span><h2 className="mt-1 font-bold">{slot.course.name}</h2><p className="text-xs font-mono text-slate-400">{slot.course.code}</p><div className="mt-4 space-y-2 text-sm text-slate-600"><p className="flex items-center gap-2"><Clock3 size={16} />{time(slot.startMinutes)}–{time(slot.endMinutes)}</p><p className="flex items-center gap-2"><UserRound size={16} />{slot.teacher.name}</p><p className="flex items-center gap-2"><MapPin size={16} />{slot.classroom}</p></div></article>)}{!slots.length && <p className="rounded-xl border border-dashed bg-white p-8 text-sm text-slate-500">No hay bloques de clase registrados.</p>}</div>{events.length > 0 && <section className="mt-10"><h2 className="mb-3 text-lg font-bold">Eventos institucionales</h2><div className="space-y-2">{events.map((event) => <div className="rounded-xl border bg-white p-4" key={event.id}><strong>{event.title}</strong><p className="text-sm text-slate-500">{new Intl.DateTimeFormat("es", { dateStyle: "full" }).format(event.startDate)}</p></div>)}</div></section>}</div>;
}
