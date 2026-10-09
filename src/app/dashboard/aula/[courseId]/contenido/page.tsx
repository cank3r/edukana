import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCourseContent } from "@/server/courses/content";
import { AddChapter, ChapterCard } from "./ContentEditor";

export const dynamic = "force-dynamic";

const linkButton = "inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800";

export default async function CourseContentPage({ params }: { params: Promise<{ courseId: string }> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const { courseId } = await params;
  // Devuelve null si el curso no es de su institución o no lo gestiona: el editor no es para estudiantes.
  const course = await getCourseContent({ id: user.id, institutionId: user.institutionId, role: user.role }, courseId);
  if (!course) redirect(`/dashboard/aula/${courseId}`);

  const chapters = course.sections;
  // Lo primero que vería un estudiante: la primera lección publicada de un capítulo publicado.
  const firstVisibleLesson = chapters.filter((chapter) => chapter.isPublished).flatMap((chapter) => chapter.lessons).find((lesson) => lesson.isPublished);
  const lessonCount = chapters.reduce((total, chapter) => total + chapter.lessons.length, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <header>
        <p className="text-sm font-medium text-slate-600">{course.name}</p>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Contenido del curso</h1>
        <p className="mt-1 text-sm text-slate-600">
          Organiza el curso en capítulos y lecciones. Los estudiantes solo ven lo que está publicado, en el orden que aparece aquí.
        </p>
        {firstVisibleLesson && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Link className={linkButton} href={`/dashboard/aula/${course.id}/leccion/${firstVisibleLesson.id}`}>Ver como estudiante</Link>
          </div>
        )}
        {!firstVisibleLesson && lessonCount > 0 && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Los estudiantes todavía no ven nada: publica un capítulo y al menos una de sus lecciones.
          </p>
        )}
      </header>

      {chapters.length === 0 ? (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center">
          <h2 className="text-lg font-bold text-slate-950">Este curso aún no tiene contenido</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
            Un capítulo agrupa las lecciones de un tema, por ejemplo «Unidad 1». Crea el primero y luego agrégale lecciones.
          </p>
          <AddChapter courseId={course.id} label="Agregar el primer capítulo" primary />
        </section>
      ) : (
        <>
          <ol className="space-y-4">
            {chapters.map((chapter, index) => (
              <ChapterCard
                key={chapter.id}
                courseId={course.id}
                number={index + 1}
                isFirst={index === 0}
                isLast={index === chapters.length - 1}
                chapter={{
                  id: chapter.id,
                  title: chapter.title,
                  description: chapter.description ?? "",
                  isPublished: chapter.isPublished,
                  lessons: chapter.lessons.map((lesson) => ({
                    id: lesson.id,
                    title: lesson.title,
                    summary: lesson.summary ?? "",
                    content: lesson.content ?? "",
                    type: lesson.type,
                    estimatedMinutes: lesson.estimatedMinutes,
                    isPublished: lesson.isPublished,
                    files: lesson.assets.map((asset) => ({ id: asset.id, name: asset.originalName, canRemove: asset.uploaderId === user.id })),
                  })),
                }}
              />
            ))}
          </ol>
          <AddChapter courseId={course.id} label="Agregar capítulo" />
        </>
      )}
    </div>
  );
}
