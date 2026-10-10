import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { readSupportView, startSupportView, stopSupportView } from "@/server/platform/support";
import { AUDIT_PAGE_SIZE, listAuditLog } from "@/server/platform/audit-log";
import { A, B, ensureSeed } from "./setup";
const OPERATOR = "bo-e-support@edukana.test";
const oldOperators = process.env.PLATFORM_OPERATOR_EMAILS;
const auditIds: string[] = [];
const now = new Date("2026-10-09T20:00:00Z");
let name: string;
before(async () => {
  await ensureSeed(); process.env.PLATFORM_OPERATOR_EMAILS = OPERATOR;
  name = (await db.institution.findUniqueOrThrow({ where: { id: A.institutionId } })).name;
});
after(async () => {
  await db.auditLog.deleteMany({ where: { OR: [{ id: { in: auditIds } }, { changes: { path: ["operator"], equals: OPERATOR } }] } });
  if (oldOperators === undefined) delete process.env.PLATFORM_OPERATOR_EMAILS;
  else process.env.PLATFORM_OPERATOR_EMAILS = oldOperators;
  await db.$disconnect();
});
async function enter() {
  const result = await startSupportView(OPERATOR, A.institutionId, name, now);
  assert.ok(result.ok); return result;
}
test("support integration: denial and confirmation do not create audit grants", async () => {
  assert.equal((await startSupportView("admin@a.test", A.institutionId, name, now)).ok, false);
  assert.equal((await startSupportView(OPERATOR, A.institutionId, "wrong name", now)).ok, false);
  assert.equal(await listAuditLog("admin@a.test", {}), null);
});
test("support integration: reads correct institution, refuses writes and audits explicit exit", async () => {
  const { ticket } = await enter();
  assert.equal(await readSupportView(OPERATOR, ticket, B.institutionId, "read", now), null);
  const view = await readSupportView(OPERATOR, ticket, A.institutionId, "read", now);
  assert.equal(view?.home.institutionName, name);
  await assert.rejects(() => readSupportView(OPERATOR, ticket, A.institutionId, "write", now), /solo lectura/);
  assert.equal(await stopSupportView(OPERATOR, ticket, now), A.institutionId);
  assert.equal(await readSupportView(OPERATOR, ticket, A.institutionId, "read", now), null);
  const events = await listAuditLog(OPERATOR, { institutionId: A.institutionId, operator: OPERATOR });
  assert.ok(events?.rows.some((row) => row.action === "PLATFORM_SUPPORT_ENTERED"));
  assert.ok(events?.rows.some((row) => row.action === "PLATFORM_SUPPORT_EXITED"));
});
test("support integration: expiry is server enforced and records exit", async () => {
  const { ticket, expiresAt } = await enter();
  assert.equal(await readSupportView(OPERATOR, ticket, A.institutionId, "read", expiresAt), null);
  assert.equal(await stopSupportView(OPERATOR, ticket, expiresAt), null);
});
test("support integration: concurrent exits produce a single revocation row", async () => {
  const before = await db.auditLog.count({ where: { action: "PLATFORM_SUPPORT_EXITED", changes: { path: ["operator"], equals: OPERATOR } } });
  const { ticket } = await enter();
  await Promise.all(Array.from({ length: 12 }, () => stopSupportView(OPERATOR, ticket, now)));
  assert.equal(await db.auditLog.count({ where: { action: "PLATFORM_SUPPORT_EXITED", changes: { path: ["operator"], equals: OPERATOR } } }), before + 1);
});
test("support integration: expiry and manual exit race retain one revocation and deny replay", async () => {
  const before = await db.auditLog.count({ where: { action: "PLATFORM_SUPPORT_EXITED", changes: { path: ["operator"], equals: OPERATOR } } });
  const { ticket, expiresAt } = await enter();
  await Promise.all(Array.from({ length: 12 }, (_, i) => i % 2
    ? stopSupportView(OPERATOR, ticket, expiresAt)
    : readSupportView(OPERATOR, ticket, A.institutionId, "read", expiresAt)));
  assert.equal(await db.auditLog.count({ where: { action: "PLATFORM_SUPPORT_EXITED", changes: { path: ["operator"], equals: OPERATOR } } }), before + 1);
  assert.equal(await readSupportView(OPERATOR, ticket, A.institutionId, "read", expiresAt), null);
});
test("audit integration: stable cursor across identical timestamps, filters and no duplicated rows", async () => {
  for (let i = 0; i < AUDIT_PAGE_SIZE + 3; i++) {
    const row = await db.auditLog.create({ data: {
      institutionId: B.institutionId, action: "PLATFORM_E_PAGINATION", entity: "Institution", entityId: B.institutionId,
      changes: { operator: OPERATOR }, createdAt: now,
    } }); auditIds.push(row.id);
  }
  const filters = { institutionId: B.institutionId, action: "PLATFORM_E_PAGINATION", operator: OPERATOR, from: "2026-10-09", to: "2026-10-09" };
  const page = await listAuditLog(OPERATOR, filters);
  assert.equal(page?.rows.length, AUDIT_PAGE_SIZE); assert.ok(page?.nextCursor);
  const second = await listAuditLog(OPERATOR, { ...filters, cursor: page.nextCursor });
  assert.equal(second?.rows.length, 3); assert.equal(second?.nextCursor, null);
  assert.equal(new Set([...page.rows, ...second!.rows].map((row) => row.id)).size, AUDIT_PAGE_SIZE + 3);
  assert.ok(page.rows.every((row) => row.institutionId === B.institutionId && row.href === `/operador/${B.institutionId}`));
});
