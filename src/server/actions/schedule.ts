"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { deleteScheduleSlot, saveScheduleSlot } from "@/server/courses/schedule";
import type { EdukanaRole } from "@/types/next-auth";

export type ScheduleActionState = { ok: boolean; message: string; warning?: string };

type Actor = { id: string; institutionId: string; role: EdukanaRole };
const SESSION_ENDED: ScheduleActionState = { ok: false, message: "Tu sesión terminó. Vuelve a iniciar sesión." };
const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");

// El permiso sobre el curso se comprueba en `src/server/courses/schedule.ts` con cada operación.
async function currentActor(): Promise<Actor | null> {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) return null;
  return { id: user.id, institutionId: user.institutionId, role: user.role };
}

function failure(name: string, error: unknown): ScheduleActionState {
  const correlationId = crypto.randomUUID();
  console.error(`${name} failed`, { correlationId, error });
  return { ok: false, message: `No se pudo completar. Intenta de nuevo. Código: ${correlationId}` };
}

function refresh(courseId: string) {
  revalidatePath(`/dashboard/aula/${courseId}/horario`);
  revalidatePath(`/dashboard/aula/${courseId}`);
  revalidatePath("/dashboard/horario");
  revalidatePath("/dashboard/calendario");
}

/** Agrega o cambia un bloque. Campos: `courseId`, `slotId` (al editar), `weekday`, `start`, `end`, `classroom`, `startsOn`, `endsOn`. */
export async function saveScheduleSlotAction(_state: ScheduleActionState, formData: FormData): Promise<ScheduleActionState> {
  const actor = await currentActor();
  if (!actor) return SESSION_ENDED;
  const courseId = text(formData, "courseId");
  try {
    const result = await saveScheduleSlot(
      actor,
      courseId,
      {
        weekday: text(formData, "weekday"),
        start: text(formData, "start"),
        end: text(formData, "end"),
        classroom: text(formData, "classroom"),
        startsOn: text(formData, "startsOn"),
        endsOn: text(formData, "endsOn"),
      },
      text(formData, "slotId") || undefined,
    );
    if (!result.ok) return { ok: false, message: result.message };
    refresh(courseId);
    return { ok: true, message: result.created ? "Bloque agregado al horario." : "Bloque actualizado.", warning: result.warning ?? undefined };
  } catch (error) {
    return failure("saveScheduleSlotAction", error);
  }
}

/** Borra un bloque. Campos: `courseId`, `slotId`. */
export async function deleteScheduleSlotAction(_state: ScheduleActionState, formData: FormData): Promise<ScheduleActionState> {
  const actor = await currentActor();
  if (!actor) return SESSION_ENDED;
  const courseId = text(formData, "courseId");
  try {
    const result = await deleteScheduleSlot(actor, courseId, text(formData, "slotId"));
    if (!result.ok) return result;
    refresh(courseId);
    return { ok: true, message: "Bloque borrado del horario." };
  } catch (error) {
    return failure("deleteScheduleSlotAction", error);
  }
}
