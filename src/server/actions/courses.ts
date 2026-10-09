"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { resolveCourseWriteScope, type CourseScope } from "@/lib/course-scope";
import {
  archiveCourse,
  createCourse,
  restoreCourse,
  setCoursePublished,
  updateCourse,
  type CourseActor,
  type CourseOperation,
  type CourseResult,
} from "@/server/courses/course";

export type CourseActionState = { ok: boolean; message: string; courseId?: string };

type Guard = { actor: CourseActor; scope: CourseScope } | { error: string };

async function requireCourseOperation(operation: CourseOperation): Promise<Guard> {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) return { error: "Tu sesión terminó. Vuelve a iniciar sesión." };
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!capabilities.has(`course.${operation}` as const)) return { error: "No tienes permiso para realizar esta acción." };
  const scope = resolveCourseWriteScope(user, capabilities);
  if (scope.kind === "none") return { error: "No tienes permiso para gestionar cursos." };
  return {
    actor: { id: user.id, institutionId: user.institutionId, role: user.role, capabilities },
    scope,
  };
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

export async function createCourseAction(_state: CourseActionState, formData: FormData): Promise<CourseActionState> {
  const guard = await requireCourseOperation("create");
  if ("error" in guard) return { ok: false, message: guard.error };
  try {
    const result = await createCourse(guard.actor, guard.scope, courseFields(formData));
    if (!result.ok) return result;
    revalidate(result.courseId);
    return { ok: true, message: "Curso creado como borrador.", courseId: result.courseId };
  } catch (error) {
    return failure("createCourseAction", error);
  }
}

export async function updateCourseAction(_state: CourseActionState, formData: FormData): Promise<CourseActionState> {
  const guard = await requireCourseOperation("edit");
  if ("error" in guard) return { ok: false, message: guard.error };
  try {
    const result = await updateCourse(guard.actor, guard.scope, field(formData, "courseId"), courseFields(formData));
    if (!result.ok) return result;
    revalidate(result.courseId);
    return { ok: true, message: "Cambios guardados.", courseId: result.courseId };
  } catch (error) {
    return failure("updateCourseAction", error);
  }
}

const stateSchema = z.object({
  courseId: z.string().min(1),
  intent: z.enum(["publish", "unpublish", "archive", "restore"]),
});

const stateMessages = {
  publish: "Curso publicado. Sus estudiantes inscritos ya lo ven.",
  unpublish: "El curso volvió a borrador. Sus estudiantes ya no lo ven.",
  archive: "Curso archivado. Su historial se conserva en modo consulta.",
  restore: "Curso restaurado como borrador. Revísalo antes de publicarlo.",
} as const;

export async function courseStateAction(_state: CourseActionState, formData: FormData): Promise<CourseActionState> {
  const parsed = stateSchema.safeParse({
    courseId: field(formData, "courseId"),
    intent: field(formData, "intent"),
  });
  if (!parsed.success) return { ok: false, message: "La acción solicitada no es válida." };
  const operation: CourseOperation = parsed.data.intent === "publish" || parsed.data.intent === "unpublish" ? "publish" : "archive";
  const guard = await requireCourseOperation(operation);
  if ("error" in guard) return { ok: false, message: guard.error };

  try {
    let result: CourseResult;
    if (parsed.data.intent === "publish") result = await setCoursePublished(guard.actor, guard.scope, parsed.data.courseId, true);
    else if (parsed.data.intent === "unpublish") result = await setCoursePublished(guard.actor, guard.scope, parsed.data.courseId, false);
    else if (parsed.data.intent === "archive") result = await archiveCourse(guard.actor, guard.scope, parsed.data.courseId);
    else result = await restoreCourse(guard.actor, guard.scope, parsed.data.courseId);
    if (!result.ok) return result;
    revalidate(result.courseId);
    return { ok: true, message: stateMessages[parsed.data.intent], courseId: result.courseId };
  } catch (error) {
    return failure("courseStateAction", error);
  }
}
