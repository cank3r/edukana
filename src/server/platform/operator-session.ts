import "server-only";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isPlatformOperator } from "./institutions";

/**
 * Correo de la cuenta en sesión si es operador de la plataforma; null en cualquier otro caso.
 * El correo se lee de la base y no del token.
 */
export async function getOperatorEmail(): Promise<string | null> {
  const identityId = (await auth())?.user?.identityId;
  if (!identityId) return null;
  const email = (await db.identity.findUnique({ where: { id: identityId }, select: { email: true } }))?.email ?? null;
  return isPlatformOperator(email) ? email : null;
}
