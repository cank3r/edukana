import type { Metadata } from "next";
import { safeBrandLogoUrl } from "./white-label";
export function institutionMetadata(brand: { name: string; logoUrl: string | null } | null, section: string): Metadata {
  if (!brand) return { title: `Edukana · ${section}` };
  const icon = safeBrandLogoUrl(brand.logoUrl);
  return { title: { default: `${brand.name} · ${section}`, template: `${brand.name.replace(/%s/g, "")} · %s` },
    ...(icon ? { icons: { icon, apple: icon } } : {}) };
}
