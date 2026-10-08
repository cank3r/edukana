import { cache } from "react";
import NextAuth, { type Session } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { loginSchema } from "@/lib/validation";
import { resolveLiveIdentity } from "@/server/session";

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
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const matches = await db.user.findMany({
          where: { email: parsed.data.email, status: "ACTIVE" },
          include: { institution: { select: { slug: true } } },
          take: 2,
        });
        if (matches.length !== 1 || !matches[0].password) return null;

        const user = matches[0];
        const passwordHash = user.password;
        if (!passwordHash || !(await bcrypt.compare(parsed.data.password, passwordHash))) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          institutionId: user.institutionId,
          institutionSlug: user.institution.slug,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.institutionId = user.institutionId;
        token.institutionSlug = user.institutionSlug;
        token.sv = user.sessionVersion;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub ?? "";
      if (typeof token.role === "string") session.user.role = token.role as typeof session.user.role;
      if (typeof token.institutionId === "string") session.user.institutionId = token.institutionId;
      if (typeof token.institutionSlug === "string") session.user.institutionSlug = token.institutionSlug;
      session.user.sessionVersion = typeof token.sv === "number" ? token.sv : 0;
      return session;
    },
  },
});

export const { handlers, signIn, signOut } = nextAuth;

/**
 * Lectura del token sin consultar la base. Solo para `src/proxy.ts`, que decide
 * redirecciones de navegación anónima y no autoriza nada.
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
    sessionVersion: session.user.sessionVersion,
  });
  if (!identity) return null;
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
