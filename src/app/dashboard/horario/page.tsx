import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, MapPin, UserRound, Video } from "lucide-react";
import { auth } from "@/lib/auth";
import { WEEKDAY_NAMES } from "@/server/courses/schedule";
import { getWeeklySchedule, type WeekItem, type WeeklySchedule } from "@/server/courses/schedule-week";

export const dynamic = "force-dynamic";

const button = "inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800";
const zoneName = (timeZone: string) => (timeZone.split("/").pop() ?? timeZone).replaceAll("_", " ");
const dayMonth = new Intl.DateTimeFormat("es", { day: "numeric", month: "long", timeZone: "UTC" });
/** «6 de octubre» a partir de `AAAA-MM-DD`. */
const dateLabel = (key: string) => dayMonth.format(new Date(`${key}T12:00:00.000Z`));
const param = (value: string | string[] | undefined) => (typeof value === "string" ? value : "");

function title(data: WeeklySchedule) {
  if (data.subject.kind === "teacher") return `Horario de ${data.subject.name}`;
  if (data.subject.kind === "classroom") return `Horario del aula «${data.subject.name}»`;
  if (data.subject.kind === "choose") return "Horario semanal";
  return "Mi horario semanal";
}

export default async function WeeklySchedulePage({ searchParams }: { searchParams: Promise<{ semana?: string | string[]; ver?: string | string[] }> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const query = await searchParams;
  const view = param(query.ver);
  const data = await getWeeklySchedule({ id: user.id, institutionId: user.institutionId, role: user.role }, { week: param(query.semana), view });
  if (!data) notFound();

  const href = (week: string) => `/dashboard/horario?${new URLSearchParams({ semana: week, ...(view ? { ver: view } : {}) })}`;
  const lastDay = data.days[data.days.length - 1].key;
  const isCurrentWeek = data.today >= data.weekStart && data.today < data.nextWeek;
  const total = data.days.reduce((sum, day) => sum + day.items.length, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      <header>
        <h1 className="flex items-center gap-3 text-2xl font-bold" style={{ color: "var(--navy)" }}><CalendarDays className="text-blue-600" aria-hidden />{title(data)}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {data.subject.kind === "own"
            ? "Tus clases fijas de cada curso y las clases en vivo de la semana."
            : "Elige a un docente o un aula para ver sus clases de la semana."}
        </p>
      </header>

      {data.choices && <Picker data={data} view={view} />}

      {data.subject.kind !== "choose" && (
        <>
          <nav aria-label="Cambiar de semana" className="flex flex-wrap items-center gap-2">
            <Link className={button} href={href(data.prevWeek)}>← Semana anterior</Link>
            <Link className={button} href={href(data.nextWeek)}>Semana siguiente →</Link>
            {!isCurrentWeek && <Link className={button} href={href(data.today)}>Volver a esta semana</Link>}
          </nav>
          <h2 className="text-lg font-bold text-slate-950">
            Semana del {dateLabel(data.weekStart)} al {dateLabel(lastDay)}
            {isCurrentWeek && <span className="ml-2 rounded-full bg-blue-50 px-3 py-1 align-middle text-xs font-semibold text-blue-800">Esta semana</span>}
          </h2>

          {total === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">No hay clases en esta semana.</p>
              <p className="mt-1">
                {data.subject.kind === "own"
                  ? user.role === "STUDENT"
                    ? "Cuando tus cursos tengan horario o clases en vivo, aparecerán aquí."
                    : "Para armar el horario, entra a tu curso y abre «Horario»."
                  : "Nada ocupa este horario en esa semana."}
              </p>
              <Link className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white" href="/dashboard/aula">Ir a los cursos</Link>
            </div>
          )}

          {total > 0 && (
            <ol className={`grid gap-3 ${data.days.length === 7 ? "lg:grid-cols-7" : "lg:grid-cols-6"}`}>
              {data.days.map((day) => (
                <li key={day.key} className={`rounded-xl border bg-white p-3 ${day.key === data.today ? "border-blue-400 ring-1 ring-blue-200" : "border-slate-200"}`}>
                  <h3 className="flex flex-wrap items-baseline gap-x-2 font-bold text-slate-950">
                    {WEEKDAY_NAMES[day.weekday]}
                    <span className="text-sm font-normal text-slate-600">{dateLabel(day.key)}</span>
                    {day.key === data.today && <span className="text-xs font-semibold text-blue-700">Hoy</span>}
                  </h3>
                  {day.items.length === 0 ? (
                    <p className="mt-1 text-sm text-slate-500">Sin clases</p>
                  ) : (
                    <ul className="mt-2 space-y-2">{day.items.map((item) => <Item key={`${item.kind}-${item.id}`} item={item} />)}</ul>
                  )}
                </li>
              ))}
            </ol>
          )}
          <p className="text-xs text-slate-500">Las horas se muestran en hora de {zoneName(data.timeZone)}.</p>
        </>
      )}
    </div>
  );
}

function Item({ item }: { item: WeekItem }) {
  if (item.kind === "class") {
    return (
      <li className="rounded-lg bg-blue-50 p-2 text-sm">
        <p className="flex items-center gap-1 font-semibold text-blue-800"><Video size={14} aria-hidden />{item.start} – {item.end} · En vivo</p>
        <Link className="mt-0.5 flex min-h-11 flex-col justify-center" href={`/dashboard/aula/${item.courseId}/clases`}>
          <span className="font-bold text-slate-950 underline">{item.title}</span>
          <span className="text-slate-700">{item.courseName}</span>
        </Link>
      </li>
    );
  }
  return (
    <li className="rounded-lg bg-slate-50 p-2 text-sm">
      <p className="font-semibold text-slate-900">{item.start} – {item.end}</p>
      <Link className="flex min-h-11 items-center font-bold text-slate-950 underline" href={`/dashboard/aula/${item.courseId}/horario`}>{item.courseName}</Link>
      <p className="flex items-center gap-1 text-slate-700"><MapPin size={14} aria-hidden />{item.classroom}</p>
      <p className="flex items-center gap-1 text-slate-700"><UserRound size={14} aria-hidden />{item.teacherName}</p>
    </li>
  );
}

/** Para quien administra: elegir el docente o el aula. Funciona sin JavaScript (formulario GET). */
function Picker({ data, view }: { data: WeeklySchedule; view: string }) {
  const choices = data.choices!;
  if (!choices.teachers.length && !choices.classrooms.length) {
    return <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">Todavía no hay docentes ni aulas con horario. Cuando un curso tenga horario, podrás verlo aquí.</p>;
  }
  return (
    <form method="get" action="/dashboard/horario" className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-4">
      <input type="hidden" name="semana" value={data.weekStart} />
      <label className="block min-w-0 flex-1 basis-64 text-sm font-medium text-slate-900">
        Ver el horario de
        <select name="ver" defaultValue={view} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base">
          <option value="">Elige un docente o un aula…</option>
          {choices.teachers.length > 0 && (
            <optgroup label="Docentes">
              {choices.teachers.map((teacher) => <option key={teacher.id} value={`docente:${teacher.id}`}>{teacher.name}</option>)}
            </optgroup>
          )}
          {choices.classrooms.length > 0 && (
            <optgroup label="Aulas">
              {choices.classrooms.map((room) => <option key={room} value={`aula:${room}`}>{room}</option>)}
            </optgroup>
          )}
        </select>
      </label>
      <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white">Ver horario</button>
    </form>
  );
}
