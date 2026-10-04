import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROLE_ALLOWED_CAPABILITIES, resolveEffectiveCapabilities, type Capability } from "../src/lib/capabilities";
import { GuardianFlagPolicyError, applyGuardianFlagChanges, assertGuardianFlagsWithinAuthority, canTransitionGuardianship, canViewGuardianArea, selectActiveGuardianLink, type GuardianFlagValues, type GuardianLink } from "../src/lib/guardianship-policy";
import { navigationForRole } from "../src/lib/ux";

const link = (overrides: Partial<GuardianLink> = {}): GuardianLink => ({
  id: "link-1",
  institutionId: "tenant-a",
  parentId: "parent-a",
  studentId: "student-a",
  status: "ACTIVE",
  canViewAcademics: true,
  canViewAttendance: false,
  canViewSchedule: false,
  canViewAnnouncements: false,
  canViewFinance: false,
  ...overrides,
});
const caps = (...values: Capability[]) => new Set(values);
const parentCaps = caps("child.portal.view", "child.academics.view", "child.attendance.view", "child.schedule.view", "child.announcements.view", "child.finance.view");

test("PARENT solo admite capacidades child y finanzas queda deshabilitada por defecto", () => {
  const effective = resolveEffectiveCapabilities("PARENT");
  assert.equal(effective.has("child.portal.view"), true);
  assert.equal(effective.has("child.academics.view"), true);
  assert.equal(effective.has("child.finance.view"), false);
  for (const forbidden of ["course.view", "course.manage", "course.roster.view", "people.view", "admissions.manage", "analytics.view", "tenant.settings.manage", "roles.permissions.manage"] as Capability[]) {
    assert.equal(ROLE_ALLOWED_CAPABILITIES.PARENT.has(forbidden), false);
  }
});

test("selecciona únicamente vínculo ACTIVE del mismo tenant, padre e hijo", () => {
  const links = [
    link({ id: "pending", status: "PENDING" }),
    link({ id: "revoked", status: "REVOKED" }),
    link({ id: "other-parent", parentId: "parent-b" }),
    link({ id: "other-tenant", institutionId: "tenant-b" }),
    link({ id: "other-child", studentId: "student-b" }),
    link({ id: "expected" }),
  ];
  assert.equal(selectActiveGuardianLink(links, { institutionId: "tenant-a", parentId: "parent-a" }, "student-a")?.id, "expected");
  assert.equal(selectActiveGuardianLink(links, { institutionId: "tenant-a", parentId: "parent-x" }, "student-a"), null);
  assert.equal(selectActiveGuardianLink(links, { institutionId: "tenant-x", parentId: "parent-a" }, "student-a"), null);
  assert.equal(selectActiveGuardianLink([], { institutionId: "tenant-a", parentId: "parent-a" }, "student-a"), null);
});

test("dos hijos pueden tener permisos independientes y cada área exige capability más flag", () => {
  const first = link({ id: "first", studentId: "student-a", canViewAcademics: true, canViewAttendance: false });
  const second = link({ id: "second", studentId: "student-b", canViewAcademics: false, canViewAttendance: true });
  assert.equal(canViewGuardianArea(selectActiveGuardianLink([first, second], { institutionId: "tenant-a", parentId: "parent-a" }, "student-a"), parentCaps, "academics"), true);
  assert.equal(canViewGuardianArea(first, parentCaps, "attendance"), false);
  assert.equal(canViewGuardianArea(second, parentCaps, "academics"), false);
  assert.equal(canViewGuardianArea(second, parentCaps, "attendance"), true);
  assert.equal(canViewGuardianArea(first, caps("child.portal.view"), "academics"), false);
});

test("finanzas exige capability institucional y consentimiento explícito del vínculo", () => {
  assert.equal(canViewGuardianArea(link({ canViewFinance: false }), parentCaps, "finance"), false);
  assert.equal(canViewGuardianArea(link({ canViewFinance: true }), caps("child.portal.view"), "finance"), false);
  assert.equal(canViewGuardianArea(link({ canViewFinance: true }), parentCaps, "finance"), true);
  assert.equal(canViewGuardianArea(link({ status: "REVOKED", canViewFinance: true }), parentCaps, "finance"), false);
});

test("navegación de PARENT expone Mis hijos pero nunca módulos institucionales", () => {
  const items = navigationForRole("PARENT");
  assert.ok(items.some((item) => item.href === "/dashboard/hijos" && item.label === "Mis hijos"));
  for (const forbidden of ["/dashboard/aula", "/dashboard/gestion", "/dashboard/pagos", "/dashboard/analitica", "/dashboard/configuracion"]) {
    assert.equal(items.some((item) => item.href === forbidden), false);
  }
});

test("crear no permite flags true fuera de las capacidades del manager", () => {
  const none: GuardianFlagValues = { canViewAcademics: false, canViewAttendance: false, canViewSchedule: false, canViewAnnouncements: false, canViewFinance: false };
  assert.doesNotThrow(() => assertGuardianFlagsWithinAuthority(none, caps("guardianship.manage")));
  assert.throws(() => assertGuardianFlagsWithinAuthority({ ...none, canViewFinance: true }, caps("guardianship.manage", "child.academics.view")), GuardianFlagPolicyError);
  assert.throws(() => assertGuardianFlagsWithinAuthority({ ...none, canViewAcademics: true }, caps("guardianship.manage", "child.finance.view")), GuardianFlagPolicyError);
});

