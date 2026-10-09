"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { resolveCourseWriteScope, type CourseScope } from "@/lib/course-scope";
import { archiveCourse, createCourse, deleteCourseIfEmpty, restoreCourse, setCoursePublished, updateCourse, type CourseResult } from "@/server/courses/course";
import type { EdukanaRole } from "@/types/next-auth";

export type CourseActionState = { ok: boolean; message: string; courseId?: string; deleted?: boolean };

type Guard =
  | { actor: { id: string; institutionId: string; role: EdukanaRole }; scope: CourseScope; error: null }
  | { actor: null; scope: null; error: string };

async function requireCourseManager(): Promise<Guard> {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) return { actor: null, scope: null, error: "Tu sesión terminó. Vuelve a iniciar sesión." };
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  const scope = resolveCourseWriteScope(user, capabilities);
  if (scope.kind === "none") return { actor: null, scope: null, error: "No tienes permiso para gestionar cursos." };
  return { actor: { id: user.id, institutionId: user.institutionId, role: user.role }, scope, error: null };
}

function failure(name: string, error: unknown): CourseActionState {
  const correlationId = crypto.randomUUID();
  console.error(`${name} failed`, { correlationId, error });
  return { ok: false, message: `No se pudo completar. Intenta de nuevo. Código: ${correlationId}` };
}

const field = (formData: FormData, key: string) => String(formData.get(key) ?? "");
const courseFields = (formData: FormData) => ({
  name: field(formData, "name"),
  description: field(formData, "description"),
  teacherId: field(formData, "teacherId"),
  periodId: field(formData, "periodId"),
  code: field(formData, "code"),
  maxStudents: field(formData, "maxStudents").trim(),
});

function revalidate(courseId: string) {
  revalidatePath("/dashboard/aula");
  revalidatePath(`/dashboard/aula/${courseId}`);
  revalidatePath(`/dashboard/aula/${courseId}/editar`);
}

/** Crea un curso en borrador. Campos: `name`, `description`, `teacherId`, `periodId`, `code`, `maxStudents`. */
export async function createCourseAction(_state: CourseActionState, formData: FormData): Promise<CourseActionState> {
  const guard = await requireCourseManager();
  if (guard.error !== null) return { ok: false, message: guard.error };
  try {
    const result = await createCourse(guard.actor, guard.scope, courseFields(formData));
    if (!result.ok) return result;
    revalidate(result.courseId);
    return { ok: true, message: "Curso creado.", courseId: result.courseId };
  } catch (error) {
    return failure("createCourseAction", error);
  }
}

/** Guarda los datos de un curso. Campos: `courseId` y los mismos de crear. */
export async function updateCourseAction(_state: CourseActionState, formData: FormData): Promise<CourseActionState> {
  const guard = await requireCourseManager();
  if (guard.error !== null) return { ok: false, message: guard.error };
  try {
    const result = await updateCourse(guard.actor, guard.scope, field(formData, "courseId"), courseFields(formData));
    if (!result.ok) return result;
    revalidate(result.courseId);
    return { ok: true, message: "Cambios guardados.", courseId: result.courseId };
  } catch (error) {
    return failure("updateCourseAction", error);
  }
}

const STATE_MESSAGES = {
  publish: "Curso publicado. Sus estudiantes inscritos ya lo ven.",
  unpublish: "El curso volvió a borrador. Sus estudiantes ya no lo ven.",
  archive: "Curso archivado. Puedes restaurarlo cuando quieras.",
  restore: "Curso restaurado. Volvió a tus listas.",
  delete: "Curso borrado.",
} as const;

/** Cambia el estado del curso. Campos: `courseId` e `intent` (publish | unpublish | archive | restore | delete). */
export async function courseStateAction(_state: CourseActionState, formData: FormData): Promise<CourseActionState> {
  const guard = await requireCourseManager();
  if (guard.error !== null) return { ok: false, message: guard.error };
  const intent = field(formData, "intent");
  const courseId = field(formData, "courseId");
  if (!(intent in STATE_MESSAGES)) return { ok: false, message: "Acción no válida." };
  try {
    let result: CourseResult;
    if (intent === "publish") result = await setCoursePublished(guard.actor, guard.scope, courseId, true);
    else if (intent === "unpublish") result = await setCoursePublished(guard.actor, guard.scope, courseId, false);
    else if (intent === "archive") result = await archiveCourse(guard.actor, guard.scope, courseId);
    else if (intent === "restore") result = await restoreCourse(guard.actor, guard.scope, courseId);
    else result = await deleteCourseIfEmpty(guard.actor, guard.scope, courseId);
    if (!result.ok) return result;
    revalidate(result.courseId);
    return { ok: true, message: STATE_MESSAGES[intent as keyof typeof STATE_MESSAGES], courseId: result.courseId, deleted: intent === "delete" };
  } catch (error) {
    return failure("courseStateAction", error);
  }
}
