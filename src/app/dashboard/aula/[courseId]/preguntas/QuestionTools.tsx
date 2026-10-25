"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { deleteQuestionAction, saveQuestionAction, type QuestionActionState } from "@/server/actions/question-bank";
import { QUESTION_TYPE_HELP, QUESTION_TYPE_LABEL, type QuestionKind } from "./labels";

const primary = "min-h-11 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const secondary = "inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 disabled:opacity-60";
const danger = "min-h-11 rounded-lg bg-red-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const field = "mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base";
const empty: QuestionActionState = { ok: false, message: "" };
const KINDS: QuestionKind[] = ["MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_ANSWER"];

function Notice({ state }: { state: QuestionActionState }) {
  if (!state.message) return null;
  return <p role={state.ok ? "status" : "alert"} className={`rounded-lg p-3 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{state.message}</p>;
}

export type QuestionDraft = {
  id: string;
  type: QuestionKind;
  prompt: string;
  options: string[];
  answerKey: string;
  explanation: string;
  points: number;
};

/** Formulario de pregunta: lo que se pide cambia según el tipo elegido. */
export function QuestionForm({ courseId, question, examTitles }: { courseId: string; question?: QuestionDraft; examTitles?: string[] }) {
  const router = useRouter();
  const back = `/dashboard/aula/${courseId}/preguntas`;
  const [state, action, pending] = useActionState(saveQuestionAction, empty);
  const [type, setType] = useState<QuestionKind>(question?.type ?? "MULTIPLE_CHOICE");
  const [prompt, setPrompt] = useState(question?.prompt ?? "");
  const startOptions = question?.type === "MULTIPLE_CHOICE" && question.options.length >= 2 ? question.options : ["", "", ""];
  const [options, setOptions] = useState<string[]>(startOptions);
  const [correct, setCorrect] = useState<number>(question?.type === "MULTIPLE_CHOICE" ? startOptions.indexOf(question.answerKey) : -1);
  const [truth, setTruth] = useState(question?.type === "TRUE_FALSE" ? question.answerKey : "");
  const [expected, setExpected] = useState(question?.type === "SHORT_ANSWER" ? question.answerKey : "");
  const [explanation, setExplanation] = useState(question?.explanation ?? "");
  const [points, setPoints] = useState(String(question?.points ?? 1));

  useEffect(() => {
    if (state.ok) router.push(back);
  }, [state, router, back]);

  function removeOption(index: number) {
    setOptions(options.filter((_, position) => position !== index));
    setCorrect(correct === index ? -1 : correct > index ? correct - 1 : correct);
  }

  return (
    <form action={action} className="space-y-5">
      {question ? <input type="hidden" name="questionId" value={question.id} /> : <input type="hidden" name="courseId" value={courseId} />}
      {examTitles && examTitles.length > 0 && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Esta pregunta ya está en {examTitles.length === 1 ? "el examen" : "los exámenes"} {examTitles.map((title) => `«${title}»`).join(", ")}. Lo que cambies aquí <strong>no cambia esos exámenes</strong>: cada examen guarda su propia copia de la pregunta tal como estaba cuando se armó. El cambio se verá en los exámenes donde la agregues a partir de ahora.
        </p>
      )}

      <fieldset>
        <legend className="text-sm font-semibold text-slate-900">Tipo de pregunta</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {KINDS.map((kind) => (
            <label key={kind} className={`flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${type === kind ? "border-blue-600 bg-blue-50" : "border-slate-300 bg-white"}`}>
              <input type="radio" name="type" value={kind} checked={type === kind} onChange={() => setType(kind)} className="mt-1 h-4 w-4" />
              <span><span className="block font-semibold text-slate-900">{QUESTION_TYPE_LABEL[kind]}</span><span className="text-slate-600">{QUESTION_TYPE_HELP[kind]}</span></span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block text-sm font-semibold text-slate-900">
        Pregunta
        <textarea name="prompt" rows={3} required maxLength={10000} value={prompt} onChange={(event) => setPrompt(event.target.value)} className={field} placeholder={type === "TRUE_FALSE" ? "Escribe una afirmación. Ejemplo: El agua hierve a 100 °C al nivel del mar." : "Escribe la pregunta tal como la leerá el estudiante."} />
      </label>

      {type === "MULTIPLE_CHOICE" && (
        <fieldset>
          <legend className="text-sm font-semibold text-slate-900">Opciones</legend>
          <p className="text-sm text-slate-600">Escribe de 2 a 6 opciones y marca el círculo de la correcta.</p>
          <ul className="mt-2 space-y-2">
            {options.map((option, index) => (
              <li key={index} className="flex items-center gap-2">
                <label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center" title="Marcar como correcta">
                  <input type="radio" name="correctIndex" value={index} checked={correct === index} onChange={() => setCorrect(index)} className="h-5 w-5" aria-label={`La opción ${index + 1} es la correcta`} />
                </label>
                <input name="option" value={option} maxLength={500} onChange={(event) => setOptions(options.map((current, position) => (position === index ? event.target.value : current)))} className={`${field} mt-0`} placeholder={`Opción ${index + 1}`} aria-label={`Texto de la opción ${index + 1}`} />
                {options.length > 2 && <button type="button" onClick={() => removeOption(index)} className="min-h-11 min-w-11 rounded-lg border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-700" aria-label={`Quitar la opción ${index + 1}`}>Quitar</button>}
              </li>
            ))}
          </ul>
          {options.length < 6 && <button type="button" onClick={() => setOptions([...options, ""])} className={`${secondary} mt-2`}>Agregar otra opción</button>}
          <p className="mt-2 text-sm text-slate-600" aria-live="polite">{correct >= 0 && options[correct]?.trim() ? `Respuesta correcta: ${options[correct]}` : "Aún no has marcado la respuesta correcta."}</p>
        </fieldset>
      )}

      {type === "TRUE_FALSE" && (
        <fieldset>
          <legend className="text-sm font-semibold text-slate-900">¿Cuál es la respuesta correcta?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {["Verdadero", "Falso"].map((value) => (
              <label key={value} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 font-semibold ${truth === value ? "border-blue-600 bg-blue-50" : "border-slate-300 bg-white"}`}>
                <input type="radio" name="truth" value={value} checked={truth === value} onChange={() => setTruth(value)} className="h-4 w-4" />
                {value}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {type === "SHORT_ANSWER" && (
        <div>
          <label className="block text-sm font-semibold text-slate-900">
            Respuesta esperada
            <textarea name="expected" rows={2} maxLength={5000} value={expected} onChange={(event) => setExpected(event.target.value)} className={field} placeholder="Lo que esperas que responda el estudiante." />
          </label>
          <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">Esta pregunta no se califica sola. Cuando un estudiante envíe el examen, tú lees su respuesta y le pones los puntos en «Resultados». La respuesta esperada solo la ves tú, como guía. La nota del examen queda pendiente hasta que lo revises.</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-slate-900">
          Puntos que vale
          <input name="points" type="number" inputMode="decimal" min="0.1" max="1000" step="any" required value={points} onChange={(event) => setPoints(event.target.value)} className={field} />
          <span className="mt-1 block font-normal text-slate-600">Puedes cambiarlos en cada examen.</span>
        </label>
      </div>

      <label className="block text-sm font-semibold text-slate-900">
        Explicación <span className="font-normal text-slate-600">(opcional)</span>
        <textarea name="explanation" rows={2} maxLength={5000} value={explanation} onChange={(event) => setExplanation(event.target.value)} className={field} placeholder="Por qué esa es la respuesta correcta. Te sirve de apunte." />
      </label>

      <Notice state={state} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primary} disabled={pending}>{pending ? "Guardando…" : question ? "Guardar cambios" : "Agregar pregunta"}</button>
        <Link href={back} className={secondary}>Cancelar</Link>
      </div>
    </form>
  );
}

