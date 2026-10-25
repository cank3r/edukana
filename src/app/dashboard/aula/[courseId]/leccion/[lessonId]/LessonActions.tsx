"use client";

import Link from "next/link";
import { useActionState } from "react";
import { setLessonCompletedAction, type LessonProgressState } from "@/server/actions/lesson-progress";

const primary = "inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-center font-semibold text-white disabled:opacity-60";
const secondary = "inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800";
const empty: LessonProgressState = { ok: false, message: "" };

type Props = {
  courseId: string;
  lessonId: string;
  previousHref: string | null;
  nextHref: string | null;
  courseHref: string;
  /** Fecha ya escrita en español, o null si la lección aún no está completada. */
  completedOn: string | null;
  /** false cuando el curso ya terminó para el estudiante: solo consulta. */
  canComplete: boolean;
};

/** Pie de la lección: una acción principal (completar y seguir) y «Anterior» como secundaria. */
export function LessonActions({ courseId, lessonId, previousHref, nextHref, courseHref, completedOn, canComplete }: Props) {
  const [state, action, pending] = useActionState(setLessonCompletedAction, empty);
  const isCompleted = completedOn !== null;
  const isLast = nextHref === null;

  return (
    <div className="mt-8 border-t border-slate-200 pt-5">
      {isCompleted && (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-700">
          <p><span aria-hidden="true" className="font-bold text-emerald-700">✓ </span>Completada el {completedOn}</p>
          {canComplete && (
            <form action={action}>
              <input type="hidden" name="courseId" value={courseId} />
              <input type="hidden" name="lessonId" value={lessonId} />
              <input type="hidden" name="completed" value="false" />
              <button type="submit" disabled={pending} className="min-h-11 font-semibold text-blue-700 underline disabled:opacity-60">
                {pending ? "Guardando…" : "Marcar como no completada"}
              </button>
            </form>
          )}
        </div>
      )}
      {!canComplete && !isCompleted && <p className="mb-4 text-sm text-slate-600">Este curso ya terminó: puedes consultarlo, pero tu avance ya no cambia.</p>}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        {previousHref ? <Link href={previousHref} className={secondary}>Anterior</Link> : <span />}
        {isCompleted || !canComplete ? (
          <Link href={nextHref ?? courseHref} className={primary}>{isLast ? "Volver al curso" : "Siguiente"}</Link>
        ) : (
          <form action={action} className="flex">
            <input type="hidden" name="courseId" value={courseId} />
            <input type="hidden" name="lessonId" value={lessonId} />
            <input type="hidden" name="completed" value="true" />
            <button type="submit" disabled={pending} className={`${primary} w-full`}>
              {pending ? "Guardando…" : isLast ? "Terminar" : "Marcar como completada y seguir"}
            </button>
          </form>
        )}
      </div>
      {state.message && (
        <p role={state.ok ? "status" : "alert"} className={`mt-3 rounded-lg p-3 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{state.message}</p>
      )}
    </div>
  );
}
