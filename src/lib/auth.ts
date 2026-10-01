import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { loginSchema } from "@/lib/validation";

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
