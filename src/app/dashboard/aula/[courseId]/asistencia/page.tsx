import Link from "next/link";
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  LOW_ATTENDANCE_PERCENT,
  getAttendanceOverview,
  getAttendanceSheet,
  getMyAttendance,
  type AttendanceCounts,
  type AttendanceOverview,
  type AttendanceSheet,
  type AttendanceStatus,
  type MyAttendance,
} from "@/server/courses/attendance";
import { DatePicker, DeleteSession, TakeAttendance } from "./AttendanceTools";

export const dynamic = "force-dynamic";

const dayFormat = new Intl.DateTimeFormat("es", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });
/** «martes, 14 de octubre de 2026» a partir de `AAAA-MM-DD`. */
const dayLabel = (date: string) => dayFormat.format(new Date(`${date}T00:00:00.000Z`));

const STATUS: Record<AttendanceStatus, { label: string; className: string }> = {
  PRESENT: { label: "Presente", className: "bg-emerald-50 text-emerald-800" },
  ABSENT: { label: "Ausente", className: "bg-red-50 text-red-800" },
  LATE: { label: "Tarde", className: "bg-amber-100 text-amber-900" },
  EXCUSED: { label: "Justificado", className: "bg-blue-50 text-blue-800" },
};

const link = "inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 underline";
const button = "inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800";
const card = "rounded-xl border border-slate-200 bg-white p-4 sm:p-5";

