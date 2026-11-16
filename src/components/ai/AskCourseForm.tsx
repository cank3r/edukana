"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { askCourseAction, type AskState } from "@/server/actions/ai";

const empty: AskState = { ok: false, message: "" };

export function AskCourseForm({ courseId, lessonId }: { courseId: string; lessonId: string }) {
  const [state, action, pending] = useActionState(askCourseAction, empty);
  const [question, setQuestion] = useState("");
  const answered = state.ok && state.answer;

  return (
    <div className="mt-1 space-y-3">
      <p className="text-sm text-slate-600">
        Escribe tu duda y el asistente te responde solo con lo que está en las lecciones de este curso. Tu pregunta no se guarda.
      </p>
      <form action={action} className="space-y-3">
        <input type="hidden" name="courseId" value={courseId} />
        <input type="hidden" name="lessonId" value={lessonId} />
        <label className="block text-sm font-semibold text-slate-900">
          Tu duda
          <textarea
            name="question"
            rows={3}
            required
            minLength={3}
            maxLength={1000}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base"
            placeholder="Ejemplo: ¿Qué diferencia hay entre los dos métodos de la lección?"
          />
        </label>
        <button type="submit" disabled={pending || question.trim().length < 3} className="min-h-11 w-full rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60 sm:w-auto">
          {pending ? "Buscando en el curso…" : "Preguntar"}
        </button>
      </form>

      {!pending && state.message && !state.ok && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{state.message}</p>
      )}
      {!pending && answered && (
        <div role="status" className="rounded-lg border border-slate-200 bg-white p-4">
          {state.question && <p className="text-sm text-slate-500">Preguntaste: «{state.question}»</p>}
          <p className={`mt-1 whitespace-pre-wrap break-words ${state.found ? "text-slate-900" : "font-semibold text-slate-800"}`}>{state.answer}</p>
          {state.found && state.sources && state.sources.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-semibold text-slate-700">Lo encontré en:</p>
              <ul className="mt-1 space-y-1">
                {state.sources.map((source) => (
                  <li key={source.id}>
                    <Link href={`/dashboard/aula/${courseId}/leccion/${source.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 underline">
                      {source.title}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-slate-500">El asistente puede equivocarse. Si algo no cuadra, revisa la lección o pregúntale a tu docente.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
