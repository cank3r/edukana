"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { setLessonCompleted, type LessonCompletionResult } from "@/server/courses/lesson-progress";

export type LessonProgressState = { ok: boolean; message: string };

/**
 * Marca o desmarca una lección. Campos: `courseId`, `lessonId`, `completed` ("true" | "false").
 * Al completar lleva a la siguiente lección; en la última, a la portada del curso.
 */
export async function setLessonCompletedAction(_state: LessonProgressState, formData: FormData): Promise<LessonProgressState> {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) return { ok: false, message: "Tu sesión terminó. Vuelve a iniciar sesión." };
  const courseId = String(formData.get("courseId") ?? "");
  const lessonId = String(formData.get("lessonId") ?? "");
  const completed = formData.get("completed") !== "false";

  let result: LessonCompletionResult;
  try {
    result = await setLessonCompleted({ id: user.id, institutionId: user.institutionId, role: user.role }, { courseId, lessonId, completed });
  } catch (error) {
    const correlationId = crypto.randomUUID();
    console.error("setLessonCompletedAction failed", { correlationId, error });
    return { ok: false, message: `No se pudo guardar tu avance. Intenta de nuevo. Código: ${correlationId}` };
  }
  if (!result.ok) return { ok: false, message: result.message };

  const coursePath = `/dashboard/aula/${encodeURIComponent(courseId)}`;
  revalidatePath(coursePath, "layout");
  revalidatePath("/dashboard/portal");
  if (!completed) return { ok: true, message: "La lección quedó como no completada." };
  if (result.nextLessonId) redirect(`${coursePath}/leccion/${encodeURIComponent(result.nextLessonId)}`);
  redirect(result.completedLessons >= result.totalLessons ? `${coursePath}?completado=1` : coursePath);
}
