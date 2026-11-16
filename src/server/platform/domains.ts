import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requestHostname, requestOrigin, rootDomain, isPlatformRootHost } from "./domain-policy";
export { normalizeInstitutionDomain, validateInstitutionDomain, institutionBaseUrl } from "./domain-policy";

export type RequestInstitution = {
  id: string; slug: string; name: string; logoUrl: string | null; brandColor: string | null;
  domain: string | null; settings: Prisma.JsonValue;
};
const select = { id: true, slug: true, name: true, logoUrl: true, brandColor: true, domain: true, settings: true } as const;
const HOST_CACHE_TTL_MS = 15_000;
const HOST_CACHE_MAX = 256;
const hosts = new Map<string, { institution: RequestInstitution | null; expires: number }>();
let generation = 0;

/** Operator domain/branding writes invalidate the current process; other replicas expire within 15 seconds. */
export function invalidateInstitutionHostCache() { generation++; hosts.clear(); }

export async function resolveInstitutionHost(host: string | null | undefined, options: { fresh?: boolean } = {}): Promise<RequestInstitution | null> {
  if (host && !requestOrigin(host)) throw new Error("Invalid request host");
  const hostname = requestHostname(host);
  if (!hostname) return null;
  const root = rootDomain();
  if (isPlatformRootHost(hostname)) return null;
  const key = `${root ?? ""}|${hostname}`;
  const cached = hosts.get(key);
  if (!options.fresh && cached && cached.expires > Date.now()) return cached.institution;
  hosts.delete(key);
  const startedGeneration = generation;
  // Platform subdomains belong exclusively to their slug. A custom domain cannot shadow another institution.
  const platformHost = root && hostname.endsWith(`.${root}`);
  const slug = platformHost ? hostname.slice(0, -(root.length + 1)) : null;
  const institution = platformHost
    ? (slug && !slug.includes(".") ? await db.institution.findUnique({ where: { slug }, select }) : null)
    : await db.institution.findUnique({ where: { domain: hostname }, select });
  if (startedGeneration === generation) {
    if (hosts.size >= HOST_CACHE_MAX) hosts.delete(hosts.keys().next().value!);
    hosts.set(key, { institution, expires: Date.now() + HOST_CACHE_TTL_MS });
  }
  return institution;
}

/** Always resolve the actual request authority; never accept a client-supplied tenant ID/header. */
export const getRequestInstitution = cache(async (): Promise<RequestInstitution | null> => {
  return resolveInstitutionHost((await headers()).get("host"), { fresh: true });
});
