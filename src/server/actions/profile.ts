"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { changeOwnPassword, updateOwnProfile } from "@/server/people/self";
import { clientIpFromHeaders } from "@/server/security/login-throttle";

export type ProfileActionState = { ok: boolean; message: string };

const SESSION_ENDED: ProfileActionState = { ok: false, message: "Tu sesión terminó. Vuelve a iniciar sesión." };

/** Cualquier persona con sesión puede cambiar lo suyo: no hace falta ningún permiso adicional. */
async function requireSelf() {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) return null;
  return { id: user.id, institutionId: user.institutionId };
}

function failure(name: string, error: unknown): ProfileActionState {
  const correlationId = crypto.randomUUID();
  console.error(`${name} failed`, { correlationId, error });
  return { ok: false, message: `No se pudo completar. Intenta de nuevo. Código: ${correlationId}` };
}

/** Guarda el nombre y el teléfono propios. Campos: `name`, `phone`. */
export async function updateOwnProfileAction(_state: ProfileActionState, formData: FormData): Promise<ProfileActionState> {
  const actor = await requireSelf();
  if (!actor) return SESSION_ENDED;
  try {
    const result = await updateOwnProfile(actor, {
      name: String(formData.get("name") ?? ""),
      phone: String(formData.get("phone") ?? ""),
    });
    if (!result.ok) return result;
    revalidatePath("/dashboard/perfil");
    return { ok: true, message: "Datos guardados." };
  } catch (error) {
    return failure("updateOwnProfileAction", error);
  }
}

/**
 * Cambia la contraseña propia. Campos: `currentPassword`, `newPassword`, `repeatPassword`.
 * Al terminar bien, todas las sesiones de la persona (también esta) dejan de valer:
 * la pantalla debe llevarla a iniciar sesión de nuevo.
 */
export async function changeOwnPasswordAction(_state: ProfileActionState, formData: FormData): Promise<ProfileActionState> {
  const actor = await requireSelf();
  if (!actor) return SESSION_ENDED;
  const newPassword = String(formData.get("newPassword") ?? "");
  if (newPassword !== String(formData.get("repeatPassword") ?? "")) {
    return { ok: false, message: "Las dos contraseñas nuevas no son iguales. Escríbelas otra vez." };
  }
  try {
    const result = await changeOwnPassword(actor, {
      currentPassword: String(formData.get("currentPassword") ?? ""),
      newPassword,
      ip: clientIpFromHeaders(await headers()),
    });
    if (!result.ok) return result;
    return { ok: true, message: "Contraseña cambiada. Vuelve a entrar con la nueva." };
  } catch (error) {
    return failure("changeOwnPasswordAction", error);
  }
}
