import { db } from "@/lib/db";
import type { PersonRow } from "@/server/imports/people";

export type ImportPlan = { toCreate: PersonRow[]; existing: PersonRow[] };
export type ImportResult = { created: number; alreadyExisted: number };

const CHUNK = 500;

/** Separa las filas nuevas de las que ya existen en la institución. No escribe nada. */
export async function planPeopleImport(institutionId: string, rows: PersonRow[]): Promise<ImportPlan> {
  const existingEmails = new Set<string>();
  for (let i = 0; i < rows.length; i += CHUNK) {
    const emails = rows.slice(i, i + CHUNK).map((row) => row.email);
    const found = await db.user.findMany({ where: { institutionId, email: { in: emails } }, select: { email: true } });
    for (const user of found) existingEmails.add(user.email);
  }
  return {
    toCreate: rows.filter((row) => !existingEmails.has(row.email)),
    existing: rows.filter((row) => existingEmails.has(row.email)),
  };
}

/**
 * Crea las cuentas que faltan. Es idempotente: repetir el mismo archivo, o reintentar tras un
 * fallo a mitad de camino, no duplica ni modifica cuentas existentes.
 *
 * Las cuentas nacen sin contraseña. Cada persona la define con el enlace de
 * "Olvidé mi contraseña", que ya comprueba que controla ese correo.
 */
export async function applyPeopleImport(
  actor: { id: string; institutionId: string },
  rows: PersonRow[],
): Promise<ImportResult> {
  let created = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const result = await db.user.createMany({
      data: chunk.map((row) => ({
        institutionId: actor.institutionId,
        name: row.name,
        email: row.email,
        role: row.role,
        phone: row.phone,
        status: "ACTIVE" as const,
      })),
      skipDuplicates: true,
    });
    created += result.count;
  }
  await db.auditLog.create({
    data: {
      institutionId: actor.institutionId,
      userId: actor.id,
      action: "PEOPLE_IMPORTED",
      entity: "User",
      changes: { received: rows.length, created, alreadyExisted: rows.length - created },
    },
  });
  return { created, alreadyExisted: rows.length - created };
}
