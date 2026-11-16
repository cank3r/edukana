"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  reinstateStudentAction,
  withdrawStudentAction,
  type CourseEnrollmentState,
} from "@/server/actions/course-enrollment";

const secondary = "min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 disabled:opacity-60";
const danger = "min-h-11 rounded-lg bg-red-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const field = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-500";
const empty: CourseEnrollmentState = { ok: false, message: "" };

const plain = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function Notice({ ok, message }: { ok: boolean; message: string }) {
  if (!message) return null;
  return <p role={ok ? "status" : "alert"} className={`mt-3 rounded-lg p-3 text-sm ${ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{message}</p>;
}

function ProgressBar({ percent, name }: { percent: number; name: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2.5 min-w-16 flex-1 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={`Avance de ${name}`}>
        <div className={`h-full rounded-full ${percent >= 100 ? "bg-emerald-500" : "bg-blue-600"}`} style={{ width: `${percent}%` }} />
      </div>
      <span className="w-11 text-right text-sm font-semibold text-slate-900">{percent}%</span>
    </div>
  );
}

const STATUS: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: "Activo", className: "bg-emerald-50 text-emerald-700" },
  COMPLETED: { label: "Terminó el curso", className: "bg-blue-50 text-blue-700" },
  FAILED: { label: "No aprobó", className: "bg-slate-100 text-slate-700" },
};

type Student = {
  enrollmentId: string;
  name: string;
  email: string;
  status: string;
  progressPercent: number;
  lessonsCompleted: number;
  assignmentsSubmitted: number;
  lastActivity: string;
  fallingBehind: boolean;
};

export function StudentList({ courseId, publishedLessons, publishedAssignments, students }: { courseId: string; publishedLessons: number; publishedAssignments: number; students: Student[] }) {
  const [query, setQuery] = useState("");
  const [onlyBehind, setOnlyBehind] = useState(false);
  const needle = plain(query.trim());
  const behindCount = students.filter((student) => student.fallingBehind).length;
  const shown = students.filter((student) => (!needle || plain(student.name).includes(needle)) && (!onlyBehind || student.fallingBehind));

  return (
    <div className="mt-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="sr-only" htmlFor="buscar-inscrito">Buscar estudiante por nombre</label>
        <input id="buscar-inscrito" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre…" className={field} autoComplete="off" />
        {behindCount > 0 && (
          <label className="flex min-h-11 shrink-0 items-center gap-2 text-sm font-medium text-slate-800">
            <input type="checkbox" className="h-5 w-5" checked={onlyBehind} onChange={(event) => setOnlyBehind(event.target.checked)} />
            Solo quienes se quedan atrás ({behindCount})
          </label>
        )}
      </div>
      {shown.length === 0 ? (
        <p className="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Nadie coincide con esa búsqueda. Revisa cómo está escrito el nombre.</p>
      ) : (
        <ul className="mt-3 space-y-3 md:space-y-0 md:divide-y md:divide-slate-100">
          {shown.map((student) => (
            <StudentRow key={student.enrollmentId} courseId={courseId} student={student} publishedLessons={publishedLessons} publishedAssignments={publishedAssignments} />
          ))}
        </ul>
      )}
    </div>
  );
}

function StudentRow({ courseId, student, publishedLessons, publishedAssignments }: { courseId: string; student: Student; publishedLessons: number; publishedAssignments: number }) {
  const [asking, setAsking] = useState(false);
  const [state, action, pending] = useActionState(withdrawStudentAction, empty);
  const status = STATUS[student.status] ?? STATUS.ACTIVE;
  return (
    <li className={`rounded-xl border p-4 md:rounded-none md:border-0 md:px-0 md:py-4 ${student.fallingBehind ? "border-amber-300 bg-amber-50/60 md:bg-transparent" : "border-slate-200"}`}>
      <div className="md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1.6fr)_auto] md:items-center md:gap-4">
        <div className="min-w-0">
          <Link className="inline-flex min-h-11 max-w-full items-center font-semibold text-blue-700 underline" href={`/dashboard/aula/${courseId}/estudiantes/${student.enrollmentId}`}>
            <span className="truncate">{student.name}</span>
          </Link>
          <p className="truncate text-sm text-slate-600">{student.email}</p>
          <p className="mt-1 flex flex-wrap gap-1 text-xs font-semibold">
            <span className={`rounded-full px-2 py-1 ${status.className}`}>{status.label}</span>
            {student.fallingBehind && <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-900">Se está quedando atrás</span>}
          </p>
        </div>
        <div className="mt-3 md:mt-0">
          <ProgressBar percent={student.progressPercent} name={student.name} />
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-sm md:mt-0 md:block md:space-y-0.5">
          <div className="md:flex md:gap-1"><dt className="text-xs text-slate-500 md:text-sm">Lecciones</dt><dd className="font-medium text-slate-900">{student.lessonsCompleted} de {publishedLessons}</dd></div>
          <div className="md:flex md:gap-1"><dt className="text-xs text-slate-500 md:text-sm">Tareas</dt><dd className="font-medium text-slate-900">{student.assignmentsSubmitted} de {publishedAssignments}</dd></div>
          <div className="md:flex md:gap-1"><dt className="text-xs text-slate-500 md:text-sm">Última actividad</dt><dd className="font-medium text-slate-900">{student.lastActivity || "Sin actividad"}</dd></div>
        </dl>
        <div className="mt-3 md:mt-0">
          {student.status === "ACTIVE" && !asking && <button type="button" className={`${secondary} w-full md:w-auto`} onClick={() => setAsking(true)}>Retirar del curso</button>}
        </div>
      </div>
      {asking && (
        <form action={action} className="mt-3 rounded-lg bg-amber-50 p-4">
          <input type="hidden" name="courseId" value={courseId} />
          <input type="hidden" name="enrollmentId" value={student.enrollmentId} />
          <p className="text-sm font-semibold text-amber-900">{student.name} dejará de ver este curso. Sus notas, entregas y avance se conservan, y puedes reincorporarlo cuando quieras.</p>
          <label className="mt-3 block text-sm font-medium text-slate-900">
            ¿Por qué se retira?
            <input name="reason" required maxLength={500} className={`${field} mt-1`} placeholder="Ejemplo: cambio de horario" autoComplete="off" />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={danger} type="submit" disabled={pending}>{pending ? "Retirando…" : "Sí, retirar del curso"}</button>
            <button className={secondary} type="button" disabled={pending} onClick={() => setAsking(false)}>Cancelar</button>
          </div>
        </form>
      )}
      <Notice ok={state.ok} message={state.message} />
    </li>
  );
}

type Withdrawn = { enrollmentId: string; name: string; email: string; reason: string; date: string };

export function WithdrawnList({ courseId, canReinstate, students }: { courseId: string; canReinstate: boolean; students: Withdrawn[] }) {
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <summary className="flex min-h-11 cursor-pointer items-center text-lg font-bold text-slate-950">Retirados ({students.length})</summary>
      <p className="mt-1 text-sm text-slate-600">Ya no ven el curso, pero sus notas, entregas y avance siguen guardados.</p>
      <ul className="mt-2 divide-y divide-slate-100">
        {students.map((student) => <WithdrawnRow key={student.enrollmentId} courseId={courseId} canReinstate={canReinstate} student={student} />)}
      </ul>
    </details>
  );
}

function WithdrawnRow({ courseId, canReinstate, student }: { courseId: string; canReinstate: boolean; student: Withdrawn }) {
  const [state, action, pending] = useActionState(reinstateStudentAction, empty);
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <Link className="inline-flex min-h-11 max-w-full items-center font-semibold text-blue-700 underline" href={`/dashboard/aula/${courseId}/estudiantes/${student.enrollmentId}`}>
            <span className="truncate">{student.name}</span>
          </Link>
          <p className="truncate text-sm text-slate-600">{student.email}</p>
          <p className="mt-1 text-sm text-slate-700">
            {student.date ? `Retirado el ${student.date}` : "Retirado"}
            {student.reason ? ` · Motivo: ${student.reason}` : ""}
          </p>
        </div>
        {canReinstate && (
          <form action={action}>
            <input type="hidden" name="courseId" value={courseId} />
            <input type="hidden" name="enrollmentId" value={student.enrollmentId} />
            <button className={secondary} type="submit" disabled={pending}>{pending ? "Reincorporando…" : "Reincorporar"}</button>
          </form>
        )}
      </div>
      <Notice ok={state.ok} message={state.message} />
    </li>
  );
}

export { EnrollPanel } from "./EnrollPanel";
