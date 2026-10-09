"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { deleteExamAction, reviewExamAttemptAction, saveExamAction, setExamPublishedAction, type ExamActionState } from "@/server/actions/exam-admin";
import { QUESTION_TYPE_LABEL, formatPoints, type QuestionKind } from "../preguntas/labels";

const primary = "min-h-11 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const secondary = "inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 disabled:opacity-60";
const danger = "min-h-11 rounded-lg bg-red-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const field = "mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base disabled:bg-slate-100 disabled:text-slate-600";
const small = "min-h-11 min-w-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 disabled:opacity-40";
const empty: ExamActionState = { ok: false, message: "" };

function Notice({ state }: { state: ExamActionState }) {
  if (!state.message) return null;
  return <p role={state.ok ? "status" : "alert"} className={`rounded-lg p-3 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{state.message}</p>;
}

export type BankChoice = { id: string; type: QuestionKind; prompt: string; defaultPoints: number };
type Chosen = { bankItemId: string; type: QuestionKind; prompt: string; points: string };
export type ExamDraft = {
  id: string;
  title: string;
  instructions: string;
  opensAt: string;
  closesAt: string;
  durationMinutes: number | null;
  maxAttempts: number;
  showReview: boolean;
  gradeCategoryName: string | null;
  attemptCount: number;
  questions: Array<{ bankItemId: string; type: QuestionKind; prompt: string; points: number }>;
};

const toNumber = (value: string) => (value.trim() === "" ? Number.NaN : Number(value.replace(",", ".")));

/** Formulario para crear o corregir un examen. Con intentos, solo quedan abiertos título, instrucciones y fechas. */
export function ExamForm({ courseId, bank, categories, exam, timezoneLabel }: { courseId: string; bank: BankChoice[]; categories: Array<{ id: string; name: string }>; exam?: ExamDraft; timezoneLabel: string }) {
  const router = useRouter();
  const base = `/dashboard/aula/${courseId}`;
  const locked = Boolean(exam && exam.attemptCount > 0);
  const [state, action, pending] = useActionState(saveExamAction, empty);
  const [title, setTitle] = useState(exam?.title ?? "");
  const [instructions, setInstructions] = useState(exam?.instructions ?? "");
  const [chosen, setChosen] = useState<Chosen[]>(exam?.questions.map((question) => ({ ...question, points: String(question.points) })) ?? []);
  const [duration, setDuration] = useState(exam?.durationMinutes ? String(exam.durationMinutes) : "");
  const [maxAttempts, setMaxAttempts] = useState(String(exam?.maxAttempts ?? 1));
  const [opensAt, setOpensAt] = useState(exam?.opensAt ?? "");
  const [closesAt, setClosesAt] = useState(exam?.closesAt ?? "");
  const [showReview, setShowReview] = useState(exam?.showReview ?? true);
  const [gradeCategoryId, setGradeCategoryId] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (state.ok && !exam && state.examId) router.push(`${base}/examenes/${state.examId}`);
    else if (state.ok) router.refresh();
  }, [state, exam, router, base]);

  const chosenIds = new Set(chosen.map((question) => question.bankItemId));
  const needle = search.trim().toLocaleLowerCase("es");
  const available = bank.filter((question) => !chosenIds.has(question.id) && (!needle || question.prompt.toLocaleLowerCase("es").includes(needle)));
  const totalPoints = chosen.reduce((sum, question) => sum + (Number.isFinite(toNumber(question.points)) ? toNumber(question.points) : 0), 0);
  const needsReview = chosen.some((question) => question.type === "SHORT_ANSWER");

  function move(index: number, step: -1 | 1) {
    const next = [...chosen];
    const target = index + step;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setChosen(next);
  }

  const payload = JSON.stringify({
    title,
    instructions,
    questions: chosen.map((question) => ({ bankItemId: question.bankItemId, points: toNumber(question.points) })),
    durationMinutes: duration.trim() === "" ? null : toNumber(duration),
    maxAttempts: toNumber(maxAttempts),
    opensAt,
    closesAt,
    showReview,
    gradeCategoryId,
  });

  return (
    <form action={action} className="space-y-6">
      {exam ? <input type="hidden" name="examId" value={exam.id} /> : <input type="hidden" name="courseId" value={courseId} />}
      <input type="hidden" name="payload" value={payload} />

      {locked && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Este examen ya tiene {exam!.attemptCount === 1 ? "1 intento" : `${exam!.attemptCount} intentos`} de estudiantes. Para que todos sean evaluados con las mismas reglas, ya no se pueden cambiar las preguntas, los puntos, el tiempo, los intentos permitidos ni si se muestran las respuestas. Sí puedes cambiar el título, las instrucciones y las fechas, y publicarlo u ocultarlo.
        </p>
      )}

      <section className="space-y-4" aria-labelledby="examen-datos">
        <h2 id="examen-datos" className="text-lg font-bold text-slate-950">1. Datos del examen</h2>
        <label className="block text-sm font-semibold text-slate-900">
          Título
          <input value={title} onChange={(event) => setTitle(event.target.value)} required minLength={3} maxLength={140} className={field} placeholder="Ejemplo: Examen parcial 1" />
        </label>
        <label className="block text-sm font-semibold text-slate-900">
          Instrucciones <span className="font-normal text-slate-600">(opcional)</span>
          <textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={3} maxLength={20000} className={field} placeholder="Lo que el estudiante debe saber antes de empezar." />
        </label>
      </section>

      <section className="space-y-3" aria-labelledby="examen-preguntas">
        <h2 id="examen-preguntas" className="text-lg font-bold text-slate-950">2. Preguntas</h2>
        {chosen.length === 0 ? (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">Aún no has elegido preguntas. Agrégalas desde el banco, aquí abajo. Puedes guardar el borrador y terminar después.</p>
        ) : (
          <ol className="space-y-2">
            {chosen.map((question, index) => (
              <li key={question.bankItemId} className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pregunta {index + 1} · {QUESTION_TYPE_LABEL[question.type]}</p>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm font-semibold text-slate-950">{question.prompt}</p>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="text-sm font-medium text-slate-900">
                    Puntos
                    <input type="number" inputMode="decimal" min="0" max="1000" step="any" disabled={locked} value={question.points} onChange={(event) => setChosen(chosen.map((current, position) => (position === index ? { ...current, points: event.target.value } : current)))} className={`${field} w-24`} aria-label={`Puntos de la pregunta ${index + 1}`} />
                  </label>
                  {!locked && (
                    <>
                      <button type="button" className={small} disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Subir la pregunta ${index + 1}`}>Subir</button>
                      <button type="button" className={small} disabled={index === chosen.length - 1} onClick={() => move(index, 1)} aria-label={`Bajar la pregunta ${index + 1}`}>Bajar</button>
                      <button type="button" className={small} onClick={() => setChosen(chosen.filter((_, position) => position !== index))} aria-label={`Quitar la pregunta ${index + 1} del examen`}>Quitar</button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
        <p className="text-sm font-semibold text-slate-900" aria-live="polite">
          {chosen.length} {chosen.length === 1 ? "pregunta" : "preguntas"} · {formatPoints(totalPoints)} en total
        </p>
        {needsReview && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">Este examen tiene preguntas de respuesta corta: la nota de cada estudiante queda pendiente hasta que revises sus respuestas en «Resultados».</p>}

        {!locked && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <h3 className="font-semibold text-slate-950">Agregar del banco de preguntas</h3>
            {bank.length === 0 ? (
              <p className="mt-1 text-sm text-slate-700">El banco de este curso está vacío. <Link href={`${base}/preguntas/nueva`} className="font-semibold text-blue-700 underline">Agrega tu primera pregunta</Link> y vuelve aquí.</p>
            ) : (
              <>
                <label className="mt-2 block text-sm font-medium text-slate-900">
                  Buscar en el banco
                  <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} className={field} placeholder="Palabras de la pregunta" />
                </label>
                {available.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-700">{needle ? "Ninguna pregunta coincide con la búsqueda." : "Ya elegiste todas las preguntas del banco."}</p>
                ) : (
                  <ul className="mt-2 max-h-96 space-y-2 overflow-y-auto">
                    {available.map((question) => (
                      <li key={question.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-slate-500">{QUESTION_TYPE_LABEL[question.type]} · {formatPoints(question.defaultPoints)}</p>
                          <p className="line-clamp-2 break-words text-sm text-slate-950">{question.prompt}</p>
                        </div>
                        <button type="button" className={small} onClick={() => setChosen([...chosen, { bankItemId: question.id, type: question.type, prompt: question.prompt, points: String(question.defaultPoints) }])}>Agregar</button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
        {exam && !locked && <p className="text-sm text-slate-600">Las preguntas que ya están en el examen se quedan como estaban cuando las agregaste. Si corregiste una en el banco y quieres la versión nueva, quítala de aquí y vuelve a agregarla.</p>}
      </section>

      <section className="space-y-4" aria-labelledby="examen-reglas">
        <h2 id="examen-reglas" className="text-lg font-bold text-slate-950">3. Reglas</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-slate-900">
            Tiempo límite en minutos <span className="font-normal text-slate-600">(opcional)</span>
            <input type="number" inputMode="numeric" min="1" max="600" step="1" disabled={locked} value={duration} onChange={(event) => setDuration(event.target.value)} className={field} placeholder="Sin límite" />
            <span className="mt-1 block font-normal text-slate-600">Si lo dejas vacío, el estudiante tiene hasta la fecha de cierre; si tampoco hay cierre, 24 horas desde que empieza.</span>
          </label>
          <label className="block text-sm font-semibold text-slate-900">
            Intentos permitidos
            <input type="number" inputMode="numeric" min="1" max="10" step="1" required disabled={locked} value={maxAttempts} onChange={(event) => setMaxAttempts(event.target.value)} className={field} />
          </label>
          <label className="block text-sm font-semibold text-slate-900">
            Se abre <span className="font-normal text-slate-600">(opcional)</span>
            <input type="datetime-local" value={opensAt} onChange={(event) => setOpensAt(event.target.value)} className={field} />
          </label>
          <label className="block text-sm font-semibold text-slate-900">
            Se cierra <span className="font-normal text-slate-600">(opcional)</span>
            <input type="datetime-local" value={closesAt} onChange={(event) => setClosesAt(event.target.value)} className={field} />
          </label>
        </div>
        <p className="text-sm text-slate-600">Las fechas usan la hora de la institución ({timezoneLabel}). Sin fechas, el examen está disponible mientras esté publicado.</p>
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-slate-900">
          <input type="checkbox" checked={showReview} disabled={locked} onChange={(event) => setShowReview(event.target.checked)} className="h-5 w-5" />
          Mostrar respuestas correctas al terminar
        </label>
        {!exam && categories.length > 0 && (
          <label className="block text-sm font-semibold text-slate-900">
            ¿Cuenta para la nota del curso?
            <select value={gradeCategoryId} onChange={(event) => setGradeCategoryId(event.target.value)} className={field}>
              <option value="">No, solo es práctica</option>
              {categories.map((category) => <option key={category.id} value={category.id}>Sí, en: {category.name}</option>)}
            </select>
            <span className="mt-1 block font-normal text-slate-600">Si eliges una categoría, la nota de cada estudiante pasa sola al libro de calificaciones. Esto se decide al crear el examen.</span>
          </label>
        )}
        {exam && <p className="text-sm text-slate-600">{exam.gradeCategoryName ? `La nota de este examen pasa al libro de calificaciones, en «${exam.gradeCategoryName}».` : "Este examen es de práctica: su nota no pasa al libro de calificaciones."}</p>}
      </section>

      <Notice state={state} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primary} disabled={pending}>{pending ? "Guardando…" : exam ? "Guardar cambios" : "Guardar borrador"}</button>
        <Link href={`${base}/examenes`} className={secondary}>{exam ? "Volver a exámenes" : "Cancelar"}</Link>
      </div>
      {!exam && <p className="text-sm text-slate-600">El examen se guarda como borrador: los estudiantes no lo ven hasta que lo publiques.</p>}
    </form>
  );
}

/** Publicar u ocultar, con confirmación que dice a quién afecta. */
export function PublishExam({ examId, published, blocker, attemptCount }: { examId: string; published: boolean; blocker: string | null; attemptCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(setExamPublishedAction, empty);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  if (!published && blocker) return <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{blocker}</p>;
  if (!open || state.ok) {
    return (
      <div className="space-y-2">
        {state.ok && <Notice state={state} />}
        <button type="button" className={published ? secondary : primary} onClick={() => setOpen(true)}>{published ? "Ocultar examen" : "Publicar examen"}</button>
      </div>
    );
  }
  return (
    <form action={action} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
      <input type="hidden" name="examId" value={examId} />
      <input type="hidden" name="publish" value={published ? "false" : "true"} />
      <p>
        {published
          ? `Los estudiantes dejarán de ver este examen y nadie podrá empezar un intento nuevo.${attemptCount ? " Los intentos ya hechos y sus notas se conservan; quien lo esté presentando ahora todavía puede enviarlo." : ""}`
          : "Los estudiantes inscritos en el curso verán el examen y podrán presentarlo dentro de las fechas que pusiste. Cuando alguien lo empiece, ya no podrás cambiar las preguntas ni los puntos."}
      </p>
      {!state.ok && state.message && <p role="alert" className="mt-2 font-semibold text-red-800">{state.message}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" className={primary} disabled={pending}>{pending ? "Guardando…" : published ? "Sí, ocultar" : "Sí, publicar"}</button>
        <button type="button" className={secondary} disabled={pending} onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    </form>
  );
}

/** Borrar examen: dice qué se pierde y, si hay intentos, pide el motivo. */
export function DeleteExam({ examId, courseId, attemptCount, studentCount, gradeEntries }: { examId: string; courseId: string; attemptCount: number; studentCount: number; gradeEntries: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(deleteExamAction, empty);

  useEffect(() => {
    if (state.ok) router.push(`/dashboard/aula/${courseId}/examenes`);
  }, [state, router, courseId]);

  if (!open) return <button type="button" className={secondary} onClick={() => setOpen(true)}>Borrar examen</button>;
  return (
    <form action={action} className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
      <input type="hidden" name="examId" value={examId} />
      {attemptCount > 0 ? (
        <>
          <p>
            Vas a borrar este examen para siempre, junto con {attemptCount === 1 ? "el intento" : `los ${attemptCount} intentos`} y las respuestas de {studentCount === 1 ? "1 estudiante" : `${studentCount} estudiantes`}. No se puede deshacer.{" "}
            {gradeEntries > 0 && `${gradeEntries === 1 ? "La nota que ya pasó" : `Las ${gradeEntries} notas que ya pasaron`} al libro de calificaciones no se borra${gradeEntries === 1 ? "" : "n"}: se queda${gradeEntries === 1 ? "" : "n"} allí y puedes corregirla${gradeEntries === 1 ? "" : "s"} desde el libro.`}
          </p>
          <p className="mt-2">Si solo quieres que los estudiantes no lo vean, usa «Ocultar examen».</p>
          <label className="mt-3 block font-semibold">
            Motivo para borrarlo
            <textarea name="reason" required minLength={5} maxLength={500} rows={2} className={field} placeholder="Ejemplo: se publicó por error con las preguntas equivocadas." />
          </label>
        </>
      ) : (
        <p>¿Borrar este examen? Nadie lo ha presentado, así que no se pierde ninguna respuesta ni nota. Las preguntas siguen en el banco. No se puede deshacer.</p>
      )}
      {!state.ok && state.message && <p role="alert" className="mt-2 font-semibold">{state.message}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" className={danger} disabled={pending}>{pending ? "Borrando…" : "Sí, borrar examen"}</button>
        <button type="button" className={secondary} disabled={pending} onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    </form>
  );
}

export type ReviewAnswer = { id: string; number: number; prompt: string; expected: string; response: string; points: number };

/** Revisión de las respuestas cortas de un intento: puntos y comentario por respuesta. */
export function ReviewAttempt({ attemptId, answers }: { attemptId: string; answers: ReviewAnswer[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(reviewExamAttemptAction, empty);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  if (state.ok) return <Notice state={state} />;
  return (
    <form action={action} className="mt-3 space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <input type="hidden" name="attemptId" value={attemptId} />
      <p className="text-sm font-semibold text-amber-900">Lee cada respuesta y ponle los puntos. Al guardar, la nota del intento queda lista.</p>
      {answers.map((answer) => (
        <fieldset key={answer.id} className="rounded-lg border border-slate-200 bg-white p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Pregunta {answer.number} · Respuesta corta</legend>
          <p className="whitespace-pre-wrap break-words text-sm font-semibold text-slate-950">{answer.prompt}</p>
          <p className="mt-2 text-xs font-semibold text-slate-500">Respuesta del estudiante</p>
          <p className="whitespace-pre-wrap break-words rounded bg-slate-50 p-2 text-sm text-slate-900">{answer.response || "(No respondió)"}</p>
          <p className="mt-2 break-words text-sm text-slate-600">Respuesta esperada: {answer.expected}</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-[10rem_1fr]">
            <label className="block text-sm font-semibold text-slate-900">
              Puntos (de 0 a {Number(answer.points.toFixed(2))})
              <input name={`score_${answer.id}`} type="number" inputMode="decimal" min="0" max={answer.points} step="any" required className={field} />
            </label>
            <label className="block text-sm font-semibold text-slate-900">
              Comentario <span className="font-normal text-slate-600">(opcional)</span>
              <input name={`feedback_${answer.id}`} maxLength={5000} className={field} />
            </label>
          </div>
        </fieldset>
      ))}
      <Notice state={state} />
      <button type="submit" className={primary} disabled={pending}>{pending ? "Guardando…" : "Guardar revisión"}</button>
    </form>
  );
}
