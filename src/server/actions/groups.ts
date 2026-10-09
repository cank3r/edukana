"use server";

import { revalidatePath } from "next/cache";
import { actionFailure, formText, requireAcademicActor, type AcademicActionState } from "@/server/academic/guard";
import {
  addGroupCourses,
  addGroupMembers,
  addProgramCoursesToGroup,
  createGroup,
  deleteGroup,
  enrollGroupInCourses,
  removeGroupCourse,
  removeGroupMember,
  updateGroup,
  type CourseEnrollmentPlan,
} from "@/server/academic/groups";

export type GroupEnrollActionState = { ok: boolean; message: string; courses?: Array<CourseEnrollmentPlan & { enrolled: number }> };

const groupInput = (formData: FormData) => ({
  name: formText(formData, "name"),
  description: formText(formData, "description"),
  programId: formText(formData, "programId"),
  startsOn: formText(formData, "startsOn"),
  endsOn: formText(formData, "endsOn"),
  capacity: formText(formData, "capacity"),
});

function refresh(groupId?: string) {
  revalidatePath("/dashboard/gestion/grupos");
  revalidatePath("/dashboard/gestion/programas");
  if (groupId) revalidatePath(`/dashboard/gestion/grupos/${groupId}`);
}

/** Crea un grupo. Campos: `name`, `programId`, `startsOn`, `endsOn`, `capacity`, `description`. Devuelve `id`. */
export async function createGroupAction(_state: AcademicActionState, formData: FormData): Promise<AcademicActionState> {
  const guard = await requireAcademicActor("academic.structure.manage");
  if (guard.error !== null) return { ok: false, message: guard.error };
  try {
    const result = await createGroup(guard.actor, groupInput(formData));
    if (!result.ok) return result;
    refresh();
    return { ok: true, message: "Grupo creado. Ahora agrega sus estudiantes y cursos.", id: result.groupId };
  } catch (error) {
    return actionFailure("createGroupAction", error);
  }
}

/** Edita un grupo. Campos: `groupId` y los mismos de crear. */
export async function updateGroupAction(_state: AcademicActionState, formData: FormData): Promise<AcademicActionState> {
  const guard = await requireAcademicActor("academic.structure.manage");
  if (guard.error !== null) return { ok: false, message: guard.error };
  try {
    const groupId = formText(formData, "groupId");
    const result = await updateGroup(guard.actor, groupId, groupInput(formData));
    if (!result.ok) return result;
    refresh(groupId);
    return { ok: true, message: "Cambios guardados." };
  } catch (error) {
    return actionFailure("updateGroupAction", error);
  }
}

/** Borra un grupo. Campo: `groupId`. Las inscripciones a cursos ya hechas no se deshacen. */
export async function deleteGroupAction(_state: AcademicActionState, formData: FormData): Promise<AcademicActionState> {
  const guard = await requireAcademicActor("academic.structure.manage");
  if (guard.error !== null) return { ok: false, message: guard.error };
  try {
    const result = await deleteGroup(guard.actor, formText(formData, "groupId"));
    if (!result.ok) return result;
    refresh();
    return { ok: true, message: "Grupo borrado." };
  } catch (error) {
    return actionFailure("deleteGroupAction", error);
  }
}

/** Agrega estudiantes. Campos: `groupId` y uno o varios `userIds`. */
export async function addGroupMembersAction(_state: AcademicActionState, formData: FormData): Promise<AcademicActionState> {
  const guard = await requireAcademicActor("academic.structure.manage");
  if (guard.error !== null) return { ok: false, message: guard.error };
  try {
    const groupId = formText(formData, "groupId");
    const result = await addGroupMembers(guard.actor, groupId, formData.getAll("userIds").map(String));
    if (!result.ok) return result;
    refresh(groupId);
    return { ok: true, message: result.added === 1 ? "1 estudiante agregado al grupo." : `${result.added} estudiantes agregados al grupo.` };
  } catch (error) {
    return actionFailure("addGroupMembersAction", error);
  }
}

