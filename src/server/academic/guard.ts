import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import type { Capability } from "@/lib/capabilities";
import type { AcademicActor } from "./programs";

export type AcademicActionState = { ok: boolean; message: string; id?: string };
export type AcademicGuard = { actor: AcademicActor; error: null } | { actor: null; error: string };

/** Autentica y comprueba el permiso en el servidor. La institución sale siempre de la sesión. */
export async function requireAcademicActor(capability: Capability): Promise<AcademicGuard> {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) return { actor: null, error: "Tu sesión terminó. Vuelve a iniciar sesión." };
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!capabilities.has(capability)) return { actor: null, error: "No tienes permiso para hacer este cambio." };
  return { actor: { id: user.id, institutionId: user.institutionId, role: user.role }, error: null };
}

export function actionFailure(name: string, error: unknown): AcademicActionState {
  const correlationId = crypto.randomUUID();
  console.error(`${name} failed`, { correlationId, error });
  return { ok: false, message: `No se pudo completar. Intenta de nuevo. Código: ${correlationId}` };
}

export const formText = (formData: FormData, key: string) => String(formData.get(key) ?? "");
