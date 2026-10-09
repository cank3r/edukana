"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { sendInvitations, sendPendingInvitations } from "@/server/people/invitations";
import { updatePerson } from "@/server/people/profile";
import { setPersonStatus } from "@/server/people/status";
import type { EdukanaRole } from "@/types/next-auth";

export type PeopleActionState = { ok: boolean; message: string; remaining?: number };

type Guard = { actor: { id: string; institutionId: string; role: EdukanaRole }; error: null } | { actor: null; error: string };

async function requirePeopleManager(): Promise<Guard> {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) return { actor: null, error: "Tu sesión terminó. Vuelve a iniciar sesión." };
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!capabilities.has("people.manage")) return { actor: null, error: "No tienes permiso para gestionar personas." };
  return { actor: { id: user.id, institutionId: user.institutionId, role: user.role }, error: null };
}

function failure(name: string, error: unknown): PeopleActionState {
  const correlationId = crypto.randomUUID();
  console.error(`${name} failed`, { correlationId, error });
  return { ok: false, message: `No se pudo completar. Intenta de nuevo. Código: ${correlationId}` };
}

/** Invita (o vuelve a invitar) a una persona. Campo: `userId`. */
export async function invitePersonAction(_state: PeopleActionState, formData: FormData): Promise<PeopleActionState> {
  const guard = await requirePeopleManager();
  if (guard.error !== null) return { ok: false, message: guard.error };
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
  if (guard.error !== null) return { ok: false, message: guard.error };
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
  if (guard.error !== null) return { ok: false, message: guard.error };
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
    revalidatePath("/dashboard/gestion/accesos");
    return { ok: true, message: status === "SUSPENDED" ? "Acceso suspendido." : "Acceso reactivado." };
  } catch (error) {
    return failure("setPersonStatusAction", error);
  }
}

/** Corrige los datos de una persona. Campos: `userId`, `name`, `phone`, `role`. */
export async function updatePersonAction(_state: PeopleActionState, formData: FormData): Promise<PeopleActionState> {
  const guard = await requirePeopleManager();
  if (guard.error !== null) return { ok: false, message: guard.error };
  try {
    const result = await updatePerson(guard.actor, {
      userId: String(formData.get("userId") ?? ""),
      name: String(formData.get("name") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      role: String(formData.get("role") ?? ""),
    });
    if (!result.ok) return result;
    revalidatePath("/dashboard/gestion");
    revalidatePath("/dashboard/gestion/accesos");
    return { ok: true, message: "Datos guardados." };
  } catch (error) {
    return failure("updatePersonAction", error);
  }
}

/**
 * Agrega una persona. Campos: `name`, `email`, `role`, `phone` (opcional) e `invite`
 * (casilla: si viene marcada se le envía la invitación en el mismo paso).
 */
export async function createPersonAction(_state: PeopleActionState, formData: FormData): Promise<PeopleActionState> {
  const guard = await requirePeopleManager();
  if (guard.error !== null) return { ok: false, message: guard.error };
  let userId: string;
  try {
    const { createPerson } = await import("@/server/people/create");
    const result = await createPerson(guard.actor, {
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      role: String(formData.get("role") ?? ""),
      phone: String(formData.get("phone") ?? ""),
    });
    if (!result.ok) return result;
    userId = result.userId;
    revalidatePath("/dashboard/gestion");
    revalidatePath("/dashboard/gestion/accesos");
  } catch (error) {
    return failure("createPersonAction", error);
  }
  if (!formData.get("invite")) {
    return { ok: true, message: "Persona agregada. Todavía no recibió su invitación: envíasela desde su fila cuando quieras." };
  }
  const notSent = "Persona agregada, pero no se pudo enviar el correo de invitación. Búscala en la lista y usa «Enviar invitación» en unos minutos.";
  try {
    const invitation = await sendInvitations(guard.actor, [userId]);
    return { ok: true, message: invitation.sent === 1 ? "Persona agregada. Le enviamos la invitación a su correo." : notSent };
  } catch (error) {
    console.error("createPersonAction: invitación no enviada", { correlationId: crypto.randomUUID(), error });
    return { ok: true, message: notSent };
  }
}
