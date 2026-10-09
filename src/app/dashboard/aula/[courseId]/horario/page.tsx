import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Clock3, MapPin, UserRound } from "lucide-react";
import { auth } from "@/lib/auth";
import { getCourseSchedule, WEEKDAY_NAMES, type SlotView } from "@/server/courses/schedule";
import { AddSlot, ManageSlot } from "./ScheduleTools";

export const dynamic = "force-dynamic";

const link = "inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 underline";
const zoneName = (timeZone: string) => (timeZone.split("/").pop() ?? timeZone).replaceAll("_", " ");
const dateFormat = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeZone: "UTC" });
/** «14 oct 2026» a partir de `AAAA-MM-DD`. */
const dateLabel = (key: string) => dateFormat.format(new Date(`${key}T00:00:00.000Z`));

function validity(slot: SlotView) {
  if (slot.startsOn && slot.endsOn) return `Del ${dateLabel(slot.startsOn)} al ${dateLabel(slot.endsOn)}`;
  if (slot.startsOn) return `Desde el ${dateLabel(slot.startsOn)}`;
  if (slot.endsOn) return `Hasta el ${dateLabel(slot.endsOn)}`;
  return "";
}

export default async function CourseSchedulePage({ params }: { params: Promise<{ courseId: string }> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const { courseId } = await params;
  // `getCourseSchedule` decide en el servidor si la persona gestiona el curso, solo lo ve o no tiene acceso.
  const schedule = await getCourseSchedule({ id: user.id, institutionId: user.institutionId, role: user.role }, courseId);
  if (!schedule) notFound();

  const { course, slots } = schedule;
  const editable = schedule.canManage && !course.archived;
  const zoneLabel = `hora de ${zoneName(schedule.timeZone)}`;
  const byDay = WEEKDAY_NAMES.map((name, weekday) => ({ name, weekday, slots: slots.filter((slot) => slot.weekday === weekday) })).filter((day) => day.slots.length);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <header>
        <Link className={link} href={`/dashboard/aula/${course.id}`}>← {course.name}</Link>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Horario</h1>
        <p className="mt-1 text-sm text-slate-600">
          {schedule.canManage
            ? "Los días y horas en que el curso se reúne cada semana, con su aula. Si el docente o el aula ya están ocupados a esa hora, te lo diremos antes de guardar."
            : "Los días y horas en que tu curso se reúne cada semana, y en qué aula."}
        </p>
      </header>

      {course.archived && schedule.canManage && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Este curso está archivado: puedes ver su horario, pero no cambiarlo.</p>
      )}
      {editable && <AddSlot courseId={course.id} zoneLabel={zoneLabel} startOpen={slots.length === 0} />}

      <section aria-labelledby="bloques" className="space-y-5">
        <h2 id="bloques" className="sr-only">Bloques de la semana</h2>
        {byDay.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            {schedule.canManage
              ? "Este curso todavía no tiene horario. Agrega un bloque por cada día en que se reúne: por ejemplo, lunes de 8:00 a 10:00 en el Aula 3."
              : "Tu curso todavía no tiene horario. Cuando lo publiquen, aparecerá aquí y en tu horario semanal."}
          </p>
        ) : (
          byDay.map((day) => (
            <div key={day.weekday}>
              <h3 className="text-base font-bold text-slate-950">{day.name}</h3>
              <ul className="mt-2 space-y-3">
                {day.slots.map((slot) => {
                  const dates = validity(slot);
                  return (
                    <li key={slot.id} className={`rounded-xl border bg-white p-4 ${slot.status === "active" ? "border-slate-200" : "border-dashed border-slate-300"}`}>
                      <p className="flex items-center gap-2 text-lg font-bold text-slate-950"><Clock3 size={18} className="text-blue-600" aria-hidden />{slot.start} – {slot.end}</p>
                      <div className="mt-1 space-y-1 text-sm text-slate-700">
                        <p className="flex items-center gap-2"><MapPin size={16} aria-hidden />{slot.classroom}</p>
                        <p className="flex items-center gap-2"><UserRound size={16} aria-hidden />{slot.teacherName}</p>
                      </div>
                      {dates && <p className="mt-2 text-sm text-slate-600">{dates}</p>}
                      {slot.status !== "active" && (
                        <p className="mt-2 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{slot.status === "ended" ? "Ya terminó" : "Todavía no empieza"}</p>
                      )}
                      {editable && (
                        <ManageSlot
                          courseId={course.id}
                          slotId={slot.id}
                          summary={`${day.name.toLowerCase()} de ${slot.start} a ${slot.end} en ${slot.classroom}`}
                          values={{ weekday: slot.weekday, start: slot.start, end: slot.end, classroom: slot.classroom, startsOn: slot.startsOn ?? "", endsOn: slot.endsOn ?? "" }}
                          zoneLabel={zoneLabel}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
        {byDay.length > 0 && <p className="text-xs text-slate-500">Las horas se muestran en {zoneLabel}.</p>}
      </section>

      <Link className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800" href="/dashboard/horario">
        Ver horario semanal
      </Link>
    </div>
  );
}
