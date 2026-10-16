import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { loadWithStubs } = require("./helpers/load-with-stubs.cjs");
const service: typeof import("@/server/platform/audit-log") = loadWithStubs("src/server/platform/audit-log.ts");
test("audit filters platform actions by default, permits all, and exact action/operator/institution", () => {
  assert.deepEqual(service.auditWhere({}), { action: { startsWith: "PLATFORM_" } });
  assert.deepEqual(service.auditWhere({ action: "all" }), {});
  assert.deepEqual(service.auditWhere({ action: "PLATFORM_*" }), { action: { startsWith: "PLATFORM_" } });
  assert.deepEqual(service.auditWhere({ action: "PLATFORM_SUPPORT_ENTERED", institutionId: "a", operator: "ADMIN@TEST.COM" }), {
    action: "PLATFORM_SUPPORT_ENTERED", institutionId: "a", changes: { path: ["operator"], equals: "admin@test.com" },
  });
});
test("audit pagination is stable keyset with date and id ties; cursor does not override filters", () => {
  const createdAt = new Date("2026-10-09T20:00:00Z");
  const where = service.auditWhere({ institutionId: "a", cursor: service.auditCursor({ createdAt, id: "z" }) });
  assert.equal(where.institutionId, "a");
  assert.deepEqual(where.AND, [{ OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: "z" } }] }]);
});
test("audit rejects malformed cursors and impossible or inverted dates", () => {
  for (const cursor of ["invalid", Buffer.from("{}").toString("base64url"), "x".repeat(701)]) {
    assert.throws(() => service.auditWhere({ cursor }), /página/);
  }
  assert.throws(() => service.auditWhere({ from: "2026-02-30" }), /fechas/);
  assert.throws(() => service.auditWhere({ from: "2026-10-10", to: "2026-10-09" }), /fechas/);
  assert.deepEqual(service.auditWhere({ from: "2026-10-09", to: "2026-10-09" }).createdAt,
    { gte: new Date("2026-10-09T00:00:00Z"), lt: new Date("2026-10-10T00:00:00Z") });
});
test("audit safe entity links stay in operator routes without assuming a target dashboard session", () => {
  assert.equal(service.auditEntityHref({ entity: "Institution", entityId: "b", institutionId: "a" }), "/operador/a");
  assert.equal(service.auditEntityHref({ entity: "Unknown", entityId: "javascript:alert(1)", institutionId: null }), null);
});
test("audit rejects non-operators before data access", async () => {
  process.env.PLATFORM_OPERATOR_EMAILS = "operator@test.com";
  assert.equal(await service.listAuditLog("admin@test.com", {}), null);
});
