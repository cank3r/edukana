"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import {
  deleteAssignment,
  gradeSubmission,
  saveAssignment,
  setAssignmentPublished,
  submitAssignment,
  type AssignmentManager,
  type AssignmentStudent,
} from "@/server/assessment/assignments";

export type AssignmentActionState = { ok: boolean; message: string };

const SESSION_ENDED = "Tu sesión terminó. Vuelve a iniciar sesión.";
const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

async function requireManager(): Promise<AssignmentManager | string> {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) return SESSION_ENDED;
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!capabilities.has("course.manage")) return "No tienes permiso para gestionar las tareas de este curso.";
  return { id: user.id, institutionId: user.institutionId, role: user.role, capabilities };
}

async function requireStudent(): Promise<AssignmentStudent | string> {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) return SESSION_ENDED;
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (user.role !== "STUDENT" || !capabilities.has("course.participate")) return "Solo los estudiantes del curso pueden entregar tareas.";
  return { id: user.id, institutionId: user.institutionId };
}

function failure(name: string, error: unknown): AssignmentActionState {
  const correlationId = crypto.randomUUID();
  console.error(`${name} failed`, { correlationId, error });
  return { ok: false, message: `No se pudo completar. Intenta de nuevo. Código: ${correlationId}` };
}

function refresh(courseId: string) {
  revalidatePath(`/dashboard/aula/${courseId}/tareas`, "layout");
  revalidatePath(`/dashboard/aula/${courseId}`);
}

/** Crear o corregir una tarea. Campos: `courseId`, `assignmentId` (vacío al crear), `title`, `instructions`, `dueLocal`, `maxScore`, `allowLate`, `categoryId`, `publish`. */
export async function saveAssignmentAction(_state: AssignmentActionState, formData: FormData): Promise<AssignmentActionState> {
  const actor = await requireManager();
  if (typeof actor === "string") return { ok: false, message: actor };
  try {
    const editing = Boolean(text(formData, "assignmentId"));
    const publish = formData.get("publish") === "on";
    const result = await saveAssignment(actor, {
      courseId: text(formData, "courseId"),
      assignmentId: text(formData, "assignmentId") || undefined,
      title: text(formData, "title"),
      instructions: text(formData, "instructions"),
      dueLocal: text(formData, "dueLocal"),
      maxScore: text(formData, "maxScore"),
      allowLate: formData.get("allowLate") === "on",
      categoryId: text(formData, "categoryId") || undefined,
      publish,
    });
    if (!result.ok) return result;
    refresh(result.courseId);
    if (editing) return { ok: true, message: "Cambios guardados." };
    return { ok: true, message: publish ? "Tarea creada y publicada. Tus estudiantes ya pueden verla." : "Tarea guardada como borrador. Publícala cuando esté lista." };
  } catch (error) {
    return failure("saveAssignmentAction", error);
  }
}

/** Publicar u ocultar. Campos: `assignmentId`, `published` ("true" | "false"). */
export async function setAssignmentPublishedAction(_state: AssignmentActionState, formData: FormData): Promise<AssignmentActionState> {
  const actor = await requireManager();
  if (typeof actor === "string") return { ok: false, message: actor };
  try {
    const published = text(formData, "published") === "true";
    const result = await setAssignmentPublished(actor, text(formData, "assignmentId"), published);
    if (!result.ok) return result;
    refresh(result.courseId);
    return { ok: true, message: published ? "Tarea publicada. Tus estudiantes ya pueden verla." : "Tarea oculta. Las entregas y las notas se conservan." };
  } catch (error) {
    return failure("setAssignmentPublishedAction", error);
  }
}

/** Borrar. Campos: `assignmentId`, `reason` (obligatorio si hay entregas). */
export async function deleteAssignmentAction(_state: AssignmentActionState, formData: FormData): Promise<AssignmentActionState> {
  const actor = await requireManager();
  if (typeof actor === "string") return { ok: false, message: actor };
  try {
    const result = await deleteAssignment(actor, { assignmentId: text(formData, "assignmentId"), reason: text(formData, "reason") });
    if (!result.ok) return result;
    refresh(result.courseId);
    return { ok: true, message: "Tarea borrada." };
  } catch (error) {
    return failure("deleteAssignmentAction", error);
  }
}

/** Guardar nota. Campos: `submissionId`, `score`, `feedback`, `reason` (obligatorio al cambiar una nota ya puesta). */
export async function gradeSubmissionAction(_state: AssignmentActionState, formData: FormData): Promise<AssignmentActionState> {
  const actor = await requireManager();
  if (typeof actor === "string") return { ok: false, message: actor };
  try {
    const result = await gradeSubmission(actor, {
      submissionId: text(formData, "submissionId"),
      score: text(formData, "score"),
      feedback: text(formData, "feedback"),
      reason: text(formData, "reason"),
    });
    if (!result.ok) return result;
    refresh(result.courseId);
    return { ok: true, message: result.corrected ? "Nota corregida. El cambio quedó en el historial." : "Nota guardada." };
  } catch (error) {
    return failure("gradeSubmissionAction", error);
  }
}

/** Entregar tarea. Campos: `assignmentId`, `content`, `link`. */
export async function submitAssignmentAction(_state: AssignmentActionState, formData: FormData): Promise<AssignmentActionState> {
  const actor = await requireStudent();
  if (typeof actor === "string") return { ok: false, message: actor };
  try {
    const result = await submitAssignment(actor, { assignmentId: text(formData, "assignmentId"), content: text(formData, "content"), link: text(formData, "link") });
    if (!result.ok) return result;
    refresh(result.courseId);
    return { ok: true, message: result.resubmitted ? "Entrega actualizada. Tu docente verá esta nueva versión." : "Tarea entregada. Tu docente ya puede verla." };
  } catch (error) {
    return failure("submitAssignmentAction", error);
  }
}
