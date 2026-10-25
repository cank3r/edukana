"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createLiveClasses, deleteLiveClass, updateLiveClass, type LiveClassResult } from "@/server/courses/live-classes";
import type { EdukanaRole } from "@/types/next-auth";

export type LiveClassActionState = { ok: boolean; message: string; warning?: string };

type Actor = { id: string; institutionId: string; role: EdukanaRole };

/** Solo identifica a la persona; el permiso sobre el curso lo decide la lógica en `src/server/courses/live-classes.ts`. */
async function currentActor(): Promise<Actor | null> {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) return null;
  return { id: user.id, institutionId: user.institutionId, role: user.role };
}

const SESSION_ENDED: LiveClassActionState = { ok: false, message: "Tu sesión terminó. Vuelve a iniciar sesión." };
const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");

function failure(name: string, error: unknown): LiveClassActionState {
  const correlationId = crypto.randomUUID();
  console.error(`${name} failed`, { correlationId, error });
  return { ok: false, message: `No se pudo completar. Intenta de nuevo. Código: ${correlationId}` };
}

function refresh(courseId: string) {
  revalidatePath(`/dashboard/aula/${courseId}/clases`);
  revalidatePath("/dashboard/calendario");
}

function toState(result: LiveClassResult, done: string): LiveClassActionState {
  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true, message: done, warning: result.warning ?? undefined };
}

/** Campos: `courseId`, `title`, `date`, `time`, `durationMinutes`, `joinUrl`, `description`, `weeks`. */
export async function createLiveClassAction(_state: LiveClassActionState, formData: FormData): Promise<LiveClassActionState> {
  const actor = await currentActor();
  if (!actor) return SESSION_ENDED;
  try {
    const result = await createLiveClasses(actor, {
      courseId: text(formData, "courseId"),
      title: text(formData, "title"),
      date: text(formData, "date"),
      time: text(formData, "time"),
      durationMinutes: text(formData, "durationMinutes"),
      joinUrl: text(formData, "joinUrl"),
      description: text(formData, "description"),
      weeks: text(formData, "weeks"),
    });
    if (result.ok) refresh(result.courseId);
    return toState(result, result.ok && result.created > 1 ? `Listo: se programaron ${result.created} clases, una por semana.` : "Listo: la clase quedó programada.");
  } catch (error) {
    return failure("createLiveClassAction", error);
  }
}

/** Campos: `id`, `title`, `date`, `time`, `durationMinutes`, `joinUrl`, `description`. */
export async function updateLiveClassAction(_state: LiveClassActionState, formData: FormData): Promise<LiveClassActionState> {
  const actor = await currentActor();
  if (!actor) return SESSION_ENDED;
  try {
    const result = await updateLiveClass(actor, {
      id: text(formData, "id"),
      title: text(formData, "title"),
      date: text(formData, "date"),
      time: text(formData, "time"),
      durationMinutes: text(formData, "durationMinutes"),
      joinUrl: text(formData, "joinUrl"),
      description: text(formData, "description"),
    });
    if (result.ok) refresh(result.courseId);
    return toState(result, "Cambios guardados.");
  } catch (error) {
    return failure("updateLiveClassAction", error);
  }
}

/** Campo: `id`. */
export async function deleteLiveClassAction(_state: LiveClassActionState, formData: FormData): Promise<LiveClassActionState> {
  const actor = await currentActor();
  if (!actor) return SESSION_ENDED;
  try {
    const result = await deleteLiveClass(actor, text(formData, "id"));
    if (!result.ok) return { ok: false, message: result.message };
    refresh(result.courseId);
    return { ok: true, message: "Clase borrada." };
  } catch (error) {
    return failure("deleteLiveClassAction", error);
  }
}
