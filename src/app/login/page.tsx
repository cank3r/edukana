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
  const institution = typeof wanted === "string" ? await getPublicBrandingBySlug(wanted) : null;
  const normalized = normalizeHexColor(institution?.brandColor);
  const brand: LoginBrand | null = institution
    ? { slug: institution.slug, name: institution.name, logoUrl: institution.logoUrl, color: normalized ? ensureReadableOnWhite(normalized).color : EDUKANA_BLUE }
    : null;
  return <LoginScreen brand={brand} />;
}