/** Quita a un estudiante del grupo. Campos: `groupId`, `userId`. */
export async function removeGroupMemberAction(_state: AcademicActionState, formData: FormData): Promise<AcademicActionState> {
  const guard = await requireAcademicActor("academic.structure.manage");
  if (guard.error !== null) return { ok: false, message: guard.error };
  try {
    const groupId = formText(formData, "groupId");
    const result = await removeGroupMember(guard.actor, groupId, formText(formData, "userId"));
    if (!result.ok) return result;
    refresh(groupId);
    return { ok: true, message: "Estudiante quitado del grupo. Sus cursos no cambiaron." };
  } catch (error) {
    return actionFailure("removeGroupMemberAction", error);
  }
}

/** Agrega cursos al grupo. Campos: `groupId` y uno o varios `courseIds`; o `fromProgram` para traer todos los del programa. */
export async function addGroupCoursesAction(_state: AcademicActionState, formData: FormData): Promise<AcademicActionState> {
  const guard = await requireAcademicActor("academic.structure.manage");
  if (guard.error !== null) return { ok: false, message: guard.error };
  try {
    const groupId = formText(formData, "groupId");
    const result = formData.get("fromProgram")
      ? await addProgramCoursesToGroup(guard.actor, groupId)
      : await addGroupCourses(guard.actor, groupId, formData.getAll("courseIds").map(String));
    if (!result.ok) return result;
    refresh(groupId);
    if (result.added === 0) return { ok: true, message: "Esos cursos ya estaban en el grupo." };
    return { ok: true, message: result.added === 1 ? "Curso agregado al grupo." : `${result.added} cursos agregados al grupo.` };
  } catch (error) {
    return actionFailure("addGroupCoursesAction", error);
  }
}

/** Quita un curso del grupo. Campos: `groupId`, `courseId`. */
export async function removeGroupCourseAction(_state: AcademicActionState, formData: FormData): Promise<AcademicActionState> {
  const guard = await requireAcademicActor("academic.structure.manage");
  if (guard.error !== null) return { ok: false, message: guard.error };
  try {
    const groupId = formText(formData, "groupId");
    const result = await removeGroupCourse(guard.actor, groupId, formText(formData, "courseId"));
    if (!result.ok) return result;
    refresh(groupId);
    return { ok: true, message: "Curso quitado del grupo. Quienes ya estaban inscritos siguen inscritos." };
  } catch (error) {
    return actionFailure("removeGroupCourseAction", error);
  }
}

/** Inscribe a los estudiantes del grupo en los cursos del grupo. Campo: `groupId`. Exige permiso de matrícula. */
export async function enrollGroupAction(_state: GroupEnrollActionState, formData: FormData): Promise<GroupEnrollActionState> {
  const guard = await requireAcademicActor("enrollment.manage");
  if (guard.error !== null) return { ok: false, message: guard.error };
  try {
    const groupId = formText(formData, "groupId");
    const result = await enrollGroupInCourses(guard.actor, groupId);
    if (!result.ok) return result;
    refresh(groupId);
    revalidatePath("/dashboard/aula");
    const skipped = result.courses.filter((course) => course.blocked).length;
    const done =
      result.enrolled === 0
        ? "No había inscripciones nuevas por hacer."
        : result.enrolled === 1
          ? "Listo: se hizo 1 inscripción nueva."
          : `Listo: se hicieron ${result.enrolled} inscripciones nuevas.`;
    return {
      ok: true,
      message: skipped ? `${done} ${skipped === 1 ? "1 curso no se tocó" : `${skipped} cursos no se tocaron`}: mira el detalle abajo.` : done,
      courses: result.courses,
    };
  } catch (error) {
    return actionFailure("enrollGroupAction", error);
  }
}
