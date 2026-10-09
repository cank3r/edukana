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
 * `INDEPENDENT_SIGNUP_ENABLED`: "true"/"1" lo activa y "false"/"0" lo apaga. Sin valor, queda
 * activo en desarrollo, pruebas y vistas previas, y apagado en producción.
 */
export function isIndependentSignupEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const value = env.INDEPENDENT_SIGNUP_ENABLED?.trim().toLowerCase();
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  if (env.VERCEL_ENV) return env.VERCEL_ENV !== "production";
  return env.NODE_ENV !== "production";
}
