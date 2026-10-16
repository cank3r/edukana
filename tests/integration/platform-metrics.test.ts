import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { getPlatformMetrics } from "@/server/platform/metrics";
import { A, ensureSeed } from "./setup";

const OPERATOR = "bo-a-operator@example.test";
const ids = ["bo-a-school-one", "bo-a-school-two", "bo-a-independent"];
const now = new Date("2032-04-20T12:00:00Z");
const old = new Date("2032-03-01T12:00:00Z");
let baseline: NonNullable<Awaited<ReturnType<typeof getPlatformMetrics>>>;

before(async () => {
  await ensureSeed();
  process.env.PLATFORM_OPERATOR_EMAILS = OPERATOR;
  baseline = (await getPlatformMetrics(OPERATOR, now))!;
  for (const [index, id] of ids.entries()) {
    await db.institution.create({ data: { id, name: id, slug: id, createdAt: index === 0 ? old : now,
      settings: index === 2 ? { kind: "INDEPENDENT" } : {} } });
    for (const role of ["ADMIN", "TEACHER", "STUDENT"] as const) {
      await db.user.create({ data: {
        id: `${id}-${role}`, institution: { connect: { id } }, name: role, email: `${id}-${role}@example.test`, role,
        identity: { create: { email: `${id}-${role}@example.test` } },
      } });
    }
  }
  await db.courseOrder.createMany({ data: [
    { id: "bo-a-paid-dop", institutionId: A.institutionId, courseId: A.courseId, buyerId: A.student.id, amountCents: 15000, currency: "DOP", status: "PAID", paidAt: now },
    { id: "bo-a-paid-usd", institutionId: A.institutionId, courseId: A.courseId, buyerId: A.student.id, amountCents: 2000, currency: "USD", status: "PAID", paidAt: now },
    { id: "bo-a-pending", institutionId: A.institutionId, courseId: A.courseId, buyerId: A.student.id, amountCents: 900000, currency: "DOP", status: "PENDING", paidAt: null },
  ] });
  await db.auditLog.create({ data: { institutionId: ids[1], userId: `${ids[1]}-ADMIN`, action: "AI_USED",
    entity: "Course", changes: { inputTokens: 123, outputTokens: 77 }, createdAt: now } });
});
after(async () => {
  await db.courseOrder.deleteMany({ where: { id: { startsWith: "bo-a-" } } });
  await db.auditLog.deleteMany({ where: { institutionId: { in: ids } } });
  await db.institution.deleteMany({ where: { id: { in: ids } } });
  await db.identity.deleteMany({ where: { email: { startsWith: "bo-a-" } } });
  delete process.env.PLATFORM_OPERATOR_EMAILS;
  await db.$disconnect();
});

test("tablero agrega dos instituciones y un independiente sin cargar personas", async () => {
  const result = (await getPlatformMetrics(OPERATOR, now))!;
  assert.equal(result.institutions - baseline.institutions, 3);
  assert.equal(result.independent - baseline.independent, 1);
  assert.equal(result.students - baseline.students, 3);
  assert.equal(result.teachers - baseline.teachers, 3);
  assert.equal(result.signups7 - baseline.signups7, 2);
  assert.equal(result.signups30 - baseline.signups30, 2);
  assert.equal(result.inactive14 - baseline.inactive14, 1);
  assert.equal(result.aiRequests - baseline.aiRequests, 1);
  assert.equal(result.aiTokens - baseline.aiTokens, 200);
  assert.equal(result.sales.find((row) => row.currency === "DOP")?.amountCents, 15000);
  assert.equal(result.sales.find((row) => row.currency === "USD")?.amountCents, 2000);
  assert.equal(result.sales.find((row) => row.currency === "DOP")?.count, 1);
  assert.ok(result.attention.some((row) => row.id === ids[0]));
});
test("un acceso registrado retira alerta histórica sin escribir desde el tablero", async () => {
  await db.auditLog.create({ data: { institutionId: ids[0], userId: `${ids[0]}-ADMIN`, action: "LOGIN_SUCCEEDED",
    entity: "User", entityId: `${ids[0]}-ADMIN`, changes: {}, createdAt: now } });
  const before = await db.auditLog.count();
  const result = (await getPlatformMetrics(OPERATOR, now))!;
  assert.ok(!result.attention.some((row) => row.id === ids[0]));
  assert.equal(await db.auditLog.count(), before);
});
test("administración institucional y sin sesión no consultan métricas", async () => {
  assert.equal(await getPlatformMetrics(null), null);
  assert.equal(await getPlatformMetrics(`${ids[0]}-ADMIN@example.test`), null);
});
