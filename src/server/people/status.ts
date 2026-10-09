import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { EdukanaRole } from "@/types/next-auth";

export type StatusResult = { ok: true; changed: boolean } | { ok: false; message: string };

type Actor = { id: string; institutionId: string; role: EdukanaRole };

const ADMIN_ROLES: readonly EdukanaRole[] = ["ADMIN", "SUPER_ADMIN"];

/**
 * Suspende o reactiva a una persona en la institución de quien actúa.
 *
 * Solo cambia esta institución: si la persona pertenece a otra, allí conserva su acceso.
 * La suspensión corta la sesión abierta en la siguiente petición, sin esperar a que venza.
 * Nada se borra: cursos, notas y entregas quedan intactos y vuelven al reactivar.
 *
 * Reglas: nadie se suspende a sí mismo; solo un administrador cambia a otro administrador;
 * una institución nunca queda sin administrador activo.
 */
export async function setPersonStatus(
  actor: Actor,
  input: { userId: string; status: "ACTIVE" | "SUSPENDED"; reason?: string },
): Promise<StatusResult> {
  const reason = input.reason?.trim().slice(0, 500) || null;
  if (input.status === "SUSPENDED" && !reason) return { ok: false, message: "Escribe el motivo de la suspensión." };
  if (input.userId === actor.id) return { ok: false, message: "No puedes cambiar tu propio acceso." };

  return db.$transaction(
    async (tx) => {
      const target = await tx.user.findFirst({
        where: { id: input.userId, institutionId: actor.institutionId },
        select: { id: true, role: true, status: true },
      });
      if (!target) return { ok: false, message: "No encontramos a esa persona." } as const;
      const targetIsAdmin = ADMIN_ROLES.includes(target.role);
      if (targetIsAdmin && !ADMIN_ROLES.includes(actor.role)) {
        return { ok: false, message: "Solo un administrador puede cambiar el acceso de otro administrador." } as const;
      }
      if (target.status === input.status) return { ok: true, changed: false } as const;
      if (input.status === "SUSPENDED" && targetIsAdmin) {
        const otherAdmins = await tx.user.count({
          where: { institutionId: actor.institutionId, role: { in: [...ADMIN_ROLES] }, status: "ACTIVE", id: { not: target.id } },
        });
        if (otherAdmins === 0) return { ok: false, message: "La institución no puede quedar sin un administrador activo." } as const;
      }
      await tx.user.update({ where: { id: target.id }, data: { status: input.status } });
      await tx.auditLog.create({
        data: {
          institutionId: actor.institutionId,
          userId: actor.id,
          action: input.status === "SUSPENDED" ? "PERSON_SUSPENDED" : "PERSON_REACTIVATED",
          entity: "User",
          entityId: target.id,
          changes: { from: target.status, to: input.status, reason },
        },
      });
      return { ok: true, changed: true } as const;
    },
    // Serializable: dos administradores que se suspenden entre sí a la vez no dejan la institución sin ninguno.
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
