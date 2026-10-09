import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { timeZoneDisplayName } from "@/lib/timezone";
import { getExamForm, publishBlocker } from "@/server/assessment/exam-admin";
import { DeleteExam, ExamForm, PublishExam } from "../ExamTools";

export const dynamic = "force-dynamic";

const STATUS = {
  DRAFT: "Borrador: los estudiantes no lo ven.",
  PUBLISHED: "Publicado: los estudiantes pueden verlo.",
  CLOSED: "Cerrado: sigue publicado, pero ya pasó la fecha de cierre.",
} as const;

export default async function EditExamPage({ params }: { params: Promise<{ courseId: string; examId: string }> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const { courseId, examId } = await params;
  const data = await getExamForm({ id: user.id, institutionId: user.institutionId, role: user.role }, courseId, examId);
  if (!data?.exam) redirect(`/dashboard/aula/${courseId}/examenes`);
  const exam = data.exam;
  const base = `/dashboard/aula/${data.course.id}/examenes`;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <header>
        <h1 className="break-words text-2xl font-bold" style={{ color: "var(--navy)" }}>{exam.title}</h1>
        <p className="mt-1 text-sm text-slate-600">{STATUS[exam.status]}</p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="examen-publicacion">
        <h2 id="examen-publicacion" className="text-lg font-bold text-slate-950">Publicación y resultados</h2>
        <div className="mt-3 space-y-3">
          <PublishExam examId={exam.id} published={exam.isPublished} blocker={publishBlocker(exam.questions)} attemptCount={exam.attemptCount} />
          <Link href={`${base}/${exam.id}/resultados`} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800">
            Ver resultados{exam.attemptCount ? ` (${exam.attemptCount})` : ""}
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <ExamForm courseId={data.course.id} bank={data.bank} categories={data.categories} exam={exam} timezoneLabel={timeZoneDisplayName(data.timezone)} />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="examen-borrar">
        <h2 id="examen-borrar" className="text-lg font-bold text-slate-950">Borrar examen</h2>
        <p className="mt-1 text-sm text-slate-600">Las preguntas siguen en el banco. Lo que sí se borra son los intentos y respuestas de este examen.</p>
        <div className="mt-3">
          <DeleteExam examId={exam.id} courseId={data.course.id} attemptCount={exam.attemptCount} studentCount={exam.studentCount} gradeEntries={exam.gradeEntries} />
        </div>
      </section>
    </div>
  );
}
