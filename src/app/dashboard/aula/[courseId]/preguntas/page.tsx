import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listQuestions } from "@/server/assessment/question-bank";
import { DeleteQuestion } from "./QuestionTools";
import { QUESTION_TYPE_LABEL, formatPoints, type QuestionKind } from "./labels";

export const dynamic = "force-dynamic";

const primary = "inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white";
const secondary = "inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800";
const field = "mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base";

export default async function QuestionBankPage({ params, searchParams }: { params: Promise<{ courseId: string }>; searchParams: Promise<{ q?: string; tipo?: string }> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const { courseId } = await params;
  const { q = "", tipo = "" } = await searchParams;
  const data = await listQuestions({ id: user.id, institutionId: user.institutionId, role: user.role }, courseId, { q, type: tipo });
  if (!data) redirect("/dashboard/aula");
  const base = `/dashboard/aula/${data.course.id}`;
  const filtering = Boolean(q.trim() || tipo);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <header>
        <Link href={base} className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 underline">← {data.course.name}</Link>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Banco de preguntas</h1>
        <p className="mt-1 text-sm text-slate-600">Aquí guardas las preguntas del curso. Después las eliges para armar tus exámenes, y puedes usar la misma en varios.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`${base}/preguntas/nueva`} className={primary}>Agregar pregunta</Link>
          <Link href={`${base}/examenes`} className={secondary}>Ir a exámenes</Link>
        </div>
      </header>

      {data.total === 0 ? (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center">
          <h2 className="text-lg font-bold text-slate-950">Todavía no hay preguntas</h2>
          <p className="mt-1 text-sm text-slate-600">Agrega la primera. Puede ser de selección múltiple, de verdadero o falso, o de respuesta corta.</p>
          <Link href={`${base}/preguntas/nueva`} className={`${primary} mt-4`}>Agregar pregunta</Link>
        </section>
      ) : (
        <>
          <form method="get" className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_14rem_auto] sm:items-end" role="search">
            <label className="block text-sm font-medium text-slate-900">
              Buscar
              <input type="search" name="q" defaultValue={q} maxLength={100} placeholder="Palabras de la pregunta" className={field} />
            </label>
            <label className="block text-sm font-medium text-slate-900">
              Tipo
              <select name="tipo" defaultValue={tipo} className={field}>
                <option value="">Todos los tipos</option>
                {(Object.keys(QUESTION_TYPE_LABEL) as QuestionKind[]).map((kind) => <option key={kind} value={kind}>{QUESTION_TYPE_LABEL[kind]}</option>)}
              </select>
            </label>
            <button type="submit" className={secondary}>Buscar</button>
          </form>

          <p className="text-sm text-slate-600" aria-live="polite">
            {filtering ? `${data.questions.length} de ${data.total} preguntas. ` : `${data.total} ${data.total === 1 ? "pregunta" : "preguntas"}.`}
            {filtering && <Link href={`${base}/preguntas`} className="font-semibold text-blue-700 underline">Ver todas</Link>}
          </p>

          {data.questions.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-700">Ninguna pregunta coincide con la búsqueda. Prueba con otras palabras o elige «Todos los tipos».</p>
          ) : (
            <ul className="space-y-3">
              {data.questions.map((question) => (
                <li key={question.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {QUESTION_TYPE_LABEL[question.type]} · {formatPoints(question.defaultPoints)}
                    {question.examCount > 0 && ` · En ${question.examCount === 1 ? "1 examen" : `${question.examCount} exámenes`}`}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words font-semibold text-slate-950">{question.prompt}</p>
                  {question.type === "MULTIPLE_CHOICE" ? (
                    <ul className="mt-2 space-y-1 text-sm text-slate-700">
                      {question.options.map((option) => (
                        <li key={option} className="break-words">{option === question.answerKey ? <strong className="text-emerald-800">✓ {option} (correcta)</strong> : <>○ {option}</>}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 break-words text-sm text-slate-700">
                      {question.type === "TRUE_FALSE" ? "Respuesta correcta: " : "Respuesta esperada (la revisas tú): "}
                      <strong>{question.answerKey}</strong>
                    </p>
                  )}
                  {question.explanation && <p className="mt-2 break-words text-sm text-slate-600">Explicación: {question.explanation}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={`${base}/preguntas/${question.id}`} className={secondary}>Editar</Link>
                    <DeleteQuestion questionId={question.id} examCount={question.examCount} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
