import { db } from "@/lib/db";
import type { EdukanaRole } from "@/types/next-auth";

export type SessionClaims = { userId: string; sessionVersion?: number | null };

export type LiveIdentity = {
  id: string;
  role: EdukanaRole;
  institutionId: string;
  institutionSlug: string;
  sessionVersion: number;
};

/**
 * Convierte lo que afirma el token en la identidad vigente según la base de datos.
 * Devuelve null si la cuenta no existe, no está activa o el token es anterior a la
 * última invalidación. Rol e institución salen de la base, nunca del token.
 *
 * Los tokens emitidos antes de S1 no llevan versión: se tratan como versión 0, que es
 * el valor inicial de la columna, para no cerrar las sesiones existentes al desplegar.
 */
export async function resolveLiveIdentity(claims: SessionClaims): Promise<LiveIdentity | null> {
  if (!claims.userId) return null;
  const user = await db.user.findUnique({
    where: { id: claims.userId },
    select: {
      id: true,
      role: true,
      status: true,
      institutionId: true,
      sessionVersion: true,
      institution: { select: { slug: true } },
    },
  });
  if (!user || user.status !== "ACTIVE") return null;
  if (user.sessionVersion !== (claims.sessionVersion ?? 0)) return null;
  return {
    id: user.id,
    role: user.role,
    institutionId: user.institutionId,
    institutionSlug: user.institution.slug,
    sessionVersion: user.sessionVersion,
  };
}

/**
 * Invalida todas las sesiones abiertas de una cuenta. Debe llamarse dentro de la misma
 * transacción que suspende la cuenta, cambia su rol o cambia su contraseña.
 */
export async function invalidateUserSessions(
  client: Pick<typeof db, "user">,
  scope: { userId: string; institutionId: string },
) {
  const result = await client.user.updateMany({
    where: { id: scope.userId, institutionId: scope.institutionId },
    data: { sessionVersion: { increment: 1 } },
  });
  return result.count === 1;
}
