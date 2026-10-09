"use server";

import { revalidatePath } from "next/cache";
import { resendAdminInvitation } from "@/server/platform/operator";
import { getOperatorEmail } from "@/server/platform/operator-session";

export type OperatorActionState = { ok: boolean; message: string };

/** Reenvía la invitación al administrador de una institución. Campos: `institutionId`, `adminUserId`. */
export async function resendAdminInvitationAction(_state: OperatorActionState, formData: FormData): Promise<OperatorActionState> {
  const email = await getOperatorEmail();
  if (!email) return { ok: false, message: "No tienes permiso para hacer esto." };
  const institutionId = String(formData.get("institutionId") ?? "");
  try {
    const result = await resendAdminInvitation(email, institutionId, String(formData.get("adminUserId") ?? ""));
    if (result.ok) revalidatePath(`/operador/${institutionId}`);
    return result;
  } catch (error) {
    const correlationId = crypto.randomUUID();
    console.error("resendAdminInvitationAction failed", { correlationId, error });
    return { ok: false, message: `No se pudo reenviar la invitación. Intenta de nuevo. Código: ${correlationId}` };
  }
}
