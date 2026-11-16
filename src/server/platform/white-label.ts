import { db } from "@/lib/db";
import { settingsObject } from "./feature-policy";

/** An explicit plan choice wins; legacy institutions can use the operator setting. */
export function resolveWhiteLabel(settings: unknown, planFeatures?: unknown): boolean {
  const feature = settingsObject(planFeatures).whiteLabel;
  return typeof feature === "boolean" ? feature : settingsObject(settingsObject(settings).platform).hideEdukanaBrand === true;
}

export async function getInstitutionWhiteLabel(institutionId: string): Promise<boolean> {
  const institution = await db.institution.findUnique({ where: { id: institutionId }, select: {
    settings: true, platformSubscription: { select: { plan: { select: { features: true } } } },
  } });
  return !!institution && resolveWhiteLabel(institution.settings, institution.platformSubscription?.plan.features);
}

export function safeBrandLogoUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\/api\/public-images\/[a-zA-Z0-9_-]+$/.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}
