"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { convertLead, createLead, deleteLead, moveLeadStage, updateLead, type AdmissionActor, type ConvertResult } from "@/server/admissions/leads";
import { sendInvitations } from "@/server/people/invitations";

export type AdmissionActionState = { ok: boolean; message: string; id?: string; code?: "PERSON_EXISTS" };

type Guard = { actor: AdmissionActor; error: null } | { actor: null; error: string };

/** Solo autentica: la institución sale de la sesión y cada función de `leads.ts` comprueba el permiso. */
async function requireActor(): Promise<Guard> {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) return { actor: null, error: "Tu sesión terminó. Vuelve a iniciar sesión." };
  return { actor: { id: user.id, institutionId: user.institutionId, role: user.role }, error: null };
}

function failure(name: string, error: unknown): AdmissionActionState {
  const correlationId = crypto.randomUUID();
  console.error(`${name} failed`, { correlationId, error });
  return { ok: false, message: `No se pudo completar. Intenta de nuevo. Código: ${correlationId}` };
}

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "");

const leadInput = (formData: FormData) => ({
  name: text(formData, "name"),
  email: text(formData, "email"),
  phone: text(formData, "phone"),
  programInterest: text(formData, "programInterest"),
  source: text(formData, "source"),
  notes: text(formData, "notes"),
});

function refresh(leadId?: string) {
  revalidatePath("/dashboard/admisiones");
  if (leadId) revalidatePath(`/dashboard/admisiones/${leadId}`);
}

/** Registra una solicitud. Campos: `name`, `email`, `phone`, `programInterest`, `source`, `notes`. Devuelve `id`. */
export async function createLeadAction(_state: AdmissionActionState, formData: FormData): Promise<AdmissionActionState> {
  const guard = await requireActor();
  if (guard.error !== null) return { ok: false, message: guard.error };
  try {
    const result = await createLead(guard.actor, leadInput(formData));
    if (!result.ok) return result;
    refresh();
    return { ok: true, message: "Solicitud registrada.", id: result.leadId };
  } catch (error) {
    return failure("createLeadAction", error);
  }
}

/** Corrige los datos. Campos: `leadId` y los mismos de crear. */
export async function updateLeadAction(_state: AdmissionActionState, formData: FormData): Promise<AdmissionActionState> {
  const guard = await requireActor();
  if (guard.error !== null) return { ok: false, message: guard.error };
  const leadId = text(formData, "leadId");
  try {
    const result = await updateLead(guard.actor, leadId, leadInput(formData));
    if (!result.ok) return result;
    refresh(leadId);
    return { ok: true, message: "Datos guardados." };
  } catch (error) {
    return failure("updateLeadAction", error);
  }
}

/** Cambia la etapa. Campos: `leadId`, `stage` y `reason` (obligatorio para «No continúa»). */
export async function moveLeadAction(_state: AdmissionActionState, formData: FormData): Promise<AdmissionActionState> {
  const guard = await requireActor();
  if (guard.error !== null) return { ok: false, message: guard.error };
  const leadId = text(formData, "leadId");
  try {
    const result = await moveLeadStage(guard.actor, leadId, text(formData, "stage"), text(formData, "reason"));
    if (!result.ok) return result;
    refresh(leadId);
    return { ok: true, message: "Etapa actualizada." };
  } catch (error) {
    return failure("moveLeadAction", error);
  }
}

/** Borra la solicitud. Campo: `leadId`. */
export async function deleteLeadAction(_state: AdmissionActionState, formData: FormData): Promise<AdmissionActionState> {
  const guard = await requireActor();
  if (guard.error !== null) return { ok: false, message: guard.error };
  try {
    const result = await deleteLead(guard.actor, text(formData, "leadId"));
    if (!result.ok) return result;
    refresh();
    return { ok: true, message: "Solicitud borrada." };
  } catch (error) {
    return failure("deleteLeadAction", error);
  }
}

/**
 * Convierte la solicitud en estudiante. Campos: `leadId`, `groupId` (opcional), `invite` (casilla)
 * y `link` (viene cuando la persona ya existía y se confirmó vincularla).
 */
export async function convertLeadAction(_state: AdmissionActionState, formData: FormData): Promise<AdmissionActionState> {
  const guard = await requireActor();
  if (guard.error !== null) return { ok: false, message: guard.error };
  const leadId = text(formData, "leadId");
  let result: Extract<ConvertResult, { ok: true }>;
  try {
    const outcome = await convertLead(guard.actor, { leadId, groupId: text(formData, "groupId"), linkExisting: Boolean(formData.get("link")) });
    if (!outcome.ok) return outcome;
    result = outcome;
    refresh(leadId);
    revalidatePath("/dashboard/gestion");
    revalidatePath("/dashboard/gestion/grupos");
  } catch (error) {
    return failure("convertLeadAction", error);
  }
  if (result.alreadyConverted) return { ok: true, message: "Esta solicitud ya estaba convertida en estudiante. No se cambió nada.", id: result.userId };

  const parts = [result.created ? "Listo: ya es estudiante de la institución." : "Listo: la solicitud quedó vinculada con la persona que ya existía."];
  if (result.addedToGroup) parts.push("Quedó en el grupo elegido.");
  if (result.groupNote) parts.push(result.groupNote);
  if (!formData.get("invite")) {
    if (result.created) parts.push("Todavía no recibió su invitación: envíasela desde Personas cuando quieras.");
    return { ok: true, message: parts.join(" "), id: result.userId };
  }
  const notSent = "No se pudo enviar el correo de invitación. Búscala en Personas y usa «Enviar invitación» en unos minutos.";
  try {
    const invitation = await sendInvitations(guard.actor, [result.userId]);
    parts.push(invitation.sent === 1 ? "Le enviamos la invitación a su correo." : notSent);
  } catch (error) {
    console.error("convertLeadAction: invitación no enviada", { correlationId: crypto.randomUUID(), error });
    parts.push(notSent);
  }
  return { ok: true, message: parts.join(" "), id: result.userId };
}
