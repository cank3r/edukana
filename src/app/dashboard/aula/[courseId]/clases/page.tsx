import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { formatZonedDay, formatZonedTime, zonedDateKey, zonedTimeValue } from "@/lib/timezone";
import { LIVE_CLASS_DURATIONS, MAX_REPEAT_WEEKS, listLiveClasses, type LiveClassItem } from "@/server/courses/live-classes";
import { JoinClass, ManageClass, ScheduleClass, type ClassView } from "./ClassTools";
import { safeJoinUrl } from "./phase";

export const dynamic = "force-dynamic";

/** «America/Santo_Domingo» → «Santo Domingo». */
const zoneName = (timeZone: string) => (timeZone.split("/").pop() ?? timeZone).replaceAll("_", " ");

function toView(item: LiveClassItem, timeZone: string): ClassView {
  return {
    id: item.id,
    title: item.title,
    description: item.description ?? "",
    startsAtMs: item.startsAt.getTime(),
    durationMinutes: item.durationMinutes,
    joinUrl: item.joinUrl,
    dayLabel: formatZonedDay(item.startsAt, timeZone),
    timeLabel: formatZonedTime(item.startsAt, timeZone),
    dateValue: zonedDateKey(item.startsAt, timeZone),
    timeValue: zonedTimeValue(item.startsAt, timeZone),
  };
}

export default async function LiveClassesPage({ params }: { params: Promise<{ courseId: string }> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const { courseId } = await params;
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!capabilities.has("course.view")) notFound();
  const now = new Date();
  // `listLiveClasses` decide en el servidor si la persona gestiona el curso, solo lo ve o no tiene acceso.
  const list = await listLiveClasses({ id: user.id, institutionId: user.institutionId, role: user.role }, courseId, now);
  if (!list) notFound();

  const zoneLabel = `hora de ${zoneName(list.timeZone)}`;
  const upcoming = list.upcoming.map((item) => toView(item, list.timeZone));
  const past = list.past.map((item) => toView(item, list.timeZone));
  const nothing = upcoming.length === 0 && past.length === 0;

  const row = (item: ClassView, isPast: boolean) => {
    const url = safeJoinUrl(item.joinUrl);
    return (
      <li key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold text-blue-700 first-letter:uppercase">{item.dayLabel}</p>
        <h3 className="mt-0.5 text-base font-bold text-slate-950">{item.title}</h3>
        <p className="text-sm text-slate-600">{item.timeLabel} · {item.durationMinutes} minutos</p>
        {item.description && <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{item.description}</p>}
        <div className="mt-3">
          {list.canManage && !isPast && url ? (
            <a className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white" href={url} target="_blank" rel="noopener noreferrer">Entrar a clase</a>
          ) : (
            <JoinClass item={item} initialNowMs={now.getTime()} />
          )}
        </div>
        {list.canManage && <ManageClass item={item} durations={LIVE_CLASS_DURATIONS} zoneLabel={zoneLabel} />}
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <header>
        <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 underline" href={`/dashboard/aula/${list.courseId}`}>← {list.courseName}</Link>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Clases en vivo</h1>
        <p className="mt-1 text-sm text-slate-600">
          {list.canManage
            ? "Programa las clases por videollamada del curso. Los estudiantes inscritos las ven aquí y en su calendario."
            : "Aquí están las clases por videollamada de tu curso. El botón para entrar se activa 15 minutos antes de empezar."}
        </p>
      </header>

      {list.canManage && (
        <ScheduleClass courseId={list.courseId} durations={LIVE_CLASS_DURATIONS} maxWeeks={MAX_REPEAT_WEEKS} minDate={zonedDateKey(now, list.timeZone)} zoneLabel={zoneLabel} startOpen={false} />
      )}

      <section aria-labelledby="proximas">
        <h2 id="proximas" className="text-lg font-bold text-slate-950">Próximas clases</h2>
        {upcoming.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            {list.canManage
              ? nothing
                ? "Todavía no hay clases en vivo en este curso. Crea la reunión en Zoom, Meet o Teams, copia el enlace y usa «Programar clase»."
                : "No hay clases próximas. Usa «Programar clase» para agregar la siguiente."
              : "No hay clases en vivo programadas por ahora. Cuando tu docente programe una, aparecerá aquí."}
          </p>
        ) : (
          <ul className="mt-2 space-y-3">{upcoming.map((item) => row(item, false))}</ul>
        )}
        <p className="mt-2 text-xs text-slate-500">Las horas se muestran en {zoneLabel}.</p>
      </section>

      {past.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold text-slate-900">Clases pasadas ({past.length})</summary>
          <ul className="mt-2 space-y-3">{past.map((item) => row(item, true))}</ul>
        </details>
      )}
    </div>
  );
}
