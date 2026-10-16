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

export type CredentialRejectionReason =
  | "invalid_input"
  | "too_many_attempts"
  | "unknown_account"
  | "account_suspended"
  | "missing_password"
  | "password_mismatch"
  | "no_active_institution"
  | "institution_suspended";

/**
 * Deja en el log por qué se rechazó un inicio de sesión, sin datos de la persona.
 * La respuesta al navegador sigue siendo la misma para todos los motivos.
 */
export function rejectCredentials(reason: CredentialRejectionReason, context: { institutionCount?: number } = {}) {
  console.warn("[auth][credentials-rejected]", {
    reason,
    deploymentSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "local",
    ...context,
  });
  return null;
}

/**
 * Valida correo y contraseña contra la identidad global. Devuelve null, sin distinguir el motivo,
 * por bloqueo de intentos, cuenta inexistente o suspendida, contraseña incorrecta o falta de
 * instituciones activas. Con varias instituciones entra a la indicada o, si no se indica, a la más antigua.
 */
type LoginInput = {
  email: string;
  password: string;
  ip: string;
  institutionSlug?: string | null;
};
export type CredentialOutcome = { user: LoginResult | null; suspendedInstitutionName?: string };

export async function authenticateCredentials(input: LoginInput): Promise<LoginResult | null> {
  return (await authenticateCredentialsWithStatus(input)).user;
}

/** Suspension is disclosed only after a valid password, active identity and own membership. */
export async function authenticateCredentialsWithStatus(input: {
  email: string;
  password: string;
  ip: string;
  institutionSlug?: string | null;
}): Promise<CredentialOutcome> {
  const email = normalizeEmail(input.email);
  const attempt = { email, ip: input.ip };
  if (!(await isAttemptAllowed(attempt))) return { user: rejectCredentials("too_many_attempts") };

  const identity = await db.identity.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, sessionVersion: true, status: true },
  });
  const passwordMatches = await bcrypt.compare(input.password, identity?.passwordHash ?? fallbackHash());
  const memberships = identity && identity.status === "ACTIVE" && identity.passwordHash && passwordMatches
    ? await listActiveMemberships(identity.id, true)
    : [];
  const wanted = input.institutionSlug?.trim().toLowerCase();
  const activeMemberships = memberships.filter((item) => item.institution.status === "ACTIVE");
  const membership = wanted ? activeMemberships.find((item) => item.institution.slug === wanted) : activeMemberships[0];

  if (!identity || !membership) {
    const suspended = wanted ? memberships.find((item) => item.institution.slug === wanted) : memberships[0];
    // A correct password for a paused institution must not lock access to another membership.
    await recordAttempt(attempt, suspended?.institution.status === "SUSPENDED");
    if (!identity) return { user: rejectCredentials("unknown_account") };
    if (identity.status !== "ACTIVE") return { user: rejectCredentials("account_suspended") };
    if (!identity.passwordHash) return { user: rejectCredentials("missing_password") };
    if (!passwordMatches) return { user: rejectCredentials("password_mismatch") };
    if (suspended?.institution.status === "SUSPENDED") {
      return {
        user: rejectCredentials("institution_suspended", { institutionCount: activeMemberships.length }),
        suspendedInstitutionName: suspended.institution.name,
      };
    }
    return { user: rejectCredentials("no_active_institution", { institutionCount: activeMemberships.length }) };
  }
  await recordAttempt(attempt, true);
  await db.auditLog.create({
    data: {
      institutionId: membership.institutionId, userId: membership.id,
      action: "LOGIN_SUCCEEDED", entity: "User", entityId: membership.id, changes: {},
    },
  });
  return { user: {
    id: membership.id,
    identityId: identity.id,
    email,
    name: membership.name,
    role: membership.role,
    institutionId: membership.institutionId,
    institutionSlug: membership.institution.slug,
    sessionVersion: identity.sessionVersion,
    institutionCount: activeMemberships.length,
  } };
}
