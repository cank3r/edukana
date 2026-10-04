import {
  PROTECTED_ADMIN_CAPABILITIES,
  ROLE_ALLOWED_CAPABILITIES,
  isCapability,
  resolveEffectiveCapabilities,
  type Capability,
  type CapabilityOverride,
} from "@/lib/capabilities";
import type { EdukanaRole } from "@/types/next-auth";

export type PermissionActor = {
  id: string;
  institutionId: string;
  role: EdukanaRole;
  capabilities: ReadonlySet<Capability>;
};

export type PermissionChange = { capability: string; enabled: boolean };

export type PermissionWrite = {
  institutionId: string;
  role: EdukanaRole;
  capability: Capability;
  enabled: boolean;
  updatedById: string;
};

export type PermissionCommit = {
  institutionId: string;
  role: EdukanaRole;
  updatedById: string;
  writes: PermissionWrite[];
  before: Capability[];
  after: Capability[];
};

export interface RolePermissionStore {
  load(institutionId: string, role: EdukanaRole): Promise<CapabilityOverride[]>;
  commit(change: PermissionCommit): Promise<void>;
}

export class PermissionPolicyError extends Error {}

export function roleEditRestriction(actorRole: EdukanaRole, targetRole: EdukanaRole): string | null {
  if (targetRole === "SUPER_ADMIN") return "SUPER_ADMIN conserva siempre sus capacidades del sistema.";
  if (targetRole === "ADMIN" && actorRole !== "SUPER_ADMIN") return "Solo SUPER_ADMIN puede modificar el rol ADMIN.";
  return null;
}

export async function persistRolePermissions(
  store: RolePermissionStore,
  input: { actor: PermissionActor; targetRole: EdukanaRole; changes: readonly PermissionChange[] },
): Promise<ReadonlySet<Capability>> {
  if (!input.actor.institutionId) throw new PermissionPolicyError("Institución inválida.");
  if (!input.actor.capabilities.has("roles.permissions.manage")) throw new PermissionPolicyError("Permisos insuficientes.");

  const restriction = roleEditRestriction(input.actor.role, input.targetRole);
  if (restriction) throw new PermissionPolicyError(restriction);

  const seen = new Set<string>();
  for (const change of input.changes) {
    if (!isCapability(change.capability)) throw new PermissionPolicyError("La solicitud contiene una capacidad desconocida.");
    if (seen.has(change.capability)) throw new PermissionPolicyError("La solicitud contiene cambios duplicados.");
    seen.add(change.capability);
    if (!ROLE_ALLOWED_CAPABILITIES[input.targetRole].has(change.capability)) {
      throw new PermissionPolicyError("Esa capacidad no es válida para el rol seleccionado.");
    }
    if (!input.actor.capabilities.has(change.capability)) {
      throw new PermissionPolicyError("No puedes conceder ni revocar una capacidad que no posees.");
    }
  }

  const currentOverrides = await store.load(input.actor.institutionId, input.targetRole);
  const beforeSet = resolveEffectiveCapabilities(input.targetRole, currentOverrides);
  const desired = new Set(beforeSet);
  for (const change of input.changes) {
    const capability = change.capability as Capability;
    if (change.enabled) desired.add(capability);
    else desired.delete(capability);
  }

  if (input.targetRole === "ADMIN") {
    for (const capability of PROTECTED_ADMIN_CAPABILITIES) {
      if (!desired.has(capability)) throw new PermissionPolicyError("No se puede retirar acceso crítico al rol ADMIN.");
    }
  }
  if (input.targetRole === input.actor.role && !desired.has("roles.permissions.manage")) {
    throw new PermissionPolicyError("El cambio bloquearía tu propio acceso a permisos.");
  }

  if (input.changes.length === 0) return beforeSet;
  const writes = input.changes.map((change) => ({
    institutionId: input.actor.institutionId,
    role: input.targetRole,
    capability: change.capability as Capability,
    enabled: change.enabled,
    updatedById: input.actor.id,
  }));
  const after = [...resolveEffectiveCapabilities(input.targetRole, [...currentOverrides, ...writes])];

  await store.commit({
    institutionId: input.actor.institutionId,
    role: input.targetRole,
    updatedById: input.actor.id,
    writes,
    before: [...beforeSet],
    after,
  });
  return new Set(after);
}
