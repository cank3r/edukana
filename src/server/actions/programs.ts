"use server";

import { revalidatePath } from "next/cache";
import { actionFailure, formText, requireAcademicActor, type AcademicActionState } from "@/server/academic/guard";
import { addProgramCourses, createProgram, deleteProgram, moveProgramCourse, removeProgramCourse, updateProgram } from "@/server/academic/programs";

const programInput = (formData: FormData) => ({
  name: formText(formData, "name"),
  description: formText(formData, "description"),
  isPublished: formData.get("isPublished") !== null,
});

function refresh(programId?: string) {
  revalidatePath("/dashboard/gestion/programas");
  revalidatePath("/dashboard/gestion/grupos");
  if (programId) revalidatePath(`/dashboard/gestion/programas/${programId}`);
}

/** Crea un programa. Campos: `name`, `description` (opcional), `isPublished` (casilla). Devuelve `id`. */
export async function createProgramAction(_state: AcademicActionState, formData: FormData): Promise<AcademicActionState> {
  const guard = await requireAcademicActor("academic.structure.manage");
  if (guard.error !== null) return { ok: false, message: guard.error };
  try {
    const result = await createProgram(guard.actor, programInput(formData));
    if (!result.ok) return result;
    refresh();
    return { ok: true, message: "Programa creado. Ahora agrega sus cursos.", id: result.programId };
  } catch (error) {
    return actionFailure("createProgramAction", error);
  }
}

/** Edita un programa. Campos: `programId`, `name`, `description`, `isPublished`. */
export async function updateProgramAction(_state: AcademicActionState, formData: FormData): Promise<AcademicActionState> {
  const guard = await requireAcademicActor("academic.structure.manage");
  if (guard.error !== null) return { ok: false, message: guard.error };
  try {
    const programId = formText(formData, "programId");
    const result = await updateProgram(guard.actor, programId, programInput(formData));
    if (!result.ok) return result;
    refresh(programId);
    return { ok: true, message: "Cambios guardados." };
  } catch (error) {
    return actionFailure("updateProgramAction", error);
  }
}

/** Borra un programa. Campo: `programId`. Los grupos quedan sin programa; los cursos no se borran. */
export async function deleteProgramAction(_state: AcademicActionState, formData: FormData): Promise<AcademicActionState> {
  const guard = await requireAcademicActor("academic.structure.manage");
  if (guard.error !== null) return { ok: false, message: guard.error };
  try {
    const result = await deleteProgram(guard.actor, formText(formData, "programId"));
    if (!result.ok) return result;
    refresh();
    return { ok: true, message: "Programa borrado." };
  } catch (error) {
    return actionFailure("deleteProgramAction", error);
  }
}

/** Agrega cursos al programa. Campos: `programId` y uno o varios `courseIds`. */
export async function addProgramCoursesAction(_state: AcademicActionState, formData: FormData): Promise<AcademicActionState> {
  const guard = await requireAcademicActor("academic.structure.manage");
  if (guard.error !== null) return { ok: false, message: guard.error };
  try {
    const programId = formText(formData, "programId");
    const result = await addProgramCourses(guard.actor, programId, formData.getAll("courseIds").map(String));
    if (!result.ok) return result;
    refresh(programId);
    return { ok: true, message: result.added === 1 ? "Curso agregado al programa." : `${result.added} cursos agregados al programa.` };
  } catch (error) {
    return actionFailure("addProgramCoursesAction", error);
  }
}

/** Quita un curso del programa (el curso no se borra). Campos: `programId`, `courseId`. */
export async function removeProgramCourseAction(_state: AcademicActionState, formData: FormData): Promise<AcademicActionState> {
  const guard = await requireAcademicActor("academic.structure.manage");
  if (guard.error !== null) return { ok: false, message: guard.error };
  try {
    const programId = formText(formData, "programId");
    const result = await removeProgramCourse(guard.actor, programId, formText(formData, "courseId"));
    if (!result.ok) return result;
    refresh(programId);
    return { ok: true, message: "Curso quitado del programa." };
  } catch (error) {
    return actionFailure("removeProgramCourseAction", error);
  }
}

/** Sube o baja un curso. Campos: `programId`, `courseId`, `direction` ("up" | "down"). */
export async function moveProgramCourseAction(_state: AcademicActionState, formData: FormData): Promise<AcademicActionState> {
  const guard = await requireAcademicActor("academic.structure.manage");
  if (guard.error !== null) return { ok: false, message: guard.error };
  const direction = formData.get("direction");
  if (direction !== "up" && direction !== "down") return { ok: false, message: "Acción no válida." };
  try {
    const programId = formText(formData, "programId");
    const result = await moveProgramCourse(guard.actor, programId, formText(formData, "courseId"), direction);
    if (!result.ok) return result;
    refresh(programId);
    return { ok: true, message: "" };
  } catch (error) {
    return actionFailure("moveProgramCourseAction", error);
  }
}
