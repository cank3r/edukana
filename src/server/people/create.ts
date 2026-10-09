import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { ensureIdentity, normalizeEmail } from "@/server/identity";
import type { EdukanaRole } from "@/types/next-auth";

type Actor = { id: string; institutionId: string; role: EdukanaRole };
export type CreatePersonResult = { ok: true; userId: string } | { ok: false; message: string };

const ADMIN_ROLES: readonly EdukanaRole[] = ["ADMIN", "SUPER_ADMIN"];
const ALREADY_HERE = "Ya hay una persona con ese correo en tu institución. Búscala en la lista para corregir sus datos.";

export const personCreateSchema = z.object({
  name: z.string().trim().min(3, "Escribe el nombre completo.").max(120, "El nombre es demasiado largo."),
  email: z
    .string()
    .max(254, "El correo es demasiado largo.")
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Escribe un correo válido, por ejemplo ana@correo.com."),
  role: z.enum(["STUDENT", "TEACHER", "COORDINATOR", "PARENT", "ADMIN"], "Elige un rol de la lista."),
  phone: z.string().trim().max(30, "El teléfono es demasiado largo.").optional(),
});

/**
 * Da de alta a una persona en la institución de quien actúa, sin contraseña:
 * la define ella misma con el enlace de su invitación.
 *
 * Si el correo ya tiene cuenta en otra institución se reutiliza esa identidad y su
 * contraseña no se toca. Solo un administrador puede crear a otro administrador.
 */
export async function createPerson(
  actor: Actor,
  input: { name: string; email: string; role: string; phone?: string },
): Promise<CreatePersonResult> {
  const parsed = personCreateSchema.safeParse({
    name: input.name,
    email: normalizeEmail(String(input.email ?? "")),
    role: input.role,
    phone: input.phone,
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  const data = parsed.data;
  if (data.role === "ADMIN" && !ADMIN_ROLES.includes(actor.role)) {
    return { ok: false, message: "Solo un administrador puede agregar a otro administrador." };
  }

  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.user.findFirst({
        where: { institutionId: actor.institutionId, email: data.email },
        select: { id: true },
      });
      if (existing) return { ok: false, message: ALREADY_HERE } as const;

      const identityId = await ensureIdentity(tx, { email: data.email });
      const user = await tx.user.create({
        data: {
          identityId,
          institutionId: actor.institutionId,
          name: data.name,
          email: data.email,
          role: data.role,
          phone: data.phone || null,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          institutionId: actor.institutionId,
          userId: actor.id,
          action: "PERSON_CREATED",
          entity: "User",
          entityId: user.id,
          changes: { role: data.role },
        },
      });
      return { ok: true, userId: user.id } as const;
    });
  } catch (error) {
    // Dos altas simultáneas del mismo correo: la segunda choca con la regla de unicidad.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, message: ALREADY_HERE };
    throw error;
  }
}
