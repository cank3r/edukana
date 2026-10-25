import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import type { EdukanaRole } from "@/types/next-auth";

type Actor = { id: string; institutionId: string; role: EdukanaRole };
export type ProfileResult = { ok: true } | { ok: false; message: string };

const ADMIN_ROLES: readonly EdukanaRole[] = ["ADMIN", "SUPER_ADMIN"];

export const personEditSchema = z.object({
  name: z.string().trim().min(3, "Escribe el nombre completo.").max(120),
  phone: z.string().trim().max(30, "El teléfono es demasiado largo.").optional(),
  role: z.enum(["STUDENT", "TEACHER", "COORDINATOR", "PARENT", "ADMIN"]),
});

/**
 * Corrige el nombre, el teléfono o el rol de una persona de la institución de quien actúa.
 * El correo no se cambia aquí: es la cuenta con la que la persona entra.
 *
 * Reglas del rol: nadie cambia el suyo; solo un administrador nombra o quita a otro
 * administrador; la institución no puede quedar sin administrador activo.
 */
export async function updatePerson(
  actor: Actor,
  input: { userId: string; name: string; phone?: string; role: string },
): Promise<ProfileResult> {
  const parsed = personEditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  const data = parsed.data;

  return db.$transaction(
    async (tx) => {
      const target = await tx.user.findFirst({
        where: { id: input.userId, institutionId: actor.institutionId },
        select: { id: true, name: true, role: true, status: true },
      });
      if (!target) return { ok: false, message: "No encontramos a esa persona." } as const;

      const roleChanges = target.role !== data.role;
      if (roleChanges) {
        if (target.id === actor.id) return { ok: false, message: "No puedes cambiar tu propio rol." } as const;
        const touchesAdmin = ADMIN_ROLES.includes(target.role) || ADMIN_ROLES.includes(data.role);
        if (touchesAdmin && !ADMIN_ROLES.includes(actor.role)) {
          return { ok: false, message: "Solo un administrador puede nombrar o quitar administradores." } as const;
        }
        if (ADMIN_ROLES.includes(target.role) && target.status === "ACTIVE") {
          const otherAdmins = await tx.user.count({
            where: { institutionId: actor.institutionId, role: { in: [...ADMIN_ROLES] }, status: "ACTIVE", id: { not: target.id } },
          });
          if (otherAdmins === 0) return { ok: false, message: "La institución no puede quedar sin un administrador activo." } as const;
        }
      }

      await tx.user.update({ where: { id: target.id }, data: { name: data.name, phone: data.phone || null, role: data.role } });
      await tx.auditLog.create({
        data: {
          institutionId: actor.institutionId,
          userId: actor.id,
          action: "PERSON_UPDATED",
          entity: "User",
          entityId: target.id,
          changes: { nameChanged: target.name !== data.name, roleFrom: target.role, roleTo: data.role },
        },
      });
      return { ok: true } as const;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
