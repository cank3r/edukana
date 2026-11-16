import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getInstitutionFeatures, updateInstitutionFeatures } from "@/server/platform/features";
import { getPlatformSales } from "@/server/platform/sales";
import { getOperatorPublicCourses, listIndependentTeachers } from "@/server/platform/independent-report";
import { setInstitutionAiEnabled } from "@/server/ai/access";
import { findBrand, getPublicCourse, listPublicCourses } from "@/server/catalog/public";
import { requestCourse } from "@/server/catalog/checkout";
import { A, B, ensureSeed } from "./setup";

const OPERATOR = "features-operator@edukana.test";
const input = { ai: false, catalog: false, commissionPercent: 12.5 };
let saved: Prisma.InputJsonValue;
let oldOperators: string | undefined;
let slug: string;
let savedStatus: "ACTIVE" | "SUSPENDED";
before(async () => {
  await ensureSeed();
  oldOperators = process.env.PLATFORM_OPERATOR_EMAILS;
  process.env.PLATFORM_OPERATOR_EMAILS = OPERATOR;
  const institution = await db.institution.findUniqueOrThrow({ where: { id: A.institutionId } });
  savedStatus = institution.status;
  saved = institution.settings as Prisma.InputJsonValue;
  slug = institution.slug;
});
beforeEach(async () => {
  await db.institution.update({ where: { id: A.institutionId }, data: { status: "ACTIVE", settings: {
    kind: "INDEPENDENT", branding: { example: "preserve" }, ai: { enabled: true, other: "preserve" },
    platform: { other: "preserve" },
  } } });
  await db.auditLog.deleteMany({ where: { institutionId: A.institutionId, action: "PLATFORM_FEATURES_UPDATED" } });
});
after(async () => {
  await db.institution.update({ where: { id: A.institutionId }, data: { settings: saved, status: savedStatus } });
  await db.auditLog.deleteMany({ where: { institutionId: A.institutionId, action: "PLATFORM_FEATURES_UPDATED" } });
  if (oldOperators === undefined) delete process.env.PLATFORM_OPERATOR_EMAILS;
  else process.env.PLATFORM_OPERATOR_EMAILS = oldOperators;
  await db.$disconnect();
});

test("features: non-operators cannot read reports or change settings", async () => {
  for (const email of [null, "", "admin@a.test", "student@a.test"]) {
    assert.equal((await updateInstitutionFeatures(email, A.institutionId, input)).ok, false);
    assert.equal(await getPlatformSales(email), null);
    assert.equal(await listIndependentTeachers(email), null);
    assert.equal(await getOperatorPublicCourses(email, A.institutionId), null);
  }
  assert.equal((await getInstitutionFeatures(A.institutionId)).ai, true);
  assert.equal(await db.auditLog.count({ where: { institutionId: A.institutionId, action: "PLATFORM_FEATURES_UPDATED" } }), 0);
});
test("features: operator disable locks administrator, preserves other settings, audits and isolates", async () => {
  const other = await getInstitutionFeatures(B.institutionId);
  assert.equal((await updateInstitutionFeatures(OPERATOR, A.institutionId, input)).ok, true);
  assert.deepEqual(await getInstitutionFeatures(A.institutionId), { ...input, aiLocked: true });
  assert.deepEqual(await setInstitutionAiEnabled(A.admin, true), { ok: false, message: "Desactivado por Edukana" });
  assert.equal((await getInstitutionFeatures(A.institutionId)).ai, false);
  assert.deepEqual(await getInstitutionFeatures(B.institutionId), other);
  const institution = await db.institution.findUniqueOrThrow({ where: { id: A.institutionId } });
  assert.deepEqual(institution.settings, { kind: "INDEPENDENT", branding: { example: "preserve" },
    ai: { enabled: false, other: "preserve" }, platform: { other: "preserve", aiLocked: true, catalogEnabled: false, commissionPercent: 12.5 } });
  const log = await db.auditLog.findFirstOrThrow({ where: { institutionId: A.institutionId, action: "PLATFORM_FEATURES_UPDATED" } });
  assert.equal(log.entity, "Institution");
  assert.equal(log.entityId, A.institutionId);
  const changes = log.changes as Prisma.JsonObject;
  assert.equal(changes.operator, OPERATOR);
  assert.deepEqual(changes.after, { ...input, aiLocked: true });
  assert.ok(changes.before);
});
test("features: operator enable removes lock and the institution can toggle again", async () => {
  await updateInstitutionFeatures(OPERATOR, A.institutionId, input);
  await updateInstitutionFeatures(OPERATOR, A.institutionId, { ...input, ai: true });
  assert.equal((await setInstitutionAiEnabled(A.admin, false)).ok, true);
  assert.equal((await setInstitutionAiEnabled(A.admin, true)).ok, true);
});
test("features: disabling catalog hides brand, lists, detail, and rejects forged checkout", async () => {
  await updateInstitutionFeatures(OPERATOR, A.institutionId, input);
  assert.equal(await findBrand(slug), null);
  assert.deepEqual(await listPublicCourses(A.institutionId), []);
  assert.equal(await getPublicCourse(A.institutionId, A.courseId), null);
  assert.deepEqual(await requestCourse({ slug, courseId: A.courseId, name: "Comprador Prueba",
    email: "features-buyer@test.invalid", ip: "127.0.0.1" }), { ok: false, message: "Este curso ya no está disponible." });
});
test("features: invalid commission and missing institution fail without audit writes", async () => {
  for (const commissionPercent of [-1, 101, NaN, Infinity]) {
    assert.equal((await updateInstitutionFeatures(OPERATOR, A.institutionId, { ...input, commissionPercent })).ok, false);
  }
  assert.equal((await updateInstitutionFeatures(OPERATOR, "missing-feature-institution", input)).ok, false);
  assert.deepEqual(await getInstitutionFeatures("missing-feature-institution"), { ai: false, catalog: false, aiLocked: true, commissionPercent: 0 });
  assert.equal(await db.auditLog.count({ where: { institutionId: A.institutionId, action: "PLATFORM_FEATURES_UPDATED" } }), 0);
});
test("features: concurrent operator lock and institution enable preserve the final lock", async () => {
  await Promise.all([updateInstitutionFeatures(OPERATOR, A.institutionId, input), setInstitutionAiEnabled(A.admin, true)]);
  assert.equal((await getInstitutionFeatures(A.institutionId)).aiLocked, true);
  assert.equal((await getInstitutionFeatures(A.institutionId)).ai, false);
});
test("independent report scopes by kind, includes owner and respects search", async () => {
  const rows = await listIndependentTeachers(OPERATOR);
  assert.ok(rows?.some((row) => row.id === A.institutionId && row.email && row.teacherName));
  assert.deepEqual(await listIndependentTeachers(OPERATOR, "missing-unique-search-feature"), []);
});


