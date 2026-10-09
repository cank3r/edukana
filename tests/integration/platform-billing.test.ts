import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { createTrialSubscription, PLATFORM_TRIAL_DAYS, seedPlatformPlans } from "@/server/platform/plan-defaults";
import { listPlatformPlans, updatePlatformPlan, getInstitutionPlanFeatures } from "@/server/platform/plans";
import { changeInstitutionPlan, extendSubscription, expirePlatformSubscriptions } from "@/server/platform/subscriptions";
import { generatePlatformInvoice, payPlatformInvoice, voidPlatformInvoice, listPlatformInvoices } from "@/server/platform/invoices";
import { getInstitutionBilling, getInstitutionPlanUsage } from "@/server/platform/limits";
import { createInstitution } from "@/server/platform/institutions";
import { registerIndependentTeacher } from "@/server/platform/independent";
import { MemoryEmailProvider, setEmailProviderForTests } from "@/server/integrations/email";
import { ensureSeed } from "./setup";

const OP = "billing-operator@edukana.test";
const PREFIX = "bo-c-test";
const start = new Date("2025-01-01T00:00:00Z");
const end = new Date("2025-02-01T00:00:00Z");
let a: string; let b: string;
const savedEnv = { operator: process.env.PLATFORM_OPERATOR_EMAILS, independent: process.env.INDEPENDENT_SIGNUP_ENABLED };
before(async () => {
  await ensureSeed(); process.env.PLATFORM_OPERATOR_EMAILS = OP;
  setEmailProviderForTests(new MemoryEmailProvider());
  await db.$transaction(async (tx) => {
    await seedPlatformPlans(tx);
    a = (await tx.institution.create({ data: { name: "Facturación A", slug: `${PREFIX}-a` } })).id;
    b = (await tx.institution.create({ data: { name: "Facturación B", slug: `${PREFIX}-b` } })).id;
    await createTrialSubscription(tx, a, start); await createTrialSubscription(tx, b, start);
  });
});
after(async () => {
  const institutions = await db.institution.findMany({ where: { slug: { startsWith: PREFIX } }, select: { id: true } });
  await db.auditLog.deleteMany({ where: { institutionId: { in: institutions.map((row) => row.id) } } });
  await db.institution.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await db.identity.deleteMany({ where: { email: { endsWith: "@bo-c-test.invalid" } } });
  setEmailProviderForTests(null);
  if (savedEnv.operator === undefined) delete process.env.PLATFORM_OPERATOR_EMAILS; else process.env.PLATFORM_OPERATOR_EMAILS = savedEnv.operator;
  if (savedEnv.independent === undefined) delete process.env.INDEPENDENT_SIGNUP_ENABLED; else process.env.INDEPENDENT_SIGNUP_ENABLED = savedEnv.independent;
  await db.$disconnect();
});
async function reset() {
  await db.platformInvoice.deleteMany({ where: { institutionId: a } });
  await db.institutionSubscription.update({ where: { institutionId: a }, data: {
    currentPeriodStart: start, currentPeriodEnd: end, status: "TRIAL", planCode: "FREE", priceCents: 10000,
  } });
}
const period = { periodStart: end, periodEnd: new Date("2025-03-01Z"), dueDate: end };
const payment = { paymentMethod: "transferencia", reference: "TEST", paidAt: new Date("2025-02-10Z") };

