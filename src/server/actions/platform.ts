"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createInstitution, isPlatformOperator } from "@/server/platform/institutions";

export type PlatformActionState = { ok: boolean; message: string };

/** Correo de la cuenta en sesión, leído de la base y no del token. */
async function sessionEmail() {
  const identityId = (await auth())?.user?.identityId;
  if (!identityId) return null;
  return (await db.identity.findUnique({ where: { id: identityId }, select: { email: true } }))?.email ?? null;
}

/** Para decidir si se muestra la pantalla de operador. */
export async function amIPlatformOperator() {
  return isPlatformOperator(await sessionEmail());
}

/** Alta de institución por el operador. Campos: `name`, `slug`, `type`, `adminName`, `adminEmail`. */
export async function createInstitutionAction(_state: PlatformActionState, formData: FormData): Promise<PlatformActionState> {
  const email = await sessionEmail();
  if (!email || !isPlatformOperator(email)) return { ok: false, message: "No tienes permiso para crear instituciones." };
  try {
    const field = (name: string) => String(formData.get(name) ?? "");
    const result = await createInstitution(email, {
      name: field("name"),
      slug: field("slug"),
      type: (field("type") || undefined) as never,
      adminName: field("adminName"),
      adminEmail: field("adminEmail"),
    });
    if (!result.ok) return result;
    return {
      ok: true,
      message: result.invited
        ? "Institución creada. El administrador recibió su invitación por correo."
        : "Institución creada, pero el correo de invitación falló. El administrador puede pedir su enlace en «Olvidé mi contraseña».",
    };
  } catch (error) {
    const correlationId = crypto.randomUUID();
    console.error("createInstitutionAction failed", { correlationId, error });
    return { ok: false, message: `No se pudo crear la institución. Intenta de nuevo. Código: ${correlationId}` };
  }
}
