import { notFound } from "next/navigation";
import { findBrand } from "@/server/catalog/public";
import { getRequestInstitution } from "@/server/platform/domains";
import { getInstitutionWhiteLabel } from "@/server/platform/white-label";
import { institutionMetadata } from "@/server/platform/brand-metadata";
import { EdukanaFooter } from "@/components/platform/EdukanaFooter";

type Props = { params: Promise<{ institutionSlug: string }>; children: React.ReactNode };
async function catalogBrand(slug: string) {
  const host = await getRequestInstitution();
  if (host && host.slug !== slug) notFound();
  return findBrand(slug);
}
export async function generateMetadata({ params }: Props) {
  return institutionMetadata(await catalogBrand((await params).institutionSlug), "Cursos");
}
export default async function CatalogLayout({ params, children }: Props) {
  const brand = await catalogBrand((await params).institutionSlug);
  if (!brand) notFound();
  return <>{children}<EdukanaFooter hidden={await getInstitutionWhiteLabel(brand.id)} /></>;
}
