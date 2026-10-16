import "server-only";
import { db } from "@/lib/db";
import { normalizeEmail } from "@/server/identity";
import { isPlatformOperator } from "./institutions";
import { institutionSuspensionSchema } from "./suspension-policy";

export type InstitutionAccessState = { status: "ACTIVE" | "SUSPENDED"; name: string };

/** Shared read for catalog/purchase guards; never returns the private suspension reason. */
export async function getInstitutionAccessState(institutionId: string): Promise<InstitutionAccessState | null> {
  if (!institutionId) return null;
  return db.institution.findUnique({ where: { id: institutionId }, select: { status: true, name: true } });
}

export async function getInstitutionSuspension(operatorEmail: string | null | undefined, institutionId: string) {
  if (!isPlatformOperator(operatorEmail) || !institutionId) return null;
  return db.institution.findUnique({
    where: { id: institutionId },
    select: { id: true, name: true, status: true, suspendedAt: true, suspendedReason: true },
  });
}

export type SuspensionResult = { ok: boolean; message: string };

/** The caller must obtain operatorEmail from getOperatorEmail(), never form data. */
export async function setInstitutionSuspension(
  operatorEmail: string | null | undefined,
  input: unknown,
): Promise<SuspensionResult> {
  if (!isPlatformOperator(operatorEmail)) return { ok: false, message: "No tienes permiso para hacer esto." };
  const parsed = institutionSuspensionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  const { institutionId, status, confirmation, reason } = parsed.data;
  return db.$transaction(async (tx) => {
    // Serialize operator transitions, including their before/after audit snapshots.
    await tx.$queryRaw`SELECT "id" FROM "institutions" WHERE "id" = ${institutionId} FOR UPDATE`;
    const before = await tx.institution.findUnique({ where: { id: institutionId } });
    if (!before) return { ok: false, message: "No encontramos esta institución." };
    if (confirmation !== before.name.trim()) {
      return { ok: false, message: "El nombre no coincide. Escríbelo tal como aparece arriba." };
    }
    if (before.status === status) {
      return { ok: true, message: status === "ACTIVE" ? "La institución ya está activa." : "La institución ya está suspendida." };
    }
    const after = await tx.institution.update({
      where: { id: institutionId },
      data: { status, suspendedAt: status === "SUSPENDED" ? new Date() : null, suspendedReason: status === "SUSPENDED" ? reason : null },
      select: { status: true, suspendedAt: true, suspendedReason: true },
    });
    await tx.auditLog.create({
      data: {
        institutionId,
        action: status === "SUSPENDED" ? "PLATFORM_INSTITUTION_SUSPENDED" : "PLATFORM_INSTITUTION_REACTIVATED",
        entity: "Institution",
        entityId: institutionId,
        changes: {
          operator: normalizeEmail(operatorEmail!),
          before: { status: before.status, suspendedAt: before.suspendedAt?.toISOString() ?? null, suspendedReason: before.suspendedReason },
          after: { ...after, suspendedAt: after.suspendedAt?.toISOString() ?? null },
        },
      },
    });
    return {
      ok: true,
      message: status === "SUSPENDED" ? "Institución suspendida. El acceso está pausado." : "Institución reactivada. El acceso está disponible.",
    };
  });
}
