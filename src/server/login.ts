import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { listActiveMemberships, normalizeEmail } from "@/server/identity";
import { isAttemptAllowed, recordAttempt } from "@/server/security/login-throttle";
import type { EdukanaRole } from "@/types/next-auth";

export type LoginResult = {
  /** Membresía activa: el `User` con el que trabaja todo el resto de la aplicación. */
  id: string;
  identityId: string;
  email: string;
  name: string;
  role: EdukanaRole;
  institutionId: string;
  institutionSlug: string;
  sessionVersion: number;
  /** Cuántas instituciones puede elegir esta persona. */
  institutionCount: number;
};

let dummyHash: string | null = null;
/** Se compara contra un hash fijo cuando la cuenta no existe, para que la respuesta tarde lo mismo. */
function fallbackHash() {
  dummyHash ??= bcrypt.hashSync("edukana-cuenta-inexistente", 12);
  return dummyHash;
}

/**
 * Valida correo y contraseña contra la identidad global. Devuelve null, sin distinguir el motivo,
 * por bloqueo de intentos, cuenta inexistente o suspendida, contraseña incorrecta o falta de
 * instituciones activas. Con varias instituciones entra a la indicada o, si no se indica, a la más antigua.
 */
export async function authenticateCredentials(input: {
  email: string;
  password: string;
  ip: string;
  institutionSlug?: string | null;
}): Promise<LoginResult | null> {
  const email = normalizeEmail(input.email);
  const attempt = { email, ip: input.ip };
  if (!(await isAttemptAllowed(attempt))) return null;

  const identity = await db.identity.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, sessionVersion: true, status: true },
  });
  const passwordMatches = await bcrypt.compare(input.password, identity?.passwordHash ?? fallbackHash());
  const memberships = identity && identity.status === "ACTIVE" && identity.passwordHash && passwordMatches
    ? await listActiveMemberships(identity.id)
    : [];
  const wanted = input.institutionSlug?.trim().toLowerCase();
  const membership = wanted ? memberships.find((item) => item.institution.slug === wanted) : memberships[0];

  if (!identity || !membership) {
    await recordAttempt(attempt, false);
    return null;
  }
  await recordAttempt(attempt, true);
  return {
    id: membership.id,
    identityId: identity.id,
    email,
    name: membership.name,
    role: membership.role,
    institutionId: membership.institutionId,
    institutionSlug: membership.institution.slug,
    sessionVersion: identity.sessionVersion,
    institutionCount: memberships.length,
  };
}
