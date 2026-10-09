import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { findManagedCourse } from "@/server/assessment/question-bank";
import { QuestionForm } from "../QuestionTools";

export const dynamic = "force-dynamic";

export default async function NewQuestionPage({ params }: { params: Promise<{ courseId: string }> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const { courseId } = await params;
  const course = await findManagedCourse({ id: user.id, institutionId: user.institutionId, role: user.role }, courseId);
  if (!course) redirect("/dashboard/aula");

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Agregar pregunta</h1>
        <p className="mt-1 text-sm text-slate-600">Curso: {course.name}</p>
      </header>
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <QuestionForm courseId={course.id} />
      </section>
    </div>
  );
}
