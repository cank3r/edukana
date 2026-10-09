"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { sendInvitations, sendPendingInvitations } from "@/server/people/invitations";
import { setPersonStatus } from "@/server/people/status";

export type PeopleActionState = { ok: boolean; message: string; remaining?: number };

async function requirePeopleManager() {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) return { error: "Tu sesión terminó. Vuelve a iniciar sesión." } as const;
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!capabilities.has("people.manage")) return { error: "No tienes permiso para gestionar personas." } as const;
  return { actor: { id: user.id, institutionId: user.institutionId, role: user.role } } as const;
}

function failure(name: string, error: unknown): PeopleActionState {
  const correlationId = crypto.randomUUID();
  console.error(`${name} failed`, { correlationId, error });
  return { ok: false, message: `No se pudo completar. Intenta de nuevo. Código: ${correlationId}` };
}

/** Invita (o vuelve a invitar) a una persona. Campo: `userId`. */
export async function invitePersonAction(_state: PeopleActionState, formData: FormData): Promise<PeopleActionState> {
  const guard = await requirePeopleManager();
  if ("error" in guard) return { ok: false, message: guard.error };
  try {
    const result = await sendInvitations(guard.actor, [String(formData.get("userId") ?? "")]);
    if (result.sent === 1) return { ok: true, message: "Invitación enviada." };
    if (result.failed) return { ok: false, message: "No se pudo enviar el correo. Intenta de nuevo en unos minutos." };
    return { ok: false, message: "Esa persona no puede recibir invitaciones: no existe aquí o está suspendida." };
  } catch (error) {
    return failure("invitePersonAction", error);
  }
}

/**
 * Invita al siguiente lote de personas que aún no pueden entrar. Sin campos.
 * Mientras `remaining` sea mayor que cero y `ok` sea true, la pantalla vuelve a llamar.
 */
export async function invitePendingPeopleAction(): Promise<PeopleActionState> {
  const guard = await requirePeopleManager();
  if ("error" in guard) return { ok: false, message: guard.error };
  try {
    const result = await sendPendingInvitations(guard.actor);
    if (result.failed) {
      return {
        ok: false,
        remaining: result.remaining,
        message: `Se enviaron ${result.sent} invitaciones y ${result.failed} fallaron. Intenta de nuevo en unos minutos.`,
      };
    }
    return {
      ok: true,
      remaining: result.remaining,
      message: result.remaining ? `Enviadas ${result.sent}. Faltan ${result.remaining}.` : `Listo: ${result.sent} invitaciones enviadas.`,
    };
  } catch (error) {
    return failure("invitePendingPeopleAction", error);
  }
}

/** Suspende o reactiva. Campos: `userId`, `status` ("SUSPENDED" | "ACTIVE") y `reason` (obligatorio al suspender). */
export async function setPersonStatusAction(_state: PeopleActionState, formData: FormData): Promise<PeopleActionState> {
  const guard = await requirePeopleManager();
  if ("error" in guard) return { ok: false, message: guard.error };
  const status = formData.get("status");
  if (status !== "SUSPENDED" && status !== "ACTIVE") return { ok: false, message: "Acción no válida." };
  try {
    const result = await setPersonStatus(guard.actor, {
      userId: String(formData.get("userId") ?? ""),
      status,
      reason: String(formData.get("reason") ?? ""),
    });
    if (!result.ok) return result;
    revalidatePath("/dashboard/gestion");
    return { ok: true, message: status === "SUSPENDED" ? "Acceso suspendido." : "Acceso reactivado." };
  } catch (error) {
    return failure("setPersonStatusAction", error);
  }
}
