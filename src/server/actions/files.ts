"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { removeAvatar, removeCourseImage, removeInstitutionLogo, setAvatar, setCourseImage, setInstitutionLogo, type ImageResult } from "@/server/courses/images";
import { submitAssignmentWithFiles } from "@/server/courses/submission-files";
import type { UploadActor } from "@/server/courses/uploads";

export type FileActionState = { ok: boolean; message: string };

const SESSION_ENDED: FileActionState = { ok: false, message: "Tu sesión terminó. Vuelve a iniciar sesión." };
const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

async function actor(): Promise<UploadActor | null> {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) return null;
  return { id: user.id, institutionId: user.institutionId, role: user.role, capabilities: await getEffectiveCapabilities(user.institutionId, user.role) };
}

function failure(name: string, error: unknown): FileActionState {
  const correlationId = crypto.randomUUID();
  console.error(`${name} failed`, { correlationId, error });
  return { ok: false, message: `No se pudo completar. Intenta de nuevo. Código: ${correlationId}` };
}

function done(result: ImageResult, message: string, paths: string[]): FileActionState {
  if (!result.ok) return result;
  for (const path of paths) revalidatePath(path);
  return { ok: true, message };
}

/** Entregar tarea con archivos. Campos: `assignmentId`, `content`, `link`, `assetIds` (varios). */
export async function submitWithFilesAction(_state: FileActionState, formData: FormData): Promise<FileActionState> {
  const user = await actor();
  if (!user) return SESSION_ENDED;
  if (user.role !== "STUDENT" || !user.capabilities.has("course.participate")) return { ok: false, message: "Solo los estudiantes del curso pueden entregar tareas." };
  try {
    const result = await submitAssignmentWithFiles(user, {
      assignmentId: text(formData, "assignmentId"),
      content: text(formData, "content"),
      link: text(formData, "link"),
      assetIds: formData.getAll("assetIds").map(String),
    });
    if (!result.ok) return result;
    revalidatePath(`/dashboard/aula/${result.courseId}/tareas`, "layout");
    revalidatePath(`/dashboard/aula/${result.courseId}`);
    return { ok: true, message: result.resubmitted ? "Entrega actualizada. Tu docente verá esta nueva versión." : "Tarea entregada. Tu docente ya puede verla." };
  } catch (error) {
    return failure("submitWithFilesAction", error);
  }
}

/** Guardar o quitar la imagen del curso. Campos: `courseId`, `assetId` (vacío para quitar). */
export async function courseImageAction(_state: FileActionState, formData: FormData): Promise<FileActionState> {
  const user = await actor();
  if (!user) return SESSION_ENDED;
  const courseId = text(formData, "courseId");
  const assetId = text(formData, "assetId");
  try {
    const result = assetId ? await setCourseImage(user, courseId, assetId) : await removeCourseImage(user, courseId);
    return done(result, assetId ? "Imagen del curso guardada." : "Imagen del curso quitada.", ["/dashboard/aula", `/dashboard/aula/${courseId}`, `/dashboard/aula/${courseId}/editar`]);
  } catch (error) {
    return failure("courseImageAction", error);
  }
}

/** Guardar o quitar la foto de perfil propia. Campo: `assetId` (vacío para quitar). */
export async function avatarAction(_state: FileActionState, formData: FormData): Promise<FileActionState> {
  const user = await actor();
  if (!user) return SESSION_ENDED;
  const assetId = text(formData, "assetId");
  try {
    const result = assetId ? await setAvatar(user, assetId) : await removeAvatar(user);
    return done(result, assetId ? "Foto guardada." : "Foto quitada.", ["/dashboard/perfil"]);
  } catch (error) {
    return failure("avatarAction", error);
  }
}

/** Guardar o quitar el logo de la institución. Campo: `assetId` (vacío para quitar). */
export async function institutionLogoAction(_state: FileActionState, formData: FormData): Promise<FileActionState> {
  const user = await actor();
  if (!user) return SESSION_ENDED;
  const assetId = text(formData, "assetId");
  try {
    const result = assetId ? await setInstitutionLogo(user, assetId) : await removeInstitutionLogo(user);
    return done(result, assetId ? "Logo guardado." : "Logo quitado.", ["/dashboard/configuracion/institucion"]);
  } catch (error) {
    return failure("institutionLogoAction", error);
  }
}
