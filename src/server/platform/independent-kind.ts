import { db } from "@/lib/db";

/**
 * Marca de «docente independiente»: una institución con `settings.kind = "INDEPENDENT"`.
 * Módulo liviano (solo la base) para que cursos, menú y configuración lo consulten sin cargar el alta.
 */

export const INDEPENDENT_KIND = "INDEPENDENT";

/** true si los ajustes de la institución la marcan como espacio de docente independiente. */
export function isIndependentSettings(settings: unknown): boolean {
  return Boolean(settings && typeof settings === "object" && !Array.isArray(settings) && (settings as Record<string, unknown>).kind === INDEPENDENT_KIND);
}

/** Lee la marca de la institución de quien está en sesión. Nunca recibe un id desde el navegador. */
export async function isIndependentInstitution(institutionId: string): Promise<boolean> {
  if (!institutionId) return false;
  const institution = await db.institution.findUnique({ where: { id: institutionId }, select: { settings: true } });
  return isIndependentSettings(institution?.settings);
}

/**
 * `INDEPENDENT_SIGNUP_ENABLED`: "false"/"0" lo apaga. Sin valor (o "true"/"1") queda activo en
 * todos los entornos, también en producción.
 */
export function isIndependentSignupEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const value = env.INDEPENDENT_SIGNUP_ENABLED?.trim().toLowerCase();
  if (value === "false" || value === "0") return false;
  return true;
}
