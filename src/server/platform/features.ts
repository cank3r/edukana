import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { normalizeEmail } from "@/server/identity";
import { isPlatformOperator } from "./institutions";
import { resolveInstitutionFeatures, settingsObject, type InstitutionFeatures } from "./feature-policy";

async function readFeatures(institutionId: string, client: Pick<Prisma.TransactionClient, "institution"> = db) {
  return client.institution.findUnique({ where: { id: institutionId }, select: {
    settings: true, status: true, platformSubscription: { select: { plan: { select: { features: true } } } },
  } });
}

function planFeatures(value: unknown) {
  const plan = settingsObject(value);
  return { ...(typeof plan.ai === "boolean" ? { ai: plan.ai } : {}),
    ...(typeof plan.catalog === "boolean" ? { catalog: plan.catalog } : {}) };
}

export async function getInstitutionFeatures(institutionId: string): Promise<InstitutionFeatures> {
  const institution = await readFeatures(institutionId);
  return institution ? resolveInstitutionFeatures(institution.settings, planFeatures(institution.platformSubscription?.plan.features))
    : { ai: false, catalog: false, aiLocked: true, commissionPercent: 0 };
}

/** Shared by public reads and checkout; caller may hold the institution row lock. */
export async function isInstitutionCatalogAvailable(
  institutionId: string, client: Pick<Prisma.TransactionClient, "institution"> = db,
): Promise<boolean> {
  const institution = await readFeatures(institutionId, client);
  return !!institution && institution.status === "ACTIVE" &&
    resolveInstitutionFeatures(institution.settings, planFeatures(institution.platformSubscription?.plan.features)).catalog;
}

export const platformFeaturesSchema = z.object({
  ai: z.boolean(), catalog: z.boolean(), commissionPercent: z.number().finite().min(0).max(100),
});
export type PlatformFeaturesInput = z.infer<typeof platformFeaturesSchema>;
export type FeatureResult = { ok: boolean; message: string };

/** Serialize both platform and institution AI writes on this row, preventing a lost lock/update. */
export async function lockInstitutionSettings(tx: Prisma.TransactionClient, institutionId: string) {
  await tx.$queryRaw`SELECT id FROM institutions WHERE id = ${institutionId} FOR UPDATE`;
}

export async function updateInstitutionFeatures(
  operatorEmail: string | null | undefined, institutionId: string, input: PlatformFeaturesInput,
): Promise<FeatureResult> {
  if (!isPlatformOperator(operatorEmail)) return { ok: false, message: "No tienes permiso para cambiar estas funciones." };
  const parsed = platformFeaturesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Revisa las funciones y escribe una comisión entre 0 y 100." };
  return db.$transaction(async (tx) => {
    await lockInstitutionSettings(tx, institutionId);
    const institution = await readFeatures(institutionId, tx);
    if (!institution) return { ok: false, message: "No encontramos esta institución." };
    const current = settingsObject(institution.settings);
    const { ai, catalog, commissionPercent } = parsed.data;
    const settings = {
      ...current,
      ai: { ...settingsObject(current.ai), enabled: ai },
      platform: { ...settingsObject(current.platform), aiLocked: !ai, catalogEnabled: catalog, commissionPercent },
    } as Prisma.InputJsonObject;
    await tx.institution.update({ where: { id: institutionId }, data: { settings } });
    await tx.auditLog.create({ data: {
      institutionId, action: "PLATFORM_FEATURES_UPDATED", entity: "Institution", entityId: institutionId,
      changes: { operator: normalizeEmail(operatorEmail!), before: resolveInstitutionFeatures(current, planFeatures(institution.platformSubscription?.plan.features)),
        after: resolveInstitutionFeatures(settings, planFeatures(institution.platformSubscription?.plan.features)) },
    } });
    return { ok: true, message: "Funciones guardadas." };
  });
}
