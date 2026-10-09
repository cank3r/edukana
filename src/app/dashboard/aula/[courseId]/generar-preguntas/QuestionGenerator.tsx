"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { generateQuestionsAction, saveReviewedQuestionsAction, type GenerateState, type SaveReviewedState } from "@/server/actions/ai";
import type { QuestionSource } from "@/server/ai/course";
import type { GeneratedQuestion } from "@/server/ai/parse";

const primary = "min-h-11 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const secondary = "inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 disabled:opacity-60";
const field = "mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base";
const emptyGenerate: GenerateState = { ok: false, message: "" };
const emptySave: SaveReviewedState = { ok: false, message: "" };

const KIND_OPTIONS = [
  { value: "MULTIPLE_CHOICE", label: "Opción múltiple", help: "El estudiante elige una respuesta. Se califica sola." },
  { value: "SHORT_ANSWER", label: "Respuesta corta", help: "El estudiante escribe. Tú la revisas." },
  { value: "MIXED", label: "De las dos", help: "Una mezcla de ambos tipos." },
] as const;

type Draft = GeneratedQuestion & { key: string; points: string };

function Notice({ ok, message }: { ok: boolean; message: string }) {
  if (!message) return null;
  return <p role={ok ? "status" : "alert"} className={`rounded-lg p-3 text-sm ${ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{message}</p>;
}

export function QuestionGenerator({ courseId, chapters, initialSource }: { courseId: string; chapters: QuestionSource[]; initialSource: string }) {
  const [state, action, pending] = useActionState(generateQuestionsAction, emptyGenerate);
  const [source, setSource] = useState(initialSource);
  const [kind, setKind] = useState<string>("MULTIPLE_CHOICE");

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <input type="hidden" name="courseId" value={courseId} />
        <label className="block text-sm font-semibold text-slate-900">
          ¿De dónde saco las preguntas?
          <select name="source" required value={source} onChange={(event) => setSource(event.target.value)} className={field}>
            <option value="" disabled>Elige una lección o un capítulo</option>
            {chapters.map((chapter) => (
              <optgroup key={chapter.id} label={chapter.title}>
                <option value={`chapter:${chapter.id}`} disabled={!chapter.hasText}>Todo el capítulo «{chapter.title}»</option>
                {chapter.lessons.map((lesson) => (
                  <option key={lesson.id} value={`lesson:${lesson.id}`} disabled={!lesson.hasText}>
                    {lesson.title}{lesson.hasText ? "" : " (sin texto)"}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <label className="block text-sm font-semibold text-slate-900 sm:max-w-xs">
          ¿Cuántas preguntas?
          <select name="count" defaultValue="5" className={field}>
            {[3, 4, 5, 6, 7, 8, 9, 10].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>

        <fieldset>
          <legend className="text-sm font-semibold text-slate-900">Tipo de preguntas</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {KIND_OPTIONS.map((option) => (
              <label key={option.value} className={`flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${kind === option.value ? "border-blue-600 bg-blue-50" : "border-slate-300 bg-white"}`}>
                <input type="radio" name="kind" value={option.value} checked={kind === option.value} onChange={() => setKind(option.value)} className="mt-1 h-4 w-4" />
                <span><span className="block font-semibold text-slate-900">{option.label}</span><span className="text-slate-600">{option.help}</span></span>
              </label>
            ))}
          </div>
        </fieldset>

        {!pending && !state.ok && <Notice ok={false} message={state.message} />}
        <button type="submit" className={primary} disabled={pending || !source}>
          {pending ? "Generando… puede tardar unos segundos" : state.ok ? "Generar otras preguntas" : "Generar preguntas"}
        </button>
      </form>

      {state.ok && state.questions && state.runId && (
        <Review key={state.runId} courseId={courseId} sourceTitle={state.sourceTitle ?? ""} message={state.message} questions={state.questions} />
      )}
    </div>
  );
}

function Review({ courseId, sourceTitle, message, questions }: { courseId: string; sourceTitle: string; message: string; questions: GeneratedQuestion[] }) {
  const [drafts, setDrafts] = useState<Draft[]>(() => questions.map((question, index) => ({ ...question, key: String(index), points: "1" })));
  const [state, action, pending] = useActionState(saveReviewedQuestionsAction, emptySave);
  const update = (key: string, change: Partial<Draft>) => setDrafts((current) => current.map((draft) => (draft.key === key ? ({ ...draft, ...change } as Draft) : draft)));
  const discard = (key: string) => setDrafts((current) => current.filter((draft) => draft.key !== key));

  if (state.ok) {
    return (
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <p role="status" className="font-semibold text-emerald-900">{state.message}</p>
        <p className="mt-1 text-sm text-emerald-900">Ya puedes usarlas al armar un examen.</p>
        <Link href={`/dashboard/aula/${courseId}/preguntas`} className={`${secondary} mt-3`}>Ver banco de preguntas</Link>
      </section>
    );
  }

  const payload = JSON.stringify(
    drafts.map((draft) => ({
      type: draft.type,
      prompt: draft.prompt,
      options: draft.type === "MULTIPLE_CHOICE" ? draft.options : undefined,
      correctIndex: draft.type === "MULTIPLE_CHOICE" ? draft.correctIndex : undefined,
      answer: draft.type === "SHORT_ANSWER" ? draft.answer : undefined,
      explanation: draft.explanation,
      points: Number(draft.points.replace(",", ".")),
    })),
  );

  return (
    <section aria-labelledby="revisar-preguntas" className="space-y-4">
      <div>
        <h2 id="revisar-preguntas" className="text-lg font-bold text-slate-950">Revisa las preguntas{sourceTitle ? ` sobre «${sourceTitle}»` : ""}</h2>
        <p className="mt-1 text-sm text-slate-600">{message} La IA puede equivocarse: corrige lo que haga falta y descarta las que no te sirvan. Nada se guarda hasta que pulses «Guardar».</p>
      </div>

      {drafts.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Descartaste todas las preguntas. Puedes generar otras arriba.</p>
      ) : (
        <ol className="space-y-4">
          {drafts.map((draft, index) => (
            <li key={draft.key} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-slate-900">
                  Pregunta {index + 1} · <span className="font-normal text-slate-600">{draft.type === "MULTIPLE_CHOICE" ? "Opción múltiple" : "Respuesta corta"}</span>
                </p>
                <button type="button" onClick={() => discard(draft.key)} className={secondary}>Descartar</button>
              </div>
              <label className="block text-sm font-semibold text-slate-900">
                Pregunta
                <textarea rows={2} maxLength={10000} value={draft.prompt} onChange={(event) => update(draft.key, { prompt: event.target.value })} className={field} />
              </label>

              {draft.type === "MULTIPLE_CHOICE" ? (
                <fieldset>
                  <legend className="text-sm font-semibold text-slate-900">Opciones (marca la correcta)</legend>
                  <ul className="mt-2 space-y-2">
                    {draft.options.map((option, position) => (
                      <li key={position} className="flex items-center gap-2">
                        <label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
                          <input type="radio" name={`correct-${draft.key}`} checked={draft.correctIndex === position} onChange={() => update(draft.key, { correctIndex: position })} className="h-5 w-5" aria-label={`La opción ${position + 1} es la correcta`} />
                        </label>
                        <input value={option} maxLength={500} onChange={(event) => update(draft.key, { options: draft.options.map((current, at) => (at === position ? event.target.value : current)) })} className={`${field} mt-0`} aria-label={`Texto de la opción ${position + 1}`} />
                      </li>
                    ))}
                  </ul>
                </fieldset>
              ) : (
                <label className="block text-sm font-semibold text-slate-900">
                  Respuesta esperada <span className="font-normal text-slate-600">(solo la ves tú, como guía al revisar)</span>
                  <textarea rows={2} maxLength={5000} value={draft.answer} onChange={(event) => update(draft.key, { answer: event.target.value })} className={field} />
                </label>
              )}

              <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
                <label className="block text-sm font-semibold text-slate-900">
                  Explicación <span className="font-normal text-slate-600">(opcional)</span>
                  <textarea rows={2} maxLength={5000} value={draft.explanation} onChange={(event) => update(draft.key, { explanation: event.target.value })} className={field} />
                </label>
                <label className="block text-sm font-semibold text-slate-900">
                  Puntos
                  <input type="number" inputMode="decimal" min="0.1" max="1000" step="any" value={draft.points} onChange={(event) => update(draft.key, { points: event.target.value })} className={field} />
                </label>
              </div>
            </li>
          ))}
        </ol>
      )}

      {drafts.length > 0 && (
        <form action={action} className="space-y-3">
          <input type="hidden" name="courseId" value={courseId} />
          <input type="hidden" name="questions" value={payload} />
          {!pending && <Notice ok={false} message={state.message} />}
          <button type="submit" className={`${primary} w-full sm:w-auto`} disabled={pending}>
            {pending ? "Guardando…" : drafts.length === 1 ? "Guardar 1 pregunta en el banco" : `Guardar ${drafts.length} preguntas en el banco`}
          </button>
        </form>
      )}
    </section>
  );
}
