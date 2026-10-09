import Link from "next/link";
import { listStudentExams, type StudentExamSummary } from "@/server/assessment/exam-taking";
import { currentStudent, dateTime, NothingHere, points, primaryLink, secondaryLink, timeLimit } from "./shared";

export const dynamic = "force-dynamic";

function windowText(exam: StudentExamSummary, timezone: string) {
  if (exam.availability === "upcoming" && exam.opensAt) return `Abre el ${dateTime(exam.opensAt, timezone)}.`;
  if (exam.availability === "closed" && exam.closesAt) return `Cerró el ${dateTime(exam.closesAt, timezone)}.`;
  if (exam.closesAt) return `Abierto hasta el ${dateTime(exam.closesAt, timezone)}.`;
  return "Abierto, sin fecha de cierre.";
}

function gradeText(exam: StudentExamSummary) {
  if (exam.best) return `Tu mejor nota: ${points(exam.best.score)} de ${points(exam.best.maxScore)}${exam.pendingReview ? " (hay otro intento en revisión)" : ""}`;
  if (exam.pendingReview) return "Tu docente está revisando tus respuestas";
  return exam.attemptsUsed ? "Todavía sin nota" : "Aún no lo has presentado";
}

function ExamCard({ exam, courseId, timezone }: { exam: StudentExamSummary; courseId: string; timezone: string }) {
  const base = `/dashboard/aula/${courseId}/presentar/${exam.id}`;
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-lg font-bold text-slate-950">{exam.title}</h3>
      <p className="mt-1 text-sm text-slate-600">{windowText(exam, timezone)}</p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <div><dt className="text-slate-500">Tiempo</dt><dd className="font-medium text-slate-900">{timeLimit(exam.durationMinutes, exam.closesAt)}</dd></div>
        <div><dt className="text-slate-500">Intentos</dt><dd className="font-medium text-slate-900">{exam.attemptsUsed} de {exam.maxAttempts} usados</dd></div>
        <div><dt className="text-slate-500">Nota</dt><dd className="font-medium text-slate-900">{gradeText(exam)}</dd></div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        {exam.hasOngoingAttempt && exam.canStart && <Link className={primaryLink} href={base}>Continuar examen</Link>}
        {!exam.hasOngoingAttempt && exam.canStart && <Link className={primaryLink} href={base}>Presentar examen</Link>}
        {!exam.canStart &&<Link className={secondaryLink} href={base}>Ver detalles</Link>}
        {exam.lastFinishedAttemptId && <Link className={secondaryLink} href={`${base}/resultado`}>Ver mi resultado</Link>}
      </div>
    </li>
  );
}

export default async function StudentExamsPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const courseHref = `/dashboard/aula/${courseId}`;
  const student = await currentStudent();
  if (!student) return <NothingHere title="Exámenes" message="Esta página es para que los estudiantes presenten sus exámenes." href={courseHref} label="Volver al curso" />;
  const data = await listStudentExams(student, courseId);
  if (!data) return <NothingHere title="Exámenes" message="No encontramos este curso entre los tuyos. Si crees que es un error, avisa a tu docente." href="/dashboard/aula" label="Ver mis cursos" />;

  const groups = [
    { key: "open", title: "Abiertos", exams: data.exams.filter((exam) => exam.availability === "open") },
    { key: "upcoming", title: "Próximos", exams: data.exams.filter((exam) => exam.availability === "upcoming") },
    { key: "closed", title: "Cerrados", exams: data.exams.filter((exam) => exam.availability === "closed") },
  ].filter((group) => group.exams.length > 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <header>
        <p className="text-sm text-slate-600">{data.courseName}</p>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Exámenes</h1>
      </header>
      {groups.length === 0 && (
        <p className="rounded-xl border border-slate-200 bg-white p-5 text-slate-700">
          Tu docente todavía no ha publicado exámenes en este curso. Cuando publique uno, aparecerá aquí con su fecha y su tiempo.
        </p>
      )}
      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`examenes-${group.key}`}>
          <h2 id={`examenes-${group.key}`} className="text-lg font-bold text-slate-950">{group.title}</h2>
          <ul className="mt-2 space-y-3">
            {group.exams.map((exam) => <ExamCard key={exam.id} exam={exam} courseId={courseId} timezone={data.timezone} />)}
          </ul>
        </section>
      ))}
      <Link className={secondaryLink} href={courseHref}>Volver al curso</Link>
    </div>
  );
}