test("billing: all operator services reject an institution administrator", async () => {
  const denied = "admin@a.test";
  for (const call of [
    () => listPlatformPlans(denied), () => updatePlatformPlan(denied, {}),
    () => changeInstitutionPlan(denied, a, {}), () => extendSubscription(denied, a, end),
    () => generatePlatformInvoice(denied, a, {}), () => payPlatformInvoice(denied, a, "fake", {}),
    () => voidPlatformInvoice(denied, a, "fake"), () => listPlatformInvoices(denied), () => getInstitutionBilling(denied, a),
  ]) await assert.rejects(call, /permiso/);
});
test("billing: trial constant and FREE feature lookup", async () => {
  const sub = await db.institutionSubscription.findUniqueOrThrow({ where: { institutionId: b } });
  assert.equal(sub.status, "TRIAL"); assert.equal(sub.planCode, "FREE");
  assert.equal(sub.currentPeriodEnd.getTime() - sub.currentPeriodStart.getTime(), PLATFORM_TRIAL_DAYS * 86400000);
  assert.deepEqual(await getInstitutionPlanFeatures(b), { ai: true, catalog: true });
  assert.equal(await getInstitutionPlanFeatures("absent"), null);
});
test("billing: paying next period extends subscription atomically and audits", async () => {
  await reset(); const invoice = await generatePlatformInvoice(OP, a, period);
  await payPlatformInvoice(OP, a, invoice.id, payment);
  const sub = await db.institutionSubscription.findUniqueOrThrow({ where: { institutionId: a } });
  assert.equal(sub.status, "ACTIVE"); assert.equal(sub.currentPeriodEnd.toISOString(), period.periodEnd.toISOString());
  const audit = await db.auditLog.findFirstOrThrow({ where: { action: "PLATFORM_INVOICE_PAID", entityId: invoice.id } });
  assert.equal((audit.changes as { operator: string }).operator, OP);
  await assert.rejects(() => payPlatformInvoice(OP, a, invoice.id, payment), /abierta/);
});
test("billing: paying current period activates without shortening it", async () => {
  await reset(); const invoice = await generatePlatformInvoice(OP, a, { ...period, periodStart: start, periodEnd: end });
  await payPlatformInvoice(OP, a, invoice.id, payment);
  const sub = await db.institutionSubscription.findUniqueOrThrow({ where: { institutionId: a } });
  assert.equal(sub.status, "ACTIVE"); assert.equal(sub.currentPeriodEnd.toISOString(), end.toISOString());
});
test("billing: foreign institution invoice cannot be paid or voided", async () => {
  await reset(); const invoice = await generatePlatformInvoice(OP, a, period);
  await assert.rejects(() => payPlatformInvoice(OP, b, invoice.id, payment));
  await assert.rejects(() => voidPlatformInvoice(OP, b, invoice.id));
  assert.equal((await db.platformInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).status, "OPEN");
  assert.ok((await getInstitutionBilling(OP, b)).invoices.every((row) => row.institutionId === b));
});
test("billing: VOID is never a payment and expired trial becomes past due without suspending", async () => {
  await reset(); const invoice = await generatePlatformInvoice(OP, a, period);
  await voidPlatformInvoice(OP, a, invoice.id);
  await assert.rejects(() => payPlatformInvoice(OP, a, invoice.id, payment), /abierta/);
  await expirePlatformSubscriptions(new Date("2025-02-15Z"));
  assert.equal((await db.institutionSubscription.findUniqueOrThrow({ where: { institutionId: a } })).status, "PAST_DUE");
  assert.ok(await db.institution.findUnique({ where: { id: a } }));
});
test("billing: paid old period cannot prevent next expiration or reactivate a later period", async () => {
  await reset(); const invoice = await generatePlatformInvoice(OP, a, { ...period, periodStart: start, periodEnd: end });
  await payPlatformInvoice(OP, a, invoice.id, payment);
  await expirePlatformSubscriptions(new Date("2025-02-15Z"));
  assert.equal((await db.institutionSubscription.findUniqueOrThrow({ where: { institutionId: a } })).status, "PAST_DUE");
});
test("billing: paid next period protects subscription, gap periods do not advance", async () => {
  await reset(); const invoice = await generatePlatformInvoice(OP, a, period);
  await payPlatformInvoice(OP, a, invoice.id, payment);
  await expirePlatformSubscriptions(new Date("2025-02-15Z"));
  assert.equal((await db.institutionSubscription.findUniqueOrThrow({ where: { institutionId: a } })).status, "ACTIVE");
  const gap = await generatePlatformInvoice(OP, a, { periodStart: new Date("2025-05-01Z"), periodEnd: new Date("2025-06-01Z"), dueDate: end });
  await payPlatformInvoice(OP, a, gap.id, payment);
  assert.equal((await db.institutionSubscription.findUniqueOrThrow({ where: { institutionId: a } })).currentPeriodEnd.toISOString(), period.periodEnd.toISOString());
});
test("billing: plan change requires written confirmation and synchronizes legacy enum", async () => {
  await assert.rejects(() => changeInstitutionPlan(OP, a, { planCode: "PRO", priceCents: 999, confirmation: "wrong" }), /nombre/);
  await changeInstitutionPlan(OP, a, { planCode: "PRO", priceCents: 999, confirmation: "Facturación A" });
  assert.equal((await db.institution.findUniqueOrThrow({ where: { id: a } })).plan, "PRO");
  assert.equal((await db.institutionSubscription.findUniqueOrThrow({ where: { institutionId: a } })).priceCents, 999);
  assert.ok((await getInstitutionPlanUsage(a))?.subscription.plan.code === "PRO");
});
test("billing: duplicate invoice and invalid money/periods are rejected", async () => {
  await reset(); await generatePlatformInvoice(OP, a, period);
  await assert.rejects(() => generatePlatformInvoice(OP, a, period), /Ya hay/);
  await assert.rejects(() => generatePlatformInvoice(OP, a, { ...period, periodEnd: start }));
  await assert.rejects(() => changeInstitutionPlan(OP, a, { planCode: "FREE", priceCents: -1, confirmation: "Facturación A" }));
});
test("billing: operator-created institutions receive 30-day FREE trials", async () => {
  const result = await createInstitution(OP, { name: "Trial operator", slug: `${PREFIX}-operator`, type: "SCHOOL",
    adminName: "Trial Admin", adminEmail: "admin@bo-c-test.invalid" });
  assert.ok(result.ok); if (!result.ok) return;
  const sub = await db.institutionSubscription.findUniqueOrThrow({ where: { institutionId: result.institutionId } });
  assert.equal(sub.status, "TRIAL"); assert.equal(sub.planCode, "FREE");
  assert.equal(sub.trialEndsAt?.getTime(), sub.currentPeriodStart.getTime() + 30 * 86400000);
});
test("billing: independent signup receives 30-day FREE trial", async () => {
  process.env.INDEPENDENT_SIGNUP_ENABLED = "true";
  const now = new Date();
  const result = await registerIndependentTeacher({ name: "Trial Teacher", spaceName: `${PREFIX}-independent`,
    email: "teacher@bo-c-test.invalid", password: "Trial-Password-2026!" }, "192.0.2.201", now);
  assert.ok(result.ok, result.ok ? "" : result.message); if (!result.ok) return;
  const sub = await db.institutionSubscription.findUniqueOrThrow({ where: { institutionId: result.institutionId } });
  assert.equal(sub.status, "TRIAL"); assert.equal(sub.planCode, "FREE");
  assert.equal(sub.trialEndsAt?.getTime(), now.getTime() + 30 * 86400000);
});
