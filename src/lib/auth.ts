import { headers } from "next/headers";
import { cache } from "react";
import { getRequestInstitution, resolveInstitutionHost } from "@/server/platform/domains";
import { institutionMatchesHost, requestOrigin } from "@/server/platform/domain-policy";
import NextAuth, { CredentialsSignin, type Session } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { loginSchema } from "@/lib/validation";
import { findOwnMembership } from "@/server/identity";
import { authenticateCredentialsWithStatus, rejectCredentials } from "@/server/login";
import { clientIpFromHeaders } from "@/server/security/login-throttle";
import { resolveLiveIdentity } from "@/server/session";

import { SUSPENDED_CREDENTIAL_CODE } from "@/server/platform/suspension-policy";

class InstitutionSuspendedSignIn extends CredentialsSignin {
  constructor(name: string) {
    super();
    this.code = `${SUSPENDED_CREDENTIAL_CODE}${encodeURIComponent(name)}`;
  }
}

const SESSION_MAX_AGE_SECONDS = Number(process.env.SESSION_MAX_AGE_DAYS ?? 7) * 24 * 60 * 60;

const nextAuth = NextAuth({
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "Credenciales",
      credentials: {
        email: { label: "Correo", type: "email" },
        password: { label: "Contraseña", type: "password" },
        institutionSlug: { label: "Institución", type: "text" },
      },
      async authorize(credentials, request) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return rejectCredentials("invalid_input");
        const hostInstitution = await resolveInstitutionHost(request.headers.get("host"), { fresh: true });
        const slug = hostInstitution?.slug ??
          (typeof credentials?.institutionSlug === "string" ? credentials.institutionSlug : null);
        const outcome = await authenticateCredentialsWithStatus({
          email: parsed.data.email,
          password: parsed.data.password,
          ip: clientIpFromHeaders(request?.headers),
          institutionSlug: slug,
        });
        if (outcome.suspendedInstitutionName) throw new InstitutionSuspendedSignIn(outcome.suspendedInstitutionName);
        return outcome.user;
      },
    }),
  ],
  callbacks: {
    async redirect({ url, baseUrl }) {
      const requestHeaders = await headers();
      // Keep host-only cookies on the actual valid alias, even when AUTH_URL points to the central host.
      const origin = requestOrigin(requestHeaders.get("host"), new URL(baseUrl).protocol);
      if (!origin) throw new Error("Invalid request host");
      try {
        const target = new URL(url, origin);
        return target.origin === origin ? target.href : origin;
      } catch { return origin; }
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.role = user.role;
        token.institutionId = user.institutionId;
        token.institutionSlug = user.institutionSlug;
        token.sv = user.sessionVersion;
        token.idn = user.identityId;
        token.institutionCount = user.institutionCount;
      }
      // Cambio de institución: solo hacia una membresía activa de la misma identidad.
      const target = (session as { activeUserId?: unknown } | undefined)?.activeUserId;
      if (trigger === "update" && typeof target === "string" && typeof token.idn === "string") {
        const membership = await findOwnMembership(token.idn, target);
        const hostInstitution = await getRequestInstitution();
        if (membership && institutionMatchesHost(membership.institutionId, hostInstitution)) {
          token.sub = membership.id;
          token.name = membership.name;
          token.role = membership.role;
          token.institutionId = membership.institutionId;
          token.institutionSlug = membership.institution.slug;
        }
      }
      // Also covers /api/auth/session and JWT updates, which do not call the live auth() guard.
      const hostInstitution = await getRequestInstitution();
      if (hostInstitution && token.institutionId !== hostInstitution.id) return null;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub ?? "";
      if (typeof token.role === "string") session.user.role = token.role as typeof session.user.role;
      if (typeof token.institutionId === "string") session.user.institutionId = token.institutionId;
      if (typeof token.institutionSlug === "string") session.user.institutionSlug = token.institutionSlug;
      session.user.sessionVersion = typeof token.sv === "number" ? token.sv : 0;
      session.user.identityId = typeof token.idn === "string" ? token.idn : null;
      session.user.institutionCount = typeof token.institutionCount === "number" ? token.institutionCount : 1;
      return session;
    },
  },
});

export const { handlers, signIn, signOut } = nextAuth;

/** Reemite el token. Solo lo usa el cambio de institución (`src/server/actions/institutions.ts`). */
export const updateSession = nextAuth.unstable_update;

/**
 * Lectura del token con aislamiento de host. Solo para `src/proxy.ts`: no sustituye
 * la membresía viva ni autoriza recursos, acciones o APIs.
 */
export const authFromToken = nextAuth.auth;

/**
 * Sesión vigente. Además de validar el token, relee la cuenta en la base una vez por
 * petición: una cuenta suspendida, eliminada o con sesiones invalidadas deja de tener
 * sesión en su siguiente petición, y rol e institución reflejan el estado actual.
 */
export const auth = cache(async (): Promise<Session | null> => {
  const session = await nextAuth.auth();
  if (!session?.user?.id) return null;
  const identity = await resolveLiveIdentity({
    userId: session.user.id,
    identityId: session.user.identityId,
    sessionVersion: session.user.sessionVersion,
  });
  if (!identity) return null;
  const hostInstitution = await getRequestInstitution();
  if (!institutionMatchesHost(identity.institutionId, hostInstitution)) return null;
  return {
    ...session,
    user: {
      ...session.user,
      role: identity.role,
      institutionId: identity.institutionId,
      institutionSlug: identity.institutionSlug,
      sessionVersion: identity.sessionVersion,
    },
  };
});
