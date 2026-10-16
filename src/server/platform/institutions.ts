import { createTrialSubscription, PLATFORM_TRIAL_DAYS } from "./plan-defaults";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { ensureIdentity, normalizeEmail } from "@/server/identity";
import { sendInvitations } from "@/server/people/invitations";

/**
 * Operador de la plataforma: quien puede dar de alta instituciones.
 * Se decide por una lista de correos en `PLATFORM_OPERATOR_EMAILS` (separados por coma), no por
 * un rol guardado en la base: ningún administrador de una institución puede concedérselo.
 * Sin la variable, nadie es operador.
 */
export function isPlatformOperator(email: string | null | undefined, env: Record<string, string | undefined> = process.env) {
  if (!email) return false;
  const allowed = (env.PLATFORM_OPERATOR_EMAILS ?? "").split(",").map(normalizeEmail).filter(Boolean);
  return allowed.includes(normalizeEmail(email));
}

export const newInstitutionSchema = z.object({
  name: z.string().trim().min(3, "Escribe el nombre de la institución.").max(160),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "El identificador necesita al menos 3 caracteres.")
    .max(63)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Usa letras minúsculas, números y guiones."),
  type: z.enum(["SCHOOL", "UNIVERSITY", "INSTITUTE", "ACADEMY", "OTHER"]).default("INSTITUTE"),
  adminName: z.string().trim().min(3, "Escribe el nombre del administrador.").max(120),
  adminEmail: z.string().trim().toLowerCase().email("Escribe un correo válido.").max(200),
});

export type NewInstitutionInput = z.input<typeof newInstitutionSchema>;
export type NewInstitutionResult =
  | { ok: true; institutionId: string; adminUserId: string; invited: boolean }
  | { ok: false; message: string };

/**
 * Da de alta una institución con su primer administrador y le envía la invitación.
 * El administrador no recibe contraseña de nadie: la crea con el enlace, o usa la que ya tiene
 * si su correo pertenece a otra institución.
 * Si el correo falla, la institución queda creada e `invited` es false: se reenvía después.
 */
export async function createInstitution(operatorEmail: string, input: NewInstitutionInput): Promise<NewInstitutionResult> {
  if (!isPlatformOperator(operatorEmail)) return { ok: false, message: "No tienes permiso para crear instituciones." };
  const parsed = newInstitutionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  const data = parsed.data;

  let created: { institutionId: string; adminUserId: string };
  try {
    created = await db.$transaction(async (tx) => {
      const institution = await tx.institution.create({
        data: { name: data.name, slug: data.slug, type: data.type },
        select: { id: true },
      });
      const subscription = await createTrialSubscription(tx, institution.id);
      await tx.auditLog.create({ data: {
        institutionId: institution.id, action: "PLATFORM_SUBSCRIPTION_TRIAL_CREATED", entity: "InstitutionSubscription",
        entityId: subscription.id, changes: { operator: normalizeEmail(operatorEmail), before: null,
          after: { planCode: "FREE", status: "TRIAL", trialDays: PLATFORM_TRIAL_DAYS } },
      } });
      const identityId = await ensureIdentity(tx, { email: data.adminEmail });
      const admin = await tx.user.create({
        data: { identityId, institutionId: institution.id, name: data.adminName, email: data.adminEmail, role: "ADMIN", status: "ACTIVE" },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          institutionId: institution.id,
          action: "INSTITUTION_CREATED",
          entity: "Institution",
          entityId: institution.id,
          changes: { slug: data.slug, administratorId: admin.id, operator: normalizeEmail(operatorEmail) },
        },
      });
      return { institutionId: institution.id, adminUserId: admin.id };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, message: "Ese identificador ya está en uso. Elige otro." };
    }
    throw error;
  }
  const invitation = await sendInvitations({ id: created.adminUserId, institutionId: created.institutionId }, [created.adminUserId]);
  return { ok: true, ...created, invited: invitation.sent === 1 };
}
