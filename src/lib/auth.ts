import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { loginSchema } from "@/lib/validation";

type CredentialRejectionReason =
  | "invalid_input"
  | "active_user_match_count"
  | "missing_password"
  | "password_mismatch";

type CredentialRejectionContext = {
  matchCount?: number;
  institutionSlug?: string;
  role?: string;
  updatedAt?: string;
};

function rejectCredentials(reason: CredentialRejectionReason, context: CredentialRejectionContext = {}) {
  console.warn("[auth][credentials-rejected]", {
    reason,
    deploymentSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "local",
    ...context,
  });
  return null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt" },
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
        if (!parsed.success) return rejectCredentials("invalid_input");

        const matches = await db.user.findMany({
          where: { email: parsed.data.email, status: "ACTIVE" },
          include: { institution: { select: { slug: true } } },
          take: 2,
        });
        if (matches.length !== 1) {
          return rejectCredentials("active_user_match_count", { matchCount: matches.length });
        }

        const user = matches[0];
        const diagnosticContext = {
          institutionSlug: user.institution.slug,
          role: user.role,
          updatedAt: user.updatedAt.toISOString(),
        };
        if (!user.password) return rejectCredentials("missing_password", diagnosticContext);
        if (!(await bcrypt.compare(parsed.data.password, user.password))) {
          return rejectCredentials("password_mismatch", diagnosticContext);
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          institutionId: user.institutionId,
          institutionSlug: user.institution.slug,
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
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub ?? "";
      if (typeof token.role === "string") session.user.role = token.role as typeof session.user.role;
      if (typeof token.institutionId === "string") session.user.institutionId = token.institutionId;
      if (typeof token.institutionSlug === "string") session.user.institutionSlug = token.institutionSlug;
      return session;
    },
  },
});
