import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getQuestion } from "@/server/assessment/question-bank";
import { DeleteQuestion, QuestionForm } from "../QuestionTools";

export const dynamic = "force-dynamic";

export default async function EditQuestionPage({ params }: { params: Promise<{ courseId: string; questionId: string }> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const { courseId, questionId } = await params;
  const question = await getQuestion({ id: user.id, institutionId: user.institutionId, role: user.role }, questionId);
  if (!question || question.courseId !== courseId) redirect(`/dashboard/aula/${courseId}/preguntas`);
  const back = `/dashboard/aula/${question.courseId}/preguntas`;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Editar pregunta</h1>
      </header>
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <QuestionForm
          courseId={question.courseId}
          examTitles={question.exams.map((exam) => exam.title)}
          question={{
            id: question.id,
            type: question.type,
            prompt: question.prompt,
            options: question.options,
            answerKey: question.answerKey,
            explanation: question.explanation ?? "",
            points: question.defaultPoints,
          }}
        />
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="borrar-pregunta">
        <h2 id="borrar-pregunta" className="text-lg font-bold text-slate-950">Borrar pregunta</h2>
        <p className="mt-1 text-sm text-slate-600">Solo se puede borrar una pregunta que no está en ningún examen.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <DeleteQuestion questionId={question.id} examCount={question.exams.length} redirectTo={back} />
        </div>
      </section>
    </div>
  );
}
