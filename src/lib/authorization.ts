import "server-only";

import { db } from "@/lib/db";
import { resolveEffectiveCapabilities, type Capability } from "@/lib/capabilities";
import type { EdukanaRole } from "@/types/next-auth";

export type AuthorizationUser = { institutionId: string; role: EdukanaRole };

export async function getEffectiveCapabilities(institutionId: string, role: EdukanaRole): Promise<ReadonlySet<Capability>> {
  if (!institutionId) return new Set();
  const overrides = await db.roleCapabilityOverride.findMany({
    where: { institutionId, role },
    select: { capability: true, enabled: true },
  });
  return resolveEffectiveCapabilities(role, overrides);
}

export async function userHasCapability(user: AuthorizationUser, capability: Capability): Promise<boolean> {
  return (await getEffectiveCapabilities(user.institutionId, user.role)).has(capability);
}
