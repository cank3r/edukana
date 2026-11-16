import { getAiAvailability, type AiActor } from "@/server/ai/access";
import { AskCourseForm } from "./AskCourseForm";

/**
 * «Pregúntale al curso», debajo de la lección del estudiante. Si la IA no está disponible
 * (sin clave, apagada por la institución o sin permiso) lo dice en una línea y no ofrece el formulario.
 */
export async function AskCourse({ actor, courseId, lessonId }: { actor: AiActor; courseId: string; lessonId: string }) {
  const availability = await getAiAvailability(actor);
  if (!availability.ok && availability.reason === "no-permission") return null;
  return (
    <section aria-labelledby="preguntale-al-curso" className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
      <h2 id="preguntale-al-curso" className="text-lg font-bold text-slate-950">Pregúntale al curso</h2>
      {availability.ok ? (
        <AskCourseForm courseId={courseId} lessonId={lessonId} />
      ) : (
        <p className="mt-1 text-sm text-slate-600">{availability.message} Si tienes una duda, pregúntale a tu docente.</p>
      )}
    </section>
  );
}
