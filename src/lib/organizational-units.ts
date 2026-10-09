import type { Capability } from "@/lib/capabilities";

export class OrganizationalUnitPolicyError extends Error {}

export type TenantEntity = { id: string; institutionId: string };

export function canManageOrganizationalUnits(capabilities: ReadonlySet<Capability>) {
  return capabilities.has("tenant.settings.manage");
}

export function assertOrganizationalUnitTenantBoundary(
  institutionId: string,
  entities: readonly TenantEntity[],
) {
  if (!institutionId || entities.some((entity) => entity.institutionId !== institutionId)) {
    throw new OrganizationalUnitPolicyError("La unidad o la persona pertenece a otra institución.");
  }
}


export function organizationalUnitWhere(institutionId: string, unitId: string) {
  return { id: unitId, institutionId } as const;
}

export function organizationalUnitMembershipWhere(institutionId: string, unitId: string, userId: string) {
  return {
    institutionId,
    unitId,
    userId,
    unit: { institutionId },
    user: { institutionId },
  } as const;
}
