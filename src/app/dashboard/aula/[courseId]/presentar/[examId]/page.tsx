import Link from "next/link";
import { getExamIntro, getOngoingAttempt, type ExamIntro } from "@/server/assessment/exam-taking";
import { currentStudent, dateTime, NothingHere, secondaryLink, timeLimit } from "../shared";
import { ExamRunner, StartExam, type RunnerQuestion } from "./ExamRunner";

export const dynamic = "force-dynamic";

/** Por qué no se puede iniciar, con la fecha cuando aplica. */
function blockMessage(intro: ExamIntro) {
  switch (intro.startBlock) {
    case "not_open_yet":
      return intro.opensAt ? `Este examen todavía no abre. Podrás iniciarlo el ${dateTime(intro.opensAt, intro.timezone)}.` : "Este examen todavía no abre.";
    case "closed":
      return intro.closesAt ? `Este examen cerró el ${dateTime(intro.closesAt, intro.timezone)}. Ya no se puede iniciar.` : "Este examen ya cerró.";
    case "no_attempts_left":
      return intro.maxAttempts === 1
        ? "Ya presentaste este examen y solo permite un intento."
        : `Ya usaste tus ${intro.maxAttempts} intentos. No puedes presentarlo otra vez.`;
    case "course_finished":
      return "Ya terminaste este curso. El examen queda solo para consultar tu resultado.";
    case "no_questions":
      return "Tu docente todavía no ha agregado preguntas a este examen. Vuelve más tarde.";
    default:
      return "";
  }
}

function optionsOf(type: string, options: unknown): string[] {
  const list = Array.isArray(options) ? options.filter((option): option is string => typeof option === "string" && option.trim() !== "") : [];
  if (type === "TRUE_FALSE" && list.length === 0) return ["Verdadero", "Falso"];
  return list;
}

export default async function TakeExamPage({ params }: { params: Promise<{ courseId: string; examId: string }> }) {
  const { courseId, examId } = await params;
  const listHref = `/dashboard/aula/${courseId}/presentar`;
  const student = await currentStudent();
  if (!student) return <NothingHere title="Examen" message="Esta página es para que los estudiantes presenten sus exámenes." href={`/dashboard/aula/${courseId}`} label="Volver al curso" />;
  const intro = await getExamIntro(student, examId);
  if (!intro || intro.courseId !== courseId) {
    return <NothingHere title="Examen" message="Este examen no está disponible para ti. Puede que tu docente lo haya retirado o que ya no tengas un intento vigente. Si estabas respondiendo, consulta a tu docente." href={listHref} label="Ver mis exámenes" />;
  }

  const ongoing = intro.startBlock === "course_finished" ? null : await getOngoingAttempt(student, examId);
  if (ongoing) {
    const questions: RunnerQuestion[] = ongoing.questions.map((question) => ({
      id: question.bankItemId,
      type: question.type,
      prompt: question.prompt,
      points: question.points,
      options: optionsOf(question.type, question.options),
    }));
    return (
      <ExamRunner
        key={ongoing.attemptId}
        attemptId={ongoing.attemptId}
        title={intro.title}
        remainingMs={ongoing.expiresAt.getTime() - ongoing.serverNow.getTime()}
        questions={questions}
        resultHref={`${listHref}/${examId}/resultado?intento=${ongoing.attemptId}`}
      />
    );
  }
  // El tiempo o la matrícula pueden cambiar entre las dos lecturas. No ofrecer otro inicio con datos anteriores.
  if (intro.hasOngoingAttempt && intro.startBlock !== "course_finished") {
    return <NothingHere title="Examen" message="No pudimos retomar tu intento. Puede que haya terminado el tiempo o que tu matrícula haya cambiado. Vuelve a consultar; si el problema continúa, habla con tu docente." href={listHref} label="Ver mis exámenes" />;
  }

  const resultHref = `${listHref}/${examId}/resultado`;
  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-8">
      <header>
        <p className="text-sm text-slate-600">{intro.courseName}</p>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>{intro.title}</h1>
      </header>

      {intro.instructions && (
        <section className="rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="instrucciones">
          <h2 id="instrucciones" className="text-lg font-bold text-slate-950">Instrucciones</h2>
          <p className="mt-2 whitespace-pre-line text-slate-700">{intro.instructions}</p>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="antes-de-empezar">
        <h2 id="antes-de-empezar" className="text-lg font-bold text-slate-950">Antes de empezar</h2>
        <dl className="mt-3 space-y-3 text-sm">
          <div><dt className="text-slate-500">Preguntas</dt><dd className="text-base font-medium text-slate-900">{intro.questionCount}</dd></div>
          <div><dt className="text-slate-500">Tiempo</dt><dd className="text-base font-medium text-slate-900">{timeLimit(intro.durationMinutes, intro.closesAt)}</dd></div>
          <div>
            <dt className="text-slate-500">Intentos</dt>
            <dd className="text-base font-medium text-slate-900">
              {intro.attemptsLeft === 1 ? "Te queda 1 intento" : `Te quedan ${intro.attemptsLeft} intentos`} de {intro.maxAttempts}
            </dd>
          </div>
          <div><dt className="text-slate-500">Abre</dt><dd className="text-base font-medium text-slate-900">{intro.opensAt ? dateTime(intro.opensAt, intro.timezone) : "Ya está abierto"}</dd></div>
          <div><dt className="text-slate-500">Cierra</dt><dd className="text-base font-medium text-slate-900">{intro.closesAt ? dateTime(intro.closesAt, intro.timezone) : "Sin fecha de cierre"}</dd></div>
        </dl>

        {intro.canStart ? (
          <>
            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              Al pulsar «Iniciar examen» el tiempo empieza a correr y no se detiene, aunque cierres la página. Se usa uno de tus intentos.
            </p>
            <StartExam examId={intro.id} />
          </>
        ) : (
          <p role="status" className="mt-4 rounded-lg bg-slate-100 p-4 font-medium text-slate-800">{blockMessage(intro)}</p>
        )}
      </section>

      {intro.hasUnsubmittedExpiredAttempt && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          El tiempo de un intento terminó, pero aún no hay un envío confirmado. No hay resultado para ese intento.
          Si acabas de enviarlo, espera y vuelve a consultar; si no, habla con tu docente.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {intro.lastFinishedAttemptId && <Link className={secondaryLink} href={resultHref}>Ver mi resultado</Link>}
        <Link className={secondaryLink} href={`/dashboard/aula/${courseId}`}>Volver al curso</Link>
      </div>
    </div>
  );
}