/** Botón «Borrar» con confirmación que dice el impacto. Si la pregunta está en un examen, explica por qué no se puede. */
export function DeleteQuestion({ questionId, examCount, redirectTo }: { questionId: string; examCount: number; redirectTo?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(deleteQuestionAction, empty);

  useEffect(() => {
    if (!state.ok) return;
    if (redirectTo) router.push(redirectTo);
    else router.refresh();
  }, [state, router, redirectTo]);

  if (!open) return <button type="button" className={secondary} onClick={() => setOpen(true)}>Borrar</button>;
  return (
    <div className="w-full rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
      {examCount > 0 ? (
        <>
          <p>No se puede borrar: esta pregunta está en {examCount === 1 ? "1 examen" : `${examCount} exámenes`}. Quítala primero de {examCount === 1 ? "ese examen" : "esos exámenes"}. Si ya {examCount === 1 ? "tiene" : "tienen"} intentos de estudiantes, la pregunta debe quedarse para conservar sus respuestas.</p>
          <button type="button" className={`${secondary} mt-3`} onClick={() => setOpen(false)}>Entendido</button>
        </>
      ) : (
        <form action={action}>
          <input type="hidden" name="questionId" value={questionId} />
          <p>¿Borrar esta pregunta del banco? No está en ningún examen, así que no se pierde ninguna respuesta. No se puede deshacer.</p>
          {!state.ok && state.message && <p role="alert" className="mt-2 font-semibold">{state.message}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="submit" className={danger} disabled={pending}>{pending ? "Borrando…" : "Sí, borrar pregunta"}</button>
            <button type="button" className={secondary} disabled={pending} onClick={() => setOpen(false)}>Cancelar</button>
          </div>
        </form>
      )}
    </div>
  );
}
