import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAiAvailability } from "@/server/ai/access";
import { listQuestionSources } from "@/server/ai/course";
import { QuestionGenerator } from "./QuestionGenerator";

export const dynamic = "force-dynamic";

const linkButton = "inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800";

export default async function GenerateQuestionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ leccion?: string; capitulo?: string }>;
}) {
  const user = (await auth())?.user;
  if (!user?.id) redirect("/login");
  const { courseId } = await params;
  const { leccion, capitulo } = await searchParams;
  const actor = { id: user.id, institutionId: user.institutionId, role: user.role };
  // Null si el curso no es de su institución o no lo gestiona: esta pantalla no es para estudiantes.
  const data = await listQuestionSources(actor, courseId);
  if (!data) redirect(`/dashboard/aula/${courseId}`);
  const availability = await getAiAvailability(actor);

  const lessonIds = new Set(data.chapters.flatMap((chapter) => chapter.lessons.map((lesson) => lesson.id)));
  const chapterIds = new Set(data.chapters.map((chapter) => chapter.id));
  const initialSource = leccion && lessonIds.has(leccion) ? `lesson:${leccion}` : capitulo && chapterIds.has(capitulo) ? `chapter:${capitulo}` : "";
  const bank = `/dashboard/aula/${data.course.id}/preguntas`;
  const hasText = data.chapters.some((chapter) => chapter.hasText);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <header>
        <p className="text-sm font-medium text-slate-600">{data.course.name}</p>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Generar preguntas con IA</h1>
        <p className="mt-1 text-sm text-slate-600">
          Elige una lección o un capítulo y la IA te propone preguntas sobre su texto. Tú las revisas, corriges o descartas; solo las que guardes entran al banco de preguntas del curso.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link className={linkButton} href={bank}>Ver banco de preguntas</Link>
        </div>
      </header>

      {!availability.ok ? (
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-bold text-slate-950">El asistente de IA no está disponible</h2>
          <p className="mt-1 text-sm text-slate-600">{availability.message} Mientras tanto puedes escribir tus preguntas a mano en el banco.</p>
          <Link className={`${linkButton} mt-3`} href={`${bank}/nueva`}>Escribir una pregunta</Link>
        </section>
      ) : !hasText ? (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center">
          <h2 className="text-lg font-bold text-slate-950">Primero escribe el contenido</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">La IA crea preguntas a partir del texto de tus lecciones. Este curso todavía no tiene lecciones con texto.</p>
          <Link className={`${linkButton} mt-3`} href={`/dashboard/aula/${data.course.id}/contenido`}>Ir al contenido del curso</Link>
        </section>
      ) : (
        <QuestionGenerator courseId={data.course.id} chapters={data.chapters} initialSource={initialSource} />
      )}
    </div>
  );
}
