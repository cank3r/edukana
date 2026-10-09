"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import {
  enrollGroup,
  enrollStudents,
  reinstateStudent,
  searchEnrollableStudents,
  withdrawStudent,
  type EnrollResult,
} from "@/server/courses/enrollment";
import type { EdukanaRole } from "@/types/next-auth";

export type CourseEnrollmentState = { ok: boolean; message: string };
export type EnrollableSearch = { ok: boolean; message: string; students: Array<{ id: string; name: string; email: string }>; more: boolean };

type Actor = { id: string; institutionId: string; role: EdukanaRole };
const SESSION_ENDED = "Tu sesión terminó. Vuelve a iniciar sesión.";

// El permiso sobre el curso se comprueba en `src/server/courses/enrollment.ts` con cada operación.
async function currentActor(): Promise<Actor | null> {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) return null;
  return { id: user.id, institutionId: user.institutionId, role: user.role };
}

function failure(name: string, error: unknown): CourseEnrollmentState {
  const correlationId = crypto.randomUUID();
  console.error(`${name} failed`, { correlationId, error });
  return { ok: false, message: `No se pudo completar. Intenta de nuevo. Código: ${correlationId}` };
}

function refresh(courseId: string) {
  revalidatePath(`/dashboard/aula/${courseId}/estudiantes`);
  revalidatePath(`/dashboard/aula/${courseId}`);
  revalidatePath("/dashboard/portal");
}

const count = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

function enrollMessage(result: Extract<EnrollResult, { ok: true }>) {
  const parts: string[] = [];
  if (result.enrolled) parts.push(`${count(result.enrolled, "estudiante inscrito", "estudiantes inscritos")}`);
  if (result.reinstated) parts.push(`${count(result.reinstated, "reincorporado", "reincorporados")} con su historial`);
  if (result.already) parts.push(`${count(result.already, "ya estaba en el curso", "ya estaban en el curso")}`);
  if (result.skipped) parts.push(`${count(result.skipped, "persona del grupo no se inscribió", "personas del grupo no se inscribieron")} por no tener el acceso activo`);
  const text = parts.join(" · ");
  return result.enrolled + result.reinstated > 0 ? `Listo: ${text}.` : `No hubo cambios: ${text}.`;
}

/** Inscribe a los estudiantes elegidos. Campos: `courseId` y `studentIds` (uno por estudiante). */
export async function enrollStudentsAction(_state: CourseEnrollmentState, formData: FormData): Promise<CourseEnrollmentState> {
  const actor = await currentActor();
  if (!actor) return { ok: false, message: SESSION_ENDED };
  const courseId = String(formData.get("courseId") ?? "");
  try {
    const result = await enrollStudents(actor, courseId, formData.getAll("studentIds").map(String));
    if (!result.ok) return result;
    refresh(courseId);
    return { ok: true, message: enrollMessage(result) };
  } catch (error) {
    return failure("enrollStudentsAction", error);
  }
}

/** Inscribe a todos los miembros de un grupo. Campos: `courseId`, `groupId`. */
export async function enrollGroupAction(_state: CourseEnrollmentState, formData: FormData): Promise<CourseEnrollmentState> {
  const actor = await currentActor();
  if (!actor) return { ok: false, message: SESSION_ENDED };
  const courseId = String(formData.get("courseId") ?? "");
  try {
    const result = await enrollGroup(actor, courseId, String(formData.get("groupId") ?? ""));
    if (!result.ok) return result;
    refresh(courseId);
    return { ok: true, message: enrollMessage(result) };
  } catch (error) {
    return failure("enrollGroupAction", error);
  }
}

/** Retira a un estudiante. Campos: `courseId`, `enrollmentId`, `reason`. */
export async function withdrawStudentAction(_state: CourseEnrollmentState, formData: FormData): Promise<CourseEnrollmentState> {
  const actor = await currentActor();
  if (!actor) return { ok: false, message: SESSION_ENDED };
  const courseId = String(formData.get("courseId") ?? "");
  try {
    const result = await withdrawStudent(actor, courseId, String(formData.get("enrollmentId") ?? ""), String(formData.get("reason") ?? ""));
    if (!result.ok) return result;
    refresh(courseId);
    return { ok: true, message: "Estudiante retirado del curso. Sus notas, entregas y avance se conservan." };
  } catch (error) {
    return failure("withdrawStudentAction", error);
  }
}

/** Reincorpora a un estudiante retirado. Campos: `courseId`, `enrollmentId`. */
export async function reinstateStudentAction(_state: CourseEnrollmentState, formData: FormData): Promise<CourseEnrollmentState> {
  const actor = await currentActor();
  if (!actor) return { ok: false, message: SESSION_ENDED };
  const courseId = String(formData.get("courseId") ?? "");
  try {
    const result = await reinstateStudent(actor, courseId, String(formData.get("enrollmentId") ?? ""));
    if (!result.ok) return result;
    refresh(courseId);
    return { ok: true, message: "Estudiante reincorporado al curso." };
  } catch (error) {
    return failure("reinstateStudentAction", error);
  }
}

/** Busca estudiantes activos que todavía no están en el curso. */
export async function searchEnrollableStudentsAction(courseId: string, query: string): Promise<EnrollableSearch> {
  const actor = await currentActor();
  if (!actor) return { ok: false, message: SESSION_ENDED, students: [], more: false };
  try {
    const result = await searchEnrollableStudents(actor, String(courseId ?? ""), String(query ?? ""));
    if (!result) return { ok: false, message: "No encontramos ese curso o no tienes permiso para gestionarlo.", students: [], more: false };
    return { ok: true, message: "", ...result };
  } catch (error) {
    return { ...failure("searchEnrollableStudentsAction", error), students: [], more: false };
  }
}