test("actualizar preserva flags fuera de autoridad y rechaza grant o revoke manipulados", () => {
  const current: GuardianFlagValues = { canViewAcademics: true, canViewAttendance: false, canViewSchedule: false, canViewAnnouncements: false, canViewFinance: true };
  const manager = caps("guardianship.manage", "child.attendance.view");
  const next = applyGuardianFlagChanges(current, [{ flag: "canViewAttendance", enabled: true }], manager);
  assert.equal(next.canViewAttendance, true);
  assert.equal(next.canViewAcademics, true);
  assert.equal(next.canViewFinance, true);
  assert.throws(() => applyGuardianFlagChanges(current, [{ flag: "canViewFinance", enabled: false }], manager), GuardianFlagPolicyError);
  assert.throws(() => applyGuardianFlagChanges(current, [{ flag: "canViewAcademics", enabled: false }], manager), GuardianFlagPolicyError);
  assert.throws(() => applyGuardianFlagChanges(current, [{ flag: "canViewFinance", enabled: true }], manager), GuardianFlagPolicyError);
});

test("activar exige autoridad sobre todos los flags true y revocar sigue siendo una reducción permitida", () => {
  const configured: GuardianFlagValues = { canViewAcademics: true, canViewAttendance: false, canViewSchedule: false, canViewAnnouncements: false, canViewFinance: true };
  assert.throws(() => assertGuardianFlagsWithinAuthority(configured, caps("guardianship.manage", "child.academics.view")), GuardianFlagPolicyError);
  assert.doesNotThrow(() => assertGuardianFlagsWithinAuthority(configured, caps("guardianship.manage", "child.academics.view", "child.finance.view")));
  assert.equal(canTransitionGuardianship("PENDING", "activate"), true);
  assert.equal(canTransitionGuardianship("ACTIVE", "activate"), false);
  assert.equal(canTransitionGuardianship("PENDING", "revoke"), true);
  assert.equal(canTransitionGuardianship("ACTIVE", "revoke"), true);
  assert.equal(canTransitionGuardianship("REVOKED", "revoke"), false);
  assert.equal(canTransitionGuardianship("REVOKED", "update"), false);
});

test("schema y migración hacen PENDING y todas las banderas opt-in", () => {
  const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
  const migration = readFileSync(join(process.cwd(), "prisma", "migrations", "20261003234000_guardianship", "migration.sql"), "utf8");
  assert.match(schema, /model Guardianship \{/);
  assert.match(schema, /status\s+GuardianshipStatus\s+@default\(PENDING\)/);
  for (const field of ["canViewAcademics", "canViewAttendance", "canViewSchedule", "canViewAnnouncements", "canViewFinance"]) assert.match(schema, new RegExp(`${field}\\s+Boolean\\s+@default\\(false\\)`));
  assert.match(migration, /DEFAULT 'PENDING'/);
  assert.match(migration, /"canViewFinance" BOOLEAN NOT NULL DEFAULT false/);
  assert.match(schema, /version\s+Int\s+@default\(0\)/);
  assert.match(migration, /"version" INTEGER NOT NULL DEFAULT 0/);
  assert.ok("20261003231500_role_capability_overrides" < "20261003234000_guardianship");
});

test("acciones validan roles y tenant transaccionalmente y auditan activación y revocación", () => {
  const source = readFileSync(join(process.cwd(), "src", "app", "dashboard", "configuracion", "tutores", "actions.ts"), "utf8");
  assert.match(source, /db\.\$transaction/);
  assert.match(source, /institutionId: actor\.institutionId, role: "PARENT", status: "ACTIVE"/);
  assert.match(source, /institutionId: actor\.institutionId, role: "STUDENT", status: "ACTIVE"/);
  assert.match(source, /status: "PENDING"/);
  assert.match(source, /GUARDIANSHIP_ACTIVATED/);
  assert.match(source, /GUARDIANSHIP_REVOKED/);
  assert.match(source, /changes: \{ before: snapshot\(before\), after: snapshot\(after\) \}/);
  assert.match(source, /assertGuardianFlagsWithinAuthority\(requestedFlags, actor\.capabilities\)/);
  assert.match(source, /applyGuardianFlagChanges\(snapshotFlags\(before\), parsed\.data\.changes, actor\.capabilities\)/);
  assert.match(source, /assertGuardianFlagsWithinAuthority\(snapshotFlags\(before\), actor\.capabilities\)/);
  assert.match(source, /tx\.guardianship\.updateMany/);
  assert.match(source, /updatedAt: before\.updatedAt/);
  assert.match(source, /version: before\.version/);
  assert.match(source, /version: \{ increment: 1 \}/);
  assert.match(source, /changed\.count !== 1/);
  assert.match(source, /status: "PENDING", updatedAt: before\.updatedAt/);
  assert.doesNotMatch(source, /tx\.guardianship\.update\(/);
  assert.match(source, /La revocación es terminal en este MVP/);
});

test("DAL deriva identidad del padre y responde null a IDs sin vínculo", () => {
  const source = readFileSync(join(process.cwd(), "src", "lib", "guardian-portal.ts"), "utf8");
  assert.match(source, /parentId: parent\.id/);
  assert.match(source, /studentId,/);
  assert.match(source, /status: "ACTIVE"/);
  assert.match(source, /student: \{ institutionId: parent\.institutionId, role: "STUDENT", status: "ACTIVE" \}/);
  assert.match(source, /if \(!guardianship\) return null/);
  assert.doesNotMatch(source, /select: \{.*email: true/);
});
