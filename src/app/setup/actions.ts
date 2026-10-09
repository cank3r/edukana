"use server";

import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { z } from "zod";

export type SetupState = { ok: boolean; message: string };

const setupSchema = z.object({
  institutionName: z.string().trim().min(3, "Escribe el nombre de la institución.").max(160),
  slug: z.string().trim().toLowerCase().min(3).max(63).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Usa letras minúsculas, números y guiones."),
  adminName: z.string().trim().min(3, "Escribe el nombre del administrador.").max(120),
  adminEmail: z.string().trim().toLowerCase().email("Escribe un correo válido.").max(200),
  password: z.string().min(10, "La contraseña debe tener al menos 10 caracteres.").max(200).regex(/[A-Za-zÁÉÍÓÚáéíóúÑñ]/, "Incluye al menos una letra.").regex(/\d/, "Incluye al menos un número."),
});

export async function createFirstInstitution(_state: SetupState, formData: FormData): Promise<SetupState> {
  const parsed = setupSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa los datos." };

  try {
    const password = await bcrypt.hash(parsed.data.password, 12);
    await db.$transaction(async (tx) => {
      if (await tx.institution.count()) throw new Error("SETUP_CLOSED");
      const institution = await tx.institution.create({
        data: { name: parsed.data.institutionName, slug: parsed.data.slug, type: "SCHOOL" },
        select: { id: true },
      });
      const admin = await tx.user.create({
        data: {
          institutionId: institution.id,
          name: parsed.data.adminName,
          email: parsed.data.adminEmail,
          password,
          role: "ADMIN",
          status: "ACTIVE",
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          institutionId: institution.id,
          userId: admin.id,
          action: "FIRST_INSTITUTION_CREATED",
          entity: "Institution",
          entityId: institution.id,
          changes: { slug: parsed.data.slug, administratorId: admin.id },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { ok: true, message: "Institución creada. Ya puedes iniciar sesión con el correo del administrador." };
  } catch (error) {
    if (error instanceof Error && error.message === "SETUP_CLOSED") return { ok: false, message: "La puesta en marcha inicial ya fue completada." };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, message: "El identificador o correo ya está en uso." };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return { ok: false, message: "Otra puesta en marcha terminó primero. Recarga la página." };
    const correlationId = crypto.randomUUID();
    console.error("createFirstInstitution failed", { correlationId, error });
    return { ok: false, message: `No se pudo crear la institución. Intenta de nuevo. Código: ${correlationId}` };
  }
}
