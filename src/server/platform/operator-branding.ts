import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizeEmail } from "@/server/identity";
import { isPlatformOperator } from "./institutions";
import { ensureReadableOnWhite, normalizeHexColor } from "./brand-color";
import { normalizeInstitutionDomain, validateInstitutionDomain, invalidateInstitutionHostCache } from "./domains";
import { settingsObject } from "./feature-policy";
import { lockInstitutionSettings } from "./features";
import { publicImageUrl } from "@/lib/uploads";

export type OperatorBrandInput = { brandColor: string; domain: string; hideEdukanaBrand: boolean; assetId?: string; removeLogo?: boolean; confirmation?: string };
export function validateOperatorBrand(input: OperatorBrandInput) {
  const normalized = input.brandColor.trim() ? normalizeHexColor(input.brandColor) : null;
  if (input.brandColor.trim() && !normalized) throw new Error("Escribe un color como #2457F5.");
  const readable = normalized ? ensureReadableOnWhite(normalized) : null;
  return { brandColor: readable?.color ?? null, adjusted: readable?.adjusted ?? false,
    domain: normalizeInstitutionDomain(input.domain), hideEdukanaBrand: input.hideEdukanaBrand === true };
}

export async function updateOperatorBrand(
  operator: string | null, userId: string, institutionId: string, input: OperatorBrandInput,
) {
  if (!isPlatformOperator(operator)) return { ok: false, message: "No tienes permiso para cambiar esta marca." };
  let parsed: ReturnType<typeof validateOperatorBrand>;
  try { parsed = validateOperatorBrand(input); } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Revisa la marca y el dominio." };
  }
  try {
    const result = await db.$transaction(async (tx) => {
      await lockInstitutionSettings(tx, institutionId);
      const before = await tx.institution.findUnique({ where: { id: institutionId }, select: {
        name: true, slug: true, logoUrl: true, brandColor: true, domain: true, settings: true,
      } });
      if (!before) return { ok: false, message: "No encontramos esta institución." };
      if (parsed.domain !== before.domain && input.confirmation?.trim() !== before.name) {
        return { ok: false, message: "Escribe el nombre de la institución para confirmar el cambio de dominio." };
      }
      try { validateInstitutionDomain(parsed.domain, before.slug); } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : "Ese dominio está reservado." };
      }
      let logoUrl = input.removeLogo ? null : before.logoUrl;
      if (input.assetId && !input.removeLogo) {
        const asset = await tx.storageAsset.findFirst({ where: {
          id: input.assetId, institutionId, uploaderId: userId, kind: "IMAGE", confirmedAt: { not: null },
          courseId: null, announcementId: null, submissionId: null,
          objectPath: { startsWith: `${institutionId}/public/logo/${institutionId}/` },
        }, select: { id: true } });
        if (!asset) return { ok: false, message: "No encontramos ese logo. Vuelve a subirlo." };
        logoUrl = publicImageUrl(asset.id);
      }
      const settings = settingsObject(before.settings);
      const platform = settingsObject(settings.platform);
      const after = { logoUrl, brandColor: parsed.brandColor, domain: parsed.domain, hideEdukanaBrand: parsed.hideEdukanaBrand };
      await tx.institution.update({ where: { id: institutionId }, data: {
        logoUrl, brandColor: parsed.brandColor, domain: parsed.domain,
        settings: { ...settings, platform: { ...platform, hideEdukanaBrand: parsed.hideEdukanaBrand } } as Prisma.InputJsonObject,
      } });
      await tx.auditLog.create({ data: {
        institutionId, action: "PLATFORM_BRANDING_UPDATED", entity: "Institution", entityId: institutionId,
        changes: { operator: normalizeEmail(operator!), before: { logoUrl: before.logoUrl, brandColor: before.brandColor,
          domain: before.domain, hideEdukanaBrand: platform.hideEdukanaBrand === true }, after, adjusted: parsed.adjusted },
      } });
      return { ok: true, message: parsed.adjusted
        ? `Marca guardada. Ajustamos el color a ${parsed.brandColor} para que se lea bien.` : "Marca guardada." };
    });
    if (result.ok) invalidateInstitutionHostCache();
    return result;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, message: "Ese dominio ya pertenece a otra institución. Usa otro dominio." };
    }
    throw error;
  }
}