test("features: suspension blocks public reads and forged checkout even when catalog is enabled", async () => {
  await db.institution.update({ where: { id: A.institutionId }, data: { status: "SUSPENDED" } });
  assert.equal(await findBrand(slug), null);
  assert.deepEqual(await listPublicCourses(A.institutionId), []);
  assert.equal(await getPublicCourse(A.institutionId, A.courseId), null);
  assert.deepEqual(await requestCourse({ slug, courseId: A.courseId, name: "Comprador Prueba",
    email: "features-buyer@test.invalid", ip: "127.0.0.1" }), { ok: false, message: "Este curso ya no está disponible." });
});

test("sales: includes only paid orders inside UTC month, separates currencies and estimates commission", async () => {
  const prefix = "bo_d_sales_";
  await updateInstitutionFeatures(OPERATOR, A.institutionId, { ai: true, catalog: true, commissionPercent: 12.5 });
  const make = (suffix: string, currency: string, amountCents: number, paidAt: string, status = "PAID") => ({
    id: prefix + suffix, institutionId: A.institutionId, courseId: A.courseId, buyerId: A.student.id,
    currency, amountCents, paidAt: new Date(paidAt), status,
  });
  try {
    await db.courseOrder.createMany({ data: [
      make("dop", "DOP", 10000, "2080-12-01T00:00:00Z"),
      make("usd", "USD", 20000, "2080-12-31T23:59:59Z"),
      make("old", "DOP", 30000, "2080-11-30T23:59:59Z"),
      make("next", "DOP", 40000, "2081-01-01T00:00:00Z"),
      make("pending", "DOP", 50000, "2080-12-15T00:00:00Z", "PENDING"),
    ] });
    const rows = (await getPlatformSales(OPERATOR, new Date("2080-12-15T12:00:00Z")))!
      .filter((row) => row.institutionId === A.institutionId);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map(({ currency, count, grossCents, commissionCents, netCents }) =>
      ({ currency, count, grossCents, commissionCents, netCents })), [
      { currency: "DOP", count: 1, grossCents: 10000, commissionCents: 1250, netCents: 8750 },
      { currency: "USD", count: 1, grossCents: 20000, commissionCents: 2500, netCents: 17500 },
    ]);
  } finally {
    await db.courseOrder.deleteMany({ where: { id: { startsWith: prefix } } });
  }
});
