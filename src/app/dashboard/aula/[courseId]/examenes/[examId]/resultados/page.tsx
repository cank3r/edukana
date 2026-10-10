import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { formatScore } from "@/lib/grade-format";
import { getExamResults, type AttemptView } from "@/server/assessment/exam-admin";
import { examPassed } from "@/server/assessment/exam-pass";
import { ReviewAttempt } from "../../ExamTools";

export const dynamic = "force-dynamic";

const STATUS: Record<AttemptView["status"], { label: string; tone: string }> = {
  IN_PROGRESS: { label: "Lo está presentando", tone: "bg-blue-100 text-blue-900" },
  EXPIRED: { label: "Se le acabó el tiempo sin enviar", tone: "bg-slate-100 text-slate-800" },
  SUBMITTED: { label: "Por revisar", tone: "bg-amber-100 text-amber-900" },
  GRADED: { label: "Calificado", tone: "bg-emerald-100 text-emerald-900" },
};

const number = (value: number) => formatScore(value);

export default async function ExamResultsPage({ params }: { params: Promise<{ courseId: string; examId: string }> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const { courseId, examId } = await params;
  const data = await getExamResults({ id: user.id, institutionId: user.institutionId, role: user.role }, examId);
  if (!data || data.exam.courseId !== courseId) redirect(`/dashboard/aula/${courseId}/examenes`);
  const base = `/dashboard/aula/${data.exam.courseId}/examenes`;
  const when = new Intl.DateTimeFormat("es", { timeZone: data.timezone, dateStyle: "medium", timeStyle: "short" });
  const pending = data.attempts.filter((attempt) => attempt.status === "SUBMITTED");
  // Primero lo que necesita atención del docente.
  const attempts = [...pending, ...data.attempts.filter((attempt) => attempt.status !== "SUBMITTED")];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <header>
        <h1 className="break-words text-2xl font-bold" style={{ color: "var(--navy)" }}>Resultados: {data.exam.title}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {data.exam.courseName} · El examen vale {number(data.exam.totalPoints)} {data.exam.totalPoints === 1 ? "punto" : "puntos"}.{" "}
          {data.exam.countsForGrade ? "La nota pasa al libro de calificaciones." : "Es de práctica: la nota no pasa al libro de calificaciones."}
          {data.exam.passingPercent !== null && ` Se aprueba con ${data.exam.passingPercent} %.`}
        </p>
        <Link href={`${base}/${data.exam.id}`} className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800">Editar examen</Link>
      </header>

      {pending.length > 0 && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900" role="status">
          {pending.length === 1 ? "Hay 1 intento con respuestas cortas por revisar." : `Hay ${pending.length} intentos con respuestas cortas por revisar.`} Su nota queda pendiente hasta que les pongas los puntos.
        </p>
      )}

      {attempts.length === 0 ? (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center">
          <h2 className="text-lg font-bold text-slate-950">Nadie ha presentado este examen</h2>
          <p className="mt-1 text-sm text-slate-600">
            {data.exam.status === "DRAFT" ? "Está en borrador. Publícalo desde «Editar examen» para que los estudiantes puedan presentarlo." : "Cuando un estudiante lo presente, aquí verás su nota, la fecha y cuánto tardó."}
          </p>
        </section>
      ) : (
        <ul className="space-y-3">
          {attempts.map((attempt) => {
            const short = attempt.answers.filter((answer) => answer.type === "SHORT_ANSWER");
            const passed = attempt.status === "GRADED" ? examPassed(attempt.score, attempt.maxScore ?? data.exam.totalPoints, data.exam.passingPercent) : null;
            return (
              <li key={attempt.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="break-words text-lg font-bold text-slate-950">{attempt.studentName}</h2>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS[attempt.status].tone}`}>{STATUS[attempt.status].label}</span>
                  {passed !== null && <span className={`rounded-full px-3 py-1 text-xs font-bold ${passed ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"}`}>{passed ? "Aprobado" : "No aprobado"}</span>}
                </div>
                <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm text-slate-700 sm:grid-cols-2">
                  <div><dt className="inline font-semibold">Intento: </dt><dd className="inline">{attempt.attemptNumber}</dd></div>
                  <div>
                    <dt className="inline font-semibold">Nota: </dt>
                    <dd className="inline">
                      {attempt.status === "GRADED" && attempt.score !== null
                        ? `${number(attempt.score)} de ${number(attempt.maxScore ?? data.exam.totalPoints)}`
                        : attempt.status === "SUBMITTED"
                          ? `Pendiente (lleva ${number(attempt.score ?? 0)} de ${number(attempt.maxScore ?? data.exam.totalPoints)} en las preguntas que se califican solas)`
                          : "Todavía no hay nota"}
                    </dd>
                  </div>
                  <div><dt className="inline font-semibold">Empezó: </dt><dd className="inline">{when.format(attempt.startedAt)}</dd></div>
                  <div><dt className="inline font-semibold">Envió: </dt><dd className="inline">{attempt.submittedAt ? when.format(attempt.submittedAt) : "No lo ha enviado"}</dd></div>
                  <div><dt className="inline font-semibold">Tardó: </dt><dd className="inline">{attempt.durationMinutes === null ? "—" : attempt.durationMinutes < 1 ? "Menos de 1 minuto" : `${attempt.durationMinutes} ${attempt.durationMinutes === 1 ? "minuto" : "minutos"}`}</dd></div>
                </dl>

                {attempt.status === "SUBMITTED" && short.length > 0 && (
                  <ReviewAttempt
                    attemptId={attempt.id}
                    answers={short.map((answer) => ({ id: answer.id, number: answer.order + 1, prompt: answer.prompt, expected: answer.expected, response: answer.response, points: answer.points }))}
                  />
                )}

                {attempt.answers.length > 0 && (
                  <details className="mt-3">
                    <summary className="min-h-11 cursor-pointer py-2 font-semibold text-blue-700">Ver sus respuestas</summary>
                    <ol className="space-y-3">
                      {attempt.answers.map((answer) => (
                        <li key={answer.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                          <p className="whitespace-pre-wrap break-words font-semibold text-slate-950">{answer.order + 1}. {answer.prompt}</p>
                          <p className="mt-1 whitespace-pre-wrap break-words text-slate-800">Respondió: {answer.response || "(No respondió)"}</p>
                          <p className="break-words text-slate-600">{answer.type === "SHORT_ANSWER" ? "Respuesta esperada" : "Respuesta correcta"}: {answer.expected}</p>
                          <p className="mt-1 font-semibold text-slate-900">
                            {answer.score === null ? "Por revisar" : `${number(answer.score)} de ${number(answer.points)}`}
                            {answer.isCorrect === true && " · Correcta"}
                            {answer.isCorrect === false && " · Incorrecta"}
                          </p>
                          {answer.feedback && <p className="break-words text-slate-700">Tu comentario: {answer.feedback}</p>}
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
