import Link from "next/link";
import { CalendarDays, Clock3, FileText, MapPin, UserRound, Video } from "lucide-react";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { courseWhereForScope, resolveCourseReadScope, resolveCourseWriteScope } from "@/lib/course-scope";
import { db } from "@/lib/db";
import { addDaysToDateKey, formatZonedDay, formatZonedTime, zonedDateKey } from "@/lib/timezone";
import { getAgenda } from "@/server/courses/live-classes";
import { JoinClass } from "../aula/[courseId]/clases/ClassTools";

export const dynamic = "force-dynamic";

const AGENDA_DAYS = 14;
const days = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const time = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
/** Nombre del día a partir de su clave `AAAA-MM-DD` (ya está en la zona de la institución). */
const dayName = (key: string) => formatZonedDay(new Date(`${key}T12:00:00Z`), "UTC");

export default async function CalendarPage() {
  const session = await auth(); const user = session!.user;
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!capabilities.has("schedule.view")) notFound();
  const now = new Date();
  const courseWhere = courseWhereForScope(user.institutionId, resolveCourseReadScope(user, capabilities));
  const canManage = resolveCourseWriteScope(user, capabilities).kind !== "none";
  const [agenda, events, slots] = await Promise.all([
    getAgenda({ id: user.id, institutionId: user.institutionId, role: user.role }, now, AGENDA_DAYS),
    db.calendarEvent.findMany({ where: { institutionId: user.institutionId }, orderBy: { startDate: "asc" }, take: 50 }),
    courseWhere ? db.scheduleSlot.findMany({ where: { institutionId: user.institutionId, course: courseWhere }, include: { course: { select: { name: true, code: true } }, teacher: { select: { name: true } } }, orderBy: [{ weekday: "asc" }, { startMinutes: "asc" }] }) : Promise.resolve([]),
  ]);
  const todayKey = zonedDateKey(now, agenda.timeZone);
  const tomorrowKey = addDaysToDateKey(todayKey, 1);
  const dayTitle = (key: string) => (key === todayKey ? `Hoy, ${dayName(key)}` : key === tomorrowKey ? `Mañana, ${dayName(key)}` : dayName(key));

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4 sm:p-8">
      <header>
        <h1 className="flex items-center gap-3 text-2xl font-bold"><CalendarDays className="text-blue-600" /> Calendario</h1>
        <p className="mt-1 text-sm text-slate-600">Tus clases en vivo y entregas de los próximos {AGENDA_DAYS} días.</p>
      </header>

      <section aria-labelledby="agenda">
        <h2 id="agenda" className="sr-only">Próximos {AGENDA_DAYS} días</h2>
        {agenda.days.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">No tienes clases en vivo ni entregas en los próximos {AGENDA_DAYS} días.</p>
            <p className="mt-1">{canManage ? "Para programar una clase, entra a tu curso y abre «Clases en vivo»." : "Cuando tu docente programe una clase o publique una tarea con fecha, aparecerá aquí."}</p>
            <Link className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white" href="/dashboard/aula">Ir a mis cursos</Link>
          </div>
        ) : (
          <div className="space-y-6">
            {agenda.days.map((day) => (
              <div key={day.key}>
                <h3 className="text-base font-bold text-slate-950 first-letter:uppercase">{dayTitle(day.key)}</h3>
                <ul className="mt-2 space-y-3">
                  {day.items.map((item) => {
                    const timeLabel = formatZonedTime(item.at, agenda.timeZone);
                    return (
                      <li key={`${item.kind}-${item.id}`} className="rounded-xl border border-slate-200 bg-white p-4">
                        <p className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                          {item.kind === "class" ? <Video size={16} aria-hidden /> : <FileText size={16} aria-hidden />}
                          {item.kind === "class" ? `Clase en vivo · ${timeLabel} · ${item.durationMinutes} minutos` : `Entrega de tarea · hasta las ${timeLabel}`}
                        </p>
                        <Link className="mt-1 flex min-h-11 flex-col justify-center" href={item.kind === "class" ? `/dashboard/aula/${item.courseId}/clases` : `/dashboard/aula/${item.courseId}/tareas/${item.id}`}>
                          <span className="font-bold text-slate-950 underline">{item.title}</span>
                          <span className="text-sm text-slate-600">{item.courseName}</span>
                        </Link>
                        {item.kind === "class" && (
                          <div className="mt-2">
                            <JoinClass item={{ startsAtMs: item.at.getTime(), durationMinutes: item.durationMinutes, joinUrl: item.joinUrl, dayLabel: formatZonedDay(item.at, agenda.timeZone), timeLabel }} initialNowMs={now.getTime()} />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {slots.length > 0 && (
        <section aria-labelledby="horario">
          <h2 id="horario" className="text-lg font-bold text-slate-950">Horario semanal</h2>
          <p className="text-sm text-slate-600">Los bloques fijos de cada curso: día, hora, docente y aula.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {slots.map((slot) => (
              <article className="rounded-xl border border-slate-200 bg-white p-4" key={slot.id}>
                <span className="text-xs font-bold uppercase text-blue-600">{days[slot.weekday]}</span>
                <h3 className="mt-1 font-bold">{slot.course.name}</h3>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <p className="flex items-center gap-2"><Clock3 size={16} aria-hidden />{time(slot.startMinutes)}–{time(slot.endMinutes)}</p>
                  <p className="flex items-center gap-2"><UserRound size={16} aria-hidden />{slot.teacher.name}</p>
                  <p className="flex items-center gap-2"><MapPin size={16} aria-hidden />{slot.classroom}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {events.length > 0 && (
        <section aria-labelledby="eventos">
          <h2 id="eventos" className="text-lg font-bold text-slate-950">Eventos de la institución</h2>
          <div className="mt-3 space-y-2">
            {events.map((event) => (
              <div className="rounded-xl border border-slate-200 bg-white p-4" key={event.id}>
                <strong>{event.title}</strong>
                <p className="text-sm text-slate-500">{new Intl.DateTimeFormat("es", { dateStyle: "full" }).format(event.startDate)}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
