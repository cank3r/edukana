import { db } from "@/lib/db";
import type { EdukanaRole } from "@/types/next-auth";

export type SessionClaims = { userId: string; identityId?: string | null; sessionVersion?: number | null };

export type LiveIdentity = {
  /** Membresía activa (`User`). */
  id: string;
  identityId: string | null;
  role: EdukanaRole;
  institutionId: string;
  institutionSlug: string;
  sessionVersion: number;
};

/**
 * Convierte lo que afirma el token en la identidad vigente según la base de datos.
 * Devuelve null si la membresía o la identidad no existen o no están activas, si el token es
 * anterior a la última invalidación, o si la membresía no pertenece a la identidad del token.
 * Rol e institución salen de la base, nunca del token.
 *
 * Suspender una membresía corta el acceso a esa institución; suspender la identidad, a todas.
 * Un token sin versión (anterior a S1) se trata como versión 0.
 */
export async function resolveLiveIdentity(claims: SessionClaims): Promise<LiveIdentity | null> {
  return (await resolveSessionAccess(claims))?.identity ?? null;
}

/** A rejected but otherwise valid session can explain a paused institution on the login page. */
export async function resolveSessionAccess(claims: SessionClaims): Promise<{
  identity: LiveIdentity | null; suspendedInstitutionName?: string;
} | null> {
  if (!claims.userId) return null;
  const user = await db.user.findUnique({
    where: { id: claims.userId },
    select: {
      id: true,
      role: true,
      status: true,
      institutionId: true,
      sessionVersion: true,
      institution: { select: { slug: true, status: true, name: true } },
      identity: { select: { id: true, status: true, sessionVersion: true } },
    },
  });
  if (!user || user.status !== "ACTIVE") return null;
  const claimed = claims.sessionVersion ?? 0;
  if (user.identity) {
    if (user.identity.status !== "ACTIVE" || user.identity.sessionVersion !== claimed) return null;
    if (claims.identityId && claims.identityId !== user.identity.id) return null;
  } else if (user.sessionVersion !== claimed) {
    // Cuenta sin identidad: solo puede ocurrir entre el despliegue y la migración s2_identity.
    return null;
  }
  if (user.institution.status === "SUSPENDED") {
    return { identity: null, suspendedInstitutionName: user.institution.name };
  }
  return { identity: {
    id: user.id,
    identityId: user.identity?.id ?? null,
    role: user.role,
    institutionId: user.institutionId,
    institutionSlug: user.institution.slug,
    sessionVersion: user.identity?.sessionVersion ?? user.sessionVersion,
  } };
}

/**
 * Cierra todas las sesiones de la persona detrás de una membresía, en todas sus instituciones.
 * Es lo que corresponde al cambiar la contraseña. Para quitar el acceso a una sola institución
 * basta cambiar el estado de la membresía; no hace falta invalidar.
 * Devuelve false si la membresía no pertenece a la institución indicada.
 */
export async function invalidateUserSessions(
  client: Pick<typeof db, "user" | "identity">,
  scope: { userId: string; institutionId: string },
) {
  const user = await client.user.findFirst({
    where: { id: scope.userId, institutionId: scope.institutionId },
    select: { id: true, identityId: true },
  });
  if (!user) return false;
  if (user.identityId) {
    await client.identity.update({ where: { id: user.identityId }, data: { sessionVersion: { increment: 1 } } });
  } else {
    await client.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } });
  }
  return true;
}
