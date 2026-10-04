import assert from "node:assert/strict";
import test from "node:test";
import {
  CAPABILITIES,
  isCapability,
  resolveEffectiveCapabilities,
  type Capability,
  type CapabilityOverride,
} from "../src/lib/capabilities";
import {
  PermissionPolicyError,
  persistRolePermissions,
  type PermissionCommit,
  type RolePermissionStore,
} from "../src/lib/role-permissions";
import type { EdukanaRole } from "../src/types/next-auth";

class MemoryPermissionStore implements RolePermissionStore {
  rows = new Map<string, CapabilityOverride[]>();
  commits: PermissionCommit[] = [];
  private key(institutionId: string, role: EdukanaRole) { return `${institutionId}:${role}`; }
  seed(institutionId: string, role: EdukanaRole, rows: CapabilityOverride[]) { this.rows.set(this.key(institutionId, role), rows); }
  async load(institutionId: string, role: EdukanaRole) { return this.rows.get(this.key(institutionId, role)) ?? []; }
  async commit(change: PermissionCommit) {
    this.commits.push(change);
    const merged = new Map((await this.load(change.institutionId, change.role)).map((row) => [row.capability, row.enabled]));
    for (const write of change.writes) merged.set(write.capability, write.enabled);
    this.rows.set(this.key(change.institutionId, change.role), [...merged].map(([capability, enabled]) => ({ capability, enabled })));
  }
}

const allCapabilities = new Set(CAPABILITIES);
const adminActor = (institutionId = "institution-a", role: EdukanaRole = "ADMIN") => ({ id: "actor-1", institutionId, role, capabilities: allCapabilities });

async function rejectsPolicy(run: () => Promise<unknown>, message: RegExp) {
  await assert.rejects(run, (error: unknown) => error instanceof PermissionPolicyError && message.test(error.message));
}

test("calcula defaults más overrides y deniega por defecto", () => {
  const effective = resolveEffectiveCapabilities("COORDINATOR", [
    { capability: "finance.manage", enabled: true },
    { capability: "course.manage", enabled: false },
    { capability: "capability.inventada", enabled: true },
  ]);
  assert.equal(effective.has("finance.manage"), false);
  assert.equal(effective.has("course.manage"), false);
  assert.equal(isCapability("capability.inventada"), false);
});

test("prohíbe finance.manage para COORDINATOR aunque el actor lo posea", async () => {
  const store = new MemoryPermissionStore();
  await rejectsPolicy(() => persistRolePermissions(store, {
    actor: adminActor(),
    targetRole: "COORDINATOR",
    changes: [{ capability: "finance.manage", enabled: true }],
  }), /no es válida para el rol/);
  assert.equal(store.commits.length, 0);
  assert.equal(resolveEffectiveCapabilities("COORDINATOR", [{ capability: "finance.manage", enabled: true }]).has("finance.manage"), false);
  assert.equal(resolveEffectiveCapabilities("COORDINATOR", [{ capability: "analytics.view", enabled: true }]).has("analytics.view"), true);
});

test("mantiene SUPER_ADMIN y accesos críticos de ADMIN protegidos", () => {
  const superAdmin = resolveEffectiveCapabilities("SUPER_ADMIN", [{ capability: "roles.permissions.manage", enabled: false }]);
  const admin = resolveEffectiveCapabilities("ADMIN", [
    { capability: "roles.permissions.manage", enabled: false },
    { capability: "tenant.settings.manage", enabled: false },
  ]);
  assert.equal(superAdmin.has("roles.permissions.manage"), true);
  assert.equal(admin.has("roles.permissions.manage"), true);
  assert.equal(admin.has("tenant.settings.manage"), true);
});

test("PARENT solo obtiene capacidades child seguras y no acepta capacidades institucionales", () => {
  const effective = resolveEffectiveCapabilities("PARENT", [{ capability: "student.portal.view", enabled: true }, { capability: "course.view", enabled: true }]);
  assert.equal(effective.has("child.portal.view"), true);
  assert.equal(effective.has("child.academics.view"), true);
  assert.equal(effective.has("child.finance.view"), false);
  assert.equal(effective.has("student.portal.view"), false);
  assert.equal(effective.has("course.view"), false);
});

