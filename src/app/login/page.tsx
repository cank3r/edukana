import { authFromToken } from "@/lib/auth";
import { resolveSessionAccess } from "@/server/session";
import { institutionPausedMessage } from "@/server/platform/suspension-policy";
import { db } from "@/lib/db";
import { EDUKANA_BLUE, ensureReadableOnWhite, normalizeHexColor } from "@/server/platform/brand-color";
import { getPublicBrandingBySlug } from "@/server/platform/branding";
import { LoginScreen, type LoginBrand } from "./LoginForm";

export const dynamic = "force-dynamic";

/**
 * Inicio de sesión. Con `?institucion=<identificador>` muestra el nombre, el logo y el color de esa
 * institución y entra directamente a ella. Si el identificador no existe se ve la pantalla de siempre.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ institucion?: string | string[] }> }) {
  const wanted = (await searchParams).institucion;
  const [institution, anyInstitution] = await Promise.all([
    typeof wanted === "string" ? getPublicBrandingBySlug(wanted) : null,
    // Consulta barata: basta saber si existe al menos una institución.
    db.institution.findFirst({ select: { id: true } }),
  ]);
  const normalized = normalizeHexColor(institution?.brandColor);
  const brand: LoginBrand | null = institution
    ? { slug: institution.slug, name: institution.name, logoUrl: institution.logoUrl, color: normalized ? ensureReadableOnWhite(normalized).color : EDUKANA_BLUE }
    : null;
  const tokenSession = await authFromToken();
  const access = tokenSession?.user?.id ? await resolveSessionAccess({
    userId: tokenSession.user.id, identityId: tokenSession.user.identityId, sessionVersion: tokenSession.user.sessionVersion,
  }) : null;
  const notice = access?.suspendedInstitutionName ? institutionPausedMessage(access.suspendedInstitutionName) : null;
  return <LoginScreen brand={brand} showSetup={!anyInstitution} notice={notice} />;
}
