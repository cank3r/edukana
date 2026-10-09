"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { deleteAttendanceSessionAction, saveAttendanceAction, type AttendanceState } from "@/server/actions/attendance";

const primary = "min-h-11 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const secondary = "min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 disabled:opacity-60";
const danger = "min-h-11 rounded-lg bg-red-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const field = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-500";
const empty: AttendanceState = { ok: false, message: "" };

type Status = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
const OPTIONS: Array<{ value: Status; label: string; on: string }> = [
  { value: "PRESENT", label: "Presente", on: "border-emerald-700 bg-emerald-700 text-white" },
  { value: "ABSENT", label: "Ausente", on: "border-red-600 bg-red-600 text-white" },
  { value: "LATE", label: "Tarde", on: "border-amber-400 bg-amber-400 text-slate-950" },
  { value: "EXCUSED", label: "Justificado", on: "border-blue-600 bg-blue-600 text-white" },
];

function Notice({ ok, message }: { ok: boolean; message: string }) {
  if (!message) return null;
  return <p role={ok ? "status" : "alert"} className={`mt-3 rounded-lg p-3 text-sm ${ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{message}</p>;
}

/** Selector de día: al cambiarlo se abre la asistencia de esa fecha (nunca una futura). */
export function DatePicker({ courseId, date, today }: { courseId: string; date: string; today: string }) {
  const router = useRouter();
  return (
    <label className="block text-sm font-medium text-slate-900">
      Día
      <input
        type="date"
        className={`${field} mt-1`}
        value={date}
        max={today}
        onChange={(event) => {
          const value = event.target.value;
          if (value && value <= today) router.push(`/dashboard/aula/${courseId}/asistencia?fecha=${value}`);
        }}
      />
    </label>
  );
}

type Row = { studentId: string; name: string; status: Status; note: string; withdrawn: boolean; completed: boolean };

export function TakeAttendance({
  courseId,
  date,
  dateLabel,
  isCorrection,
  initialTitle,
  classTitles,
  rows,
}: {
  courseId: string;
  date: string;
  dateLabel: string;
  isCorrection: boolean;
  initialTitle: string;
  classTitles: string[];
  rows: Row[];
}) {
  const [state, action, pending] = useActionState(saveAttendanceAction, empty);
  const [title, setTitle] = useState(initialTitle);
  const [marks, setMarks] = useState(() => Object.fromEntries(rows.map((row) => [row.studentId, { status: row.status, note: row.note }])));

  const markOf = (row: Row) => marks[row.studentId] ?? { status: row.status, note: row.note };
  const count = (status: Status) => rows.filter((row) => markOf(row).status === status).length;
  const totals = [
    `${count("PRESENT")} ${count("PRESENT") === 1 ? "presente" : "presentes"}`,
    `${count("ABSENT")} ${count("ABSENT") === 1 ? "ausente" : "ausentes"}`,
    count("LATE") ? `${count("LATE")} ${count("LATE") === 1 ? "tarde" : "tardes"}` : "",
    count("EXCUSED") ? `${count("EXCUSED")} ${count("EXCUSED") === 1 ? "justificado" : "justificados"}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const entries = rows.map((row) => ({ studentId: row.studentId, status: markOf(row).status, note: markOf(row).note }));
  const set = (row: Row, change: Partial<{ status: Status; note: string }>) =>
    setMarks((current) => ({ ...current, [row.studentId]: { ...(current[row.studentId] ?? { status: row.status, note: row.note }), ...change } }));
  const suggestions = classTitles.filter((item) => item !== title);

  return (
    <form action={action}>
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="entries" value={JSON.stringify(entries)} />

      <label className="block text-sm font-medium text-slate-900">
        Título de la clase (opcional)
        <input name="title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} className={`${field} mt-1`} placeholder="Ejemplo: Repaso del capítulo 2" autoComplete="off" />
      </label>
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span>Clase en vivo de este día:</span>
          {suggestions.map((item) => (
            <button key={item} type="button" className={`${secondary} text-left`} onClick={() => setTitle(item.slice(0, 120))}>Usar «{item}»</button>
          ))}
        </div>
      )}

      <p className="mt-4 text-sm text-slate-600">Todos empiezan en Presente. Toca solo a quien faltó, llegó tarde o tiene justificación.</p>

      <ul className="mt-3 space-y-3">
        {rows.map((row) => {
          const mark = markOf(row);
          return (
            <li key={row.studentId} className={`rounded-xl border p-3 sm:p-4 ${mark.status === "PRESENT" ? "border-slate-200" : "border-amber-300 bg-amber-50/50"}`}>
              <fieldset>
                <legend className="font-semibold text-slate-950">
                  {row.name}
                  {row.withdrawn && <span className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">Ya no está en el curso</span>}
                  {row.completed && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">Completó el curso</span>}
                </legend>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className={`flex min-h-12 cursor-pointer items-center justify-center rounded-lg border-2 px-2 text-center text-sm font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue-700 ${mark.status === option.value ? option.on : "border-slate-300 bg-white text-slate-800"}`}
                    >
                      <input type="radio" className="sr-only" name={`estado-${row.studentId}`} checked={mark.status === option.value} onChange={() => set(row, { status: option.value })} />
                      {option.label}
                    </label>
                  ))}
                </div>
                {mark.status !== "PRESENT" && (
                  <label className="mt-2 block text-sm font-medium text-slate-900">
                    Nota (opcional)
                    <input value={mark.note} onChange={(event) => set(row, { note: event.target.value })} maxLength={300} className={`${field} mt-1`} placeholder="Ejemplo: avisó que tenía cita médica" autoComplete="off" />
                  </label>
                )}
              </fieldset>
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-0 -mx-4 mt-4 border-t border-slate-200 bg-white p-4 sm:-mx-5 sm:px-5">
        <p className="text-base font-bold text-slate-950" aria-live="polite">{totals}</p>
        <p className="text-sm text-slate-600">Asistencia del {dateLabel}</p>
        <button className={`${primary} mt-3 w-full sm:w-auto`} type="submit" disabled={pending}>
          {pending ? "Guardando…" : isCorrection ? "Guardar cambios" : "Guardar asistencia"}
        </button>
        <Notice ok={state.ok} message={state.message} />
      </div>
    </form>
  );
}

/** Borrar la asistencia de un día, con confirmación que dice el impacto. */
export function DeleteSession({ courseId, sessionId, dateLabel, total }: { courseId: string; sessionId: string; dateLabel: string; total: number }) {
  const [asking, setAsking] = useState(false);
  const [state, action, pending] = useActionState(deleteAttendanceSessionAction, empty);
  if (!asking) {
    return (
      <>
        <button type="button" className={secondary} onClick={() => setAsking(true)}>Borrar</button>
        <Notice ok={state.ok} message={state.message} />
      </>
    );
  }
  return (
    <form action={action} className="w-full rounded-lg bg-red-50 p-4">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="sessionId" value={sessionId} />
      <p className="text-sm font-semibold text-red-900">
        Se borrará la asistencia del {dateLabel} de {total === 1 ? "1 estudiante" : `${total} estudiantes`}. Ese día dejará de contar en sus porcentajes y no se puede deshacer.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={danger} type="submit" disabled={pending}>{pending ? "Borrando…" : "Sí, borrar esta asistencia"}</button>
        <button className={secondary} type="button" disabled={pending} onClick={() => setAsking(false)}>Cancelar</button>
      </div>
      <Notice ok={state.ok} message={state.message} />
    </form>
  );
}
