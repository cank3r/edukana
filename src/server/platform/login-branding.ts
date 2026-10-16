import { db } from "@/lib/db";
import { getRequestInstitution, type RequestInstitution } from "./domains";

/** Query branding is only used on an unbound platform host. */
export async function getLoginInstitution(wanted?: string): Promise<RequestInstitution | null> {
  const host = await getRequestInstitution();
  if (host) return host;
  const slug = wanted?.trim().toLowerCase();
  if (!slug || slug.length < 3 || slug.length > 63 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  return db.institution.findUnique({ where: { slug }, select: {
    id: true, name: true, slug: true, logoUrl: true, brandColor: true, domain: true, settings: true,
  } });
}
