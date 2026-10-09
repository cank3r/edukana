import { getEffectiveCapabilities } from "@/lib/authorization";
import { db } from "@/lib/db";
import type { EdukanaRole } from "@/types/next-auth";
import { ensureReadableOnWhite, normalizeHexColor } from "./brand-color";

/** Marca de la institución: nombre, logo y color principal. */
export type InstitutionBranding = { name: string; logoUrl: string | null; brandColor: string | null };

const brandingSelect = { name: true, logoUrl: true, brandColor: true } as const;

/** Marca de la institución de quien está en sesión. Nunca recibe un id desde el navegador. */
export function getInstitutionBranding(institutionId: string): Promise<InstitutionBranding | null> {
  return db.institution.findUnique({ where: { id: institutionId }, select: brandingSelect });
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Marca pública para la pantalla de inicio de sesión (`/login?institucion=<identificador>`).
 * Solo devuelve lo que ya se ve al entrar: nombre, logo y color. Un identificador que no
 * existe devuelve null, igual que uno mal escrito, y la pantalla se muestra sin marca.
 */
export async function getPublicBrandingBySlug(slug: string | null | undefined): Promise<(InstitutionBranding & { slug: string }) | null> {
  const wanted = String(slug ?? "").trim().toLowerCase();
  if (wanted.length < 3 || wanted.length > 63 || !SLUG.test(wanted)) return null;
  const institution = await db.institution.findUnique({ where: { slug: wanted }, select: { ...brandingSelect, slug: true } });
  return institution ?? null;
}

export type BrandActor = { id: string; institutionId: string; role: EdukanaRole };
export type BrandColorResult =
  | { ok: true; color: string | null; adjusted: boolean; message: string }
  | { ok: false; message: string };

/**
 * Cambia el color principal de la institución de quien está en sesión.
 * Vacío vuelve al color de Edukana. Un color que no se lee con letras blancas se oscurece
 * y se avisa. Requiere permiso para cambiar los datos de la institución.
 */
export async function updateBrandColor(actor: BrandActor, input: string): Promise<BrandColorResult> {
  const capabilities = await getEffectiveCapabilities(actor.institutionId, actor.role);
  if (!capabilities.has("tenant.settings.manage")) return { ok: false, message: "No tienes permiso para cambiar los datos de la institución." };

  const raw = String(input ?? "").trim();
  let color: string | null = null;
  let adjusted = false;
  if (raw) {
    const normalized = normalizeHexColor(raw);
    if (!normalized) return { ok: false, message: "Ese color no es válido. Elige uno de los sugeridos o escríbelo como #2457F5." };
    ({ color, adjusted } = ensureReadableOnWhite(normalized));
  }

  const before = await db.institution.findUnique({ where: { id: actor.institutionId }, select: { brandColor: true } });
  if (!before) return { ok: false, message: "No encontramos tu institución. Vuelve a iniciar sesión." };
  await db.$transaction([
    db.institution.update({ where: { id: actor.institutionId }, data: { brandColor: color } }),
    db.auditLog.create({
      data: {
        institutionId: actor.institutionId,
        userId: actor.id,
        action: "INSTITUTION_BRAND_COLOR_UPDATED",
        entity: "Institution",
        entityId: actor.institutionId,
        changes: { before: before.brandColor, after: color, adjusted },
      },
    }),
  ]);

  const message = !color
    ? "Listo. Tu institución vuelve a usar el color de Edukana."
    : adjusted
      ? `Color guardado. Lo oscurecimos a ${color} para que las letras blancas de los botones se lean bien.`
      : "Color guardado. Ya se ve en el menú y en los botones principales.";
  return { ok: true, color, adjusted, message };
}
