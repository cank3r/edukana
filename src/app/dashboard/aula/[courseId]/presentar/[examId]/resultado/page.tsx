import Link from "next/link";
import { getAttemptResult, getExamIntro, type ReviewedQuestion } from "@/server/assessment/exam-taking";
import { currentStudent, dateTime, NothingHere, points, primaryLink, secondaryLink } from "../../shared";

export const dynamic = "force-dynamic";

function verdict(question: ReviewedQuestion, pendingReview: boolean) {
  if (question.isCorrect === true) return { text: "Correcta", tone: "bg-emerald-50 text-emerald-800" };
  if (question.isCorrect === false) return { text: question.response.trim() ? "Incorrecta" : "Sin responder", tone: "bg-red-50 text-red-800" };
  if (question.score !== null) return { text: `Tu docente te dio ${points(question.score)} de ${points(question.points)}`, tone: "bg-slate-100 text-slate-800" };
  return { text: pendingReview ? "Pendiente de revisión" : "Sin puntos", tone: "bg-amber-50 text-amber-900" };
}

export default async function ExamResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string; examId: string }>;
  searchParams: Promise<{ intento?: string | string[] }>;
}) {
  const { courseId, examId } = await params;
  const requested = (await searchParams).intento;
  const examHref = `/dashboard/aula/${courseId}/presentar/${examId}`;
  const courseHref = `/dashboard/aula/${courseId}`;
  const student = await currentStudent();
  if (!student) return <NothingHere title="Resultado del examen" message="Esta página es para que los estudiantes vean sus resultados." href={courseHref} label="Volver al curso" />;

  const intro = await getExamIntro(student, examId);
  if (!intro || intro.courseId !== courseId) {
    return <NothingHere title="Resultado del examen" message="No encontramos este examen entre los de tus cursos." href={`/dashboard/aula/${courseId}/presentar`} label="Ver mis exámenes" />;
  }
  const attemptId = typeof requested === "string" && requested ? requested : intro.lastFinishedAttemptId;
  const result = attemptId ? await getAttemptResult(student, attemptId) : null;
  if (!result || result.examId !== examId) {
    return (
      <NothingHere
        title="Resultado del examen"
        message={intro.hasOngoingAttempt ? "Tienes este examen en curso. Cuando lo envíes, aquí verás tu resultado." : "Todavía no tienes un resultado de este examen."}
        href={examHref}
        label={intro.hasOngoingAttempt ? "Continuar examen" : "Ir al examen"}
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-8">
      <header>
        <p className="text-sm text-slate-600">{intro.courseName}</p>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Resultado: {result.examTitle}</h1>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="tu-resultado">
        <h2 id="tu-resultado" className="text-sm font-medium text-slate-600">
          Intento {result.attemptNumber}{result.submittedAt ? ` · enviado el ${dateTime(result.submittedAt, result.timezone)}` : ""}
        </h2>
        <p className="mt-2 text-3xl font-bold text-slate-950">
          {result.pendingReview ? "Llevas" : "Obtuviste"} {points(result.score)} de {points(result.maxScore)}
        </p>
        {result.pendingReview && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Tu docente todavía debe revisar tus respuestas escritas. Tu nota final puede subir cuando termine.
          </p>
        )}
        {result.expiredWithoutAnswers && (
          <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
            El tiempo terminó antes de que llegaran tus respuestas, por eso este intento quedó sin puntos.
          </p>
        )}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          {result.canRetry && <Link className={primaryLink} href={examHref}>Intentar de nuevo</Link>}
          <Link className={secondaryLink} href={courseHref}>Volver al curso</Link>
        </div>
        {result.canRetry && (
          <p className="mt-2 text-sm text-slate-600">{result.attemptsLeft === 1 ? "Te queda 1 intento." : `Te quedan ${result.attemptsLeft} intentos.`}</p>
        )}
      </section>

      {result.review === null ? (
        <p className="rounded-xl border border-slate-200 bg-white p-5 text-slate-700">Este examen no muestra el detalle de las respuestas. Si tienes dudas sobre tu nota, habla con tu docente.</p>
      ) : (
        <section aria-labelledby="detalle">
          <h2 id="detalle" className="text-lg font-bold text-slate-950">Pregunta por pregunta</h2>
          <ol className="mt-2 space-y-3">
            {result.review.map((question, index) => {
              const mark = verdict(question, result.pendingReview);
              return (
                <li key={question.order} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                  <p className="font-semibold text-slate-950">{index + 1}. {question.prompt}</p>
                  <p className={`mt-2 inline-block rounded-lg px-2.5 py-1 text-sm font-semibold ${mark.tone}`}>{mark.text}</p>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div>
                      <dt className="text-slate-500">Tu respuesta</dt>
                      <dd className="whitespace-pre-line break-words text-base text-slate-900">{question.response.trim() ? question.response : "No respondiste"}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">{question.type === "SHORT_ANSWER" ? "Respuesta esperada" : "Respuesta correcta"}</dt>
                      <dd className="whitespace-pre-line break-words text-base text-slate-900">{question.correctAnswer}</dd>
                    </div>
                    {question.explanation && (
                      <div><dt className="text-slate-500">Explicación</dt><dd className="whitespace-pre-line text-base text-slate-900">{question.explanation}</dd></div>
                    )}
                    {question.feedback && (
                      <div><dt className="text-slate-500">Comentario de tu docente</dt><dd className="whitespace-pre-line text-base text-slate-900">{question.feedback}</dd></div>
                    )}
                  </dl>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}
