import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { CLOSE_VERBS, deadlineLabel, OPEN_VERBS } from "@/lib/deadline";
import { listExams, type ExamStatus } from "@/server/assessment/exam-admin";
import { formatPoints } from "../preguntas/labels";

export const dynamic = "force-dynamic";

const primary = "inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white";
const secondary = "inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800";

const STATUS: Record<ExamStatus, { label: string; help: string; tone: string }> = {
  DRAFT: { label: "Borrador", help: "Los estudiantes no lo ven.", tone: "bg-slate-100 text-slate-800" },
  PUBLISHED: { label: "Publicado", help: "Los estudiantes pueden verlo.", tone: "bg-emerald-100 text-emerald-900" },
  CLOSED: { label: "Cerrado", help: "Ya pasó la fecha de cierre.", tone: "bg-amber-100 text-amber-900" },
};

export default async function ExamsPage({ params }: { params: Promise<{ courseId: string }> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const { courseId } = await params;
  const data = await listExams({ id: user.id, institutionId: user.institutionId, role: user.role }, courseId);
  if (!data) redirect("/dashboard/aula");
  const base = `/dashboard/aula/${data.course.id}`;
  const now = new Date();

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Exámenes</h1>
        <p className="mt-1 text-sm text-slate-600">Arma exámenes con las preguntas del banco, publícalos y revisa cómo les fue a tus estudiantes.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`${base}/examenes/nuevo`} className={primary}>Crear examen</Link>
          <Link href={`${base}/preguntas`} className={secondary}>Banco de preguntas ({data.bankCount})</Link>
        </div>
      </header>

      {data.exams.length === 0 ? (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center">
          <h2 className="text-lg font-bold text-slate-950">Todavía no hay exámenes</h2>
          {data.bankCount === 0 ? (
            <>
              <p className="mt-1 text-sm text-slate-600">Un examen se arma con preguntas del banco. Empieza por agregar tus preguntas.</p>
              <Link href={`${base}/preguntas/nueva`} className={`${primary} mt-4`}>Agregar pregunta</Link>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-slate-600">Elige preguntas del banco, ponles puntos y decide el tiempo y los intentos.</p>
              <Link href={`${base}/examenes/nuevo`} className={`${primary} mt-4`}>Crear examen</Link>
            </>
          )}
        </section>
      ) : (
        <ul className="space-y-3">
          {data.exams.map((exam) => (
            <li key={exam.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS[exam.status].tone}`}>{STATUS[exam.status].label}</span>
                <span className="text-xs text-slate-600">{STATUS[exam.status].help}</span>
              </div>
              <h2 className="mt-2 break-words text-lg font-bold text-slate-950">{exam.title}</h2>
              <p className="mt-1 text-sm text-slate-700">
                {exam.questionCount} {exam.questionCount === 1 ? "pregunta" : "preguntas"} · {formatPoints(exam.totalPoints)} · {exam.durationMinutes ? `${exam.durationMinutes} minutos` : "Sin tiempo límite"}
              </p>
              {(exam.opensAt || exam.closesAt) && (
                <p className="mt-1 text-sm text-slate-600">
                  {exam.opensAt && `${deadlineLabel(exam.opensAt, now, data.timezone, { verbs: OPEN_VERBS, withTime: true })}. `}
                  {exam.closesAt && `${deadlineLabel(exam.closesAt, now, data.timezone, { verbs: CLOSE_VERBS, withTime: true })}.`}
                </p>
              )}
              <p className="mt-1 text-sm text-slate-700">
                {exam.submittedAttempts === 0 ? "Nadie lo ha presentado todavía." : `${exam.submittedAttempts} ${exam.submittedAttempts === 1 ? "intento presentado" : "intentos presentados"}.`}
                {exam.pendingReview > 0 && <strong className="text-amber-800"> {exam.pendingReview} por revisar.</strong>}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`${base}/examenes/${exam.id}`} className={secondary}>Editar</Link>
                <Link href={`${base}/examenes/${exam.id}/resultados`} className={secondary}>Resultados</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
