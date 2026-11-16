import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

type Client = Prisma.TransactionClient | typeof db;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/**
 * Devuelve la identidad de ese correo, creándola si no existe.
 * Si ya existía, nunca se le cambia la contraseña: quien da de alta a una persona en una
 * institución no puede fijar la contraseña que ella usa en otra.
 */
export async function ensureIdentity(client: Client, input: { email: string; passwordHash?: string | null }) {
  const email = normalizeEmail(input.email);
  const identity = await client.identity.upsert({
    where: { email },
    create: { email, passwordHash: input.passwordHash ?? null },
    update: {},
    select: { id: true },
  });
  return identity.id;
}

const membershipSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  institutionId: true,
  institution: { select: { slug: true, name: true, status: true } },
} satisfies Prisma.UserSelect;

export type Membership = Prisma.UserGetPayload<{ select: typeof membershipSelect }>;

/** Instituciones a las que una identidad puede entrar ahora mismo, la más antigua primero. */
export function listActiveMemberships(identityId: string, includeSuspendedInstitutions = false): Promise<Membership[]> {
  return db.user.findMany({
    where: { identityId, status: "ACTIVE", ...(!includeSuspendedInstitutions ? { institution: { status: "ACTIVE" as const } } : {}) },
    select: membershipSelect,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

/** La membresía destino solo si pertenece a esa identidad y está activa; si no, null. */
export async function findOwnMembership(identityId: string, userId: string): Promise<Membership | null> {
  if (!identityId || !userId) return null;
  return db.user.findFirst({ where: { id: userId, identityId, status: "ACTIVE", institution: { status: "ACTIVE" } }, select: membershipSelect });
}