test("rechaza rol protegido, capability desconocida, self-lockout y escalamiento", async () => {
  const store = new MemoryPermissionStore();
  await rejectsPolicy(() => persistRolePermissions(store, { actor: adminActor(), targetRole: "SUPER_ADMIN", changes: [{ capability: "course.view", enabled: true }] }), /SUPER_ADMIN/);
  await rejectsPolicy(() => persistRolePermissions(store, { actor: adminActor(), targetRole: "COORDINATOR", changes: [{ capability: "inventada", enabled: true }] }), /desconocida/);
  await rejectsPolicy(() => persistRolePermissions(store, { actor: adminActor(), targetRole: "ADMIN", changes: [{ capability: "roles.permissions.manage", enabled: false }] }), /Solo SUPER_ADMIN/);
  await rejectsPolicy(() => persistRolePermissions(store, { actor: { ...adminActor("institution-a", "COORDINATOR"), capabilities: new Set(["roles.permissions.manage", "course.view"]) }, targetRole: "COORDINATOR", changes: [{ capability: "roles.permissions.manage", enabled: false }] }), /no es válida|propio acceso/);
  await rejectsPolicy(() => persistRolePermissions(store, { actor: { ...adminActor(), capabilities: new Set(["roles.permissions.manage"]) }, targetRole: "TEACHER", changes: [{ capability: "course.manage", enabled: true }] }), /conceder ni revocar/);
});

test("preserva capacidades fuera de la autoridad del actor y rechaza su manipulación explícita", async () => {
  const store = new MemoryPermissionStore();
  store.seed("institution-a", "COORDINATOR", [{ capability: "analytics.view", enabled: true }]);
  const actor = { ...adminActor(), capabilities: new Set<Capability>(["roles.permissions.manage", "course.view"]) };

  const effective = await persistRolePermissions(store, {
    actor,
    targetRole: "COORDINATOR",
    changes: [{ capability: "course.view", enabled: false }],
  });
  assert.equal(effective.has("analytics.view"), true);
  assert.deepEqual(store.commits[0]?.writes.map((write) => write.capability), ["course.view"]);
  assert.equal((await store.load("institution-a", "COORDINATOR")).find((row) => row.capability === "analytics.view")?.enabled, true);

  await rejectsPolicy(() => persistRolePermissions(store, {
    actor,
    targetRole: "COORDINATOR",
    changes: [{ capability: "analytics.view", enabled: false }],
  }), /conceder ni revocar/);
  assert.equal(store.commits.length, 1);
  assert.equal((await store.load("institution-a", "COORDINATOR")).find((row) => row.capability === "analytics.view")?.enabled, true);
});

test("persiste deltas por institución y rol con actor auditable sin contaminar otro tenant", async () => {
  const store = new MemoryPermissionStore();
  await persistRolePermissions(store, { actor: adminActor("institution-a"), targetRole: "COORDINATOR", changes: [{ capability: "analytics.view", enabled: true }] });
  await persistRolePermissions(store, { actor: { ...adminActor("institution-b"), id: "actor-2" }, targetRole: "COORDINATOR", changes: [{ capability: "analytics.view", enabled: false }] });

  assert.equal((await store.load("institution-a", "COORDINATOR")).find((row) => row.capability === "analytics.view")?.enabled, true);
  assert.equal((await store.load("institution-b", "COORDINATOR")).find((row) => row.capability === "analytics.view")?.enabled, false);
  assert.equal(store.commits[0]?.updatedById, "actor-1");
  assert.equal(store.commits[1]?.updatedById, "actor-2");
  assert.ok(store.commits.every((commit) => commit.writes.every((row) => row.institutionId === commit.institutionId)));
});

test("solo persiste cambios explícitos y calcula el resultado efectivo", async () => {
  const store = new MemoryPermissionStore();
  const effective = await persistRolePermissions(store, { actor: adminActor(), targetRole: "TEACHER", changes: [{ capability: "course.manage", enabled: false }, { capability: "announcement.publish", enabled: true }] });
  assert.equal(store.commits[0]?.writes.length, 2);
  assert.equal(effective.has("course.view"), true);
  assert.equal(effective.has("announcement.publish"), true);
  assert.equal(effective.has("course.manage"), false);
});