function countsText(counts: AttendanceCounts) {
  return [
    `${counts.present} ${counts.present === 1 ? "presente" : "presentes"}`,
    `${counts.absent} ${counts.absent === 1 ? "ausente" : "ausentes"}`,
    counts.late ? `${counts.late} ${counts.late === 1 ? "tarde" : "tardes"}` : "",
    counts.excused ? `${counts.excused} ${counts.excused === 1 ? "justificado" : "justificados"}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

const RULE = "Llegar tarde cuenta como asistencia. Las faltas justificadas no suman ni restan.";

export default async function AttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ vista?: string | string[]; fecha?: string | string[] }>;
}) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const { courseId } = await params;
  const query = await searchParams;
  const view = typeof query.vista === "string" ? query.vista : "";
  const date = typeof query.fecha === "string" ? query.fecha : undefined;
  const actor = { id: user.id, institutionId: user.institutionId, role: user.role };

  if (user.role === "STUDENT") {
    const mine = await getMyAttendance(actor, courseId);
    if (!mine) notFound();
    return <StudentView data={mine} />;
  }

  if (view === "historial" || view === "resumen") {
    const overview = await getAttendanceOverview(actor, courseId);
    if (!overview) notFound();
    return (
      <Shell courseId={overview.course.id} courseName={overview.course.name} view={view}>
        {view === "historial" ? <History data={overview} /> : <Summary data={overview} />}
      </Shell>
    );
  }

  const sheet = await getAttendanceSheet(actor, courseId, date);
  if (!sheet) notFound();
  return (
    <Shell courseId={sheet.course.id} courseName={sheet.course.name} view="tomar">
      <Take sheet={sheet} />
    </Shell>
  );
}

function Shell({ courseId, view, children }: { courseId: string; courseName: string; view: string; children: ReactNode }) {
  const base = `/dashboard/aula/${courseId}/asistencia`;
  const tabs = [
    { key: "tomar", label: "Tomar asistencia", href: base },
    { key: "historial", label: "Historial", href: `${base}?vista=historial` },
    { key: "resumen", label: "Resumen por estudiante", href: `${base}?vista=resumen` },
  ];
  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-8">
      <header>
        <h1 className="mt-1 text-2xl font-bold" style={{ color: "var(--navy)" }}>Asistencia</h1>
      </header>
      <nav aria-label="Secciones de asistencia" className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={tab.key === view ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold ${tab.key === view ? "bg-blue-600 text-white" : "border border-slate-300 bg-white text-slate-800"}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}

function Take({ sheet }: { sheet: AttendanceSheet }) {
  const isToday = sheet.date === sheet.today;
  const label = dayLabel(sheet.date);
  return (
    <section className={card} aria-labelledby="tomar">
      <h2 id="tomar" className="text-lg font-bold text-slate-950">
        {sheet.session ? "Corregir asistencia" : isToday ? "Tomar asistencia de hoy" : "Tomar asistencia"}
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        <span className="capitalize">{label}</span>
        {sheet.session ? " · ya está guardada; lo que cambies la corrige." : ""}
      </p>
      <div className="mt-3 max-w-xs">
        <DatePicker courseId={sheet.course.id} date={sheet.date} today={sheet.today} />
        {!isToday && <Link className={link} href={`/dashboard/aula/${sheet.course.id}/asistencia`}>Volver a hoy</Link>}
      </div>
      <div className="mt-4">
        {sheet.course.archived ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Este curso está archivado: puedes consultar el historial, pero no cambiar la asistencia.</p>
        ) : sheet.rows.length === 0 ? (
          <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
            <p>Todavía no hay estudiantes inscritos en este curso. Cuando los inscribas, aquí aparecerá la lista para marcar quién vino.</p>
            <Link className={`${button} mt-3`} href={`/dashboard/aula/${sheet.course.id}/estudiantes`}>Inscribir estudiantes</Link>
          </div>
        ) : (
          <TakeAttendance
            key={`${sheet.date}:${sheet.session?.id ?? "nueva"}`}
            courseId={sheet.course.id}
            date={sheet.date}
            dateLabel={label}
            isCorrection={Boolean(sheet.session)}
            initialTitle={sheet.session ? sheet.session.title : sheet.classTitles.length === 1 ? sheet.classTitles[0].slice(0, 120) : ""}
            classTitles={sheet.classTitles}
            rows={sheet.rows}
          />
        )}
      </div>
    </section>
  );
}

function History({ data }: { data: AttendanceOverview }) {
  const base = `/dashboard/aula/${data.course.id}/asistencia`;
  return (
    <section className={card} aria-labelledby="historial">
      <h2 id="historial" className="text-lg font-bold text-slate-950">Historial ({data.sessions.length})</h2>
      {data.sessions.length === 0 ? (
        <div className="mt-2 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          <p>Aquí verás cada día en que tomaste asistencia, con cuántos vinieron y cuántos faltaron. Todavía no hay ninguno.</p>
          <Link className={`${button} mt-3`} href={base}>Tomar asistencia de hoy</Link>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {data.sessions.map((session) => (
            <li key={session.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1 basis-56">
                <p className="font-semibold capitalize text-slate-950">{dayLabel(session.date)}</p>
                {session.title && <p className="text-sm text-slate-700">{session.title}</p>}
                <p className="text-sm text-slate-600">{countsText(session)}</p>
              </div>
              <Link className={button} href={`${base}?fecha=${session.date}`}>Abrir y corregir</Link>
              {!data.course.archived && <DeleteSession courseId={data.course.id} sessionId={session.id} dateLabel={dayLabel(session.date)} total={session.total} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Summary({ data }: { data: AttendanceOverview }) {
  const low = data.students.filter((student) => student.low).length;
  return (
    <section className={card} aria-labelledby="resumen">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <h2 id="resumen" className="text-lg font-bold text-slate-950">Resumen por estudiante</h2>
          <p className="mt-1 text-sm text-slate-600">
            {data.sessions.length === 1 ? "1 día registrado" : `${data.sessions.length} días registrados`}. {RULE}
          </p>
        </div>
        {data.students.length > 0 && data.sessions.length > 0 && (
          <a className={button} href={`/dashboard/aula/${data.course.id}/asistencia/descargar`}>Descargar para Excel</a>
        )}
      </div>
      {low > 0 && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">
          {low === 1 ? "1 estudiante tiene" : `${low} estudiantes tienen`} menos de {LOW_ATTENDANCE_PERCENT} % de asistencia.
        </p>
      )}
      {data.students.length === 0 || data.sessions.length === 0 ? (
        <p className="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          Aquí verás el porcentaje de asistencia de cada estudiante, con sus ausencias y tardanzas. Aparecerá cuando guardes la primera asistencia.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {data.students.map((student) => (
            <li key={student.studentId} className={`rounded-xl border p-4 ${student.low ? "border-amber-300 bg-amber-50/60" : "border-slate-200"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 font-semibold text-slate-950">{student.name}</p>
                <p className="text-xl font-bold text-slate-950">{student.percent === null ? "Sin datos" : `${student.percent} %`}</p>
              </div>
              {student.low && <p className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">Menos de {LOW_ATTENDANCE_PERCENT} % de asistencia</p>}
              <p className="mt-1 text-sm text-slate-600">
                {student.absent === 1 ? "1 ausencia" : `${student.absent} ausencias`} · {student.late === 1 ? "1 tardanza" : `${student.late} tardanzas`}
                {student.excused ? ` · ${student.excused === 1 ? "1 justificada" : `${student.excused} justificadas`}` : ""} · {student.recorded === 1 ? "1 día registrado" : `${student.recorded} días registrados`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StudentView({ data }: { data: MyAttendance }) {
  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-8">
      <header>
        <h1 className="mt-1 text-2xl font-bold" style={{ color: "var(--navy)" }}>Mi asistencia</h1>
      </header>
      {data.days.length === 0 ? (
        <p className={`${card} text-sm text-slate-600`}>Tu docente todavía no ha tomado asistencia en este curso. Cuando lo haga, aquí verás cada día y cómo vas.</p>
      ) : (
        <>
          <section className={`${card} ${data.low ? "border-amber-300 bg-amber-50/60" : ""}`} aria-label="Cómo voy">
            <p className="text-sm font-medium text-slate-600">Mi asistencia</p>
            <p className="mt-1 text-4xl font-bold text-slate-950">{data.percent === null ? "Sin datos" : `${data.percent} %`}</p>
            <p className="mt-1 text-sm text-slate-700">{countsText(data.counts)}</p>
            {data.low && <p className="mt-2 text-sm font-semibold text-amber-900">Estás por debajo de {LOW_ATTENDANCE_PERCENT} %. Habla con tu docente si necesitas ayuda.</p>}
            <p className="mt-2 text-xs text-slate-500">{RULE}</p>
          </section>
          <section className={card} aria-labelledby="dias">
            <h2 id="dias" className="text-lg font-bold text-slate-950">Día por día</h2>
            <ul className="mt-2 divide-y divide-slate-100">
              {data.days.map((day) => (
                <li key={day.date} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="font-medium capitalize text-slate-950">{dayLabel(day.date)}</p>
                    {day.title && <p className="text-sm text-slate-600">{day.title}</p>}
                  </div>
                  <span className={`rounded-full px-3 py-1 text-sm font-semibold ${STATUS[day.status].className}`}>{STATUS[day.status].label}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
