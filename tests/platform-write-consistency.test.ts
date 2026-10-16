import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { loadWithStubs } = require("./helpers/load-with-stubs.cjs");
const operator = "consistency@example.test";
const now = new Date("2026-10-09T00:00:00Z");
const end = new Date("2026-10-01T00:00:00Z");
let subscription: Record<string, unknown>;
let invoice: Record<string, unknown>;
let plan: Record<string, unknown>;
let notice: Record<string, unknown>;
const events: string[] = [];
const audits: Array<Record<string, unknown>> = [];
const tx = {
  $queryRaw: async (parts: TemplateStringsArray) => { events.push(`lock:${parts.join("?")}`); return []; },
  platformInvoice: {
    findFirstOrThrow: async () => ({ ...invoice }),
    update: async ({ data }: { data: Record<string, unknown> }) => (invoice = { ...invoice, ...data }),
  },
  institutionSubscription: {
    findUnique: async () => ({ ...subscription }),
    update: async ({ data }: { data: Record<string, unknown> }) => (subscription = { ...subscription, ...data }),
  },
  platformPlan: {
    findUniqueOrThrow: async () => { events.push("read:plan"); return { ...plan }; },
    update: async ({ data }: { data: Record<string, unknown> }) => (plan = { ...plan, ...data }),
  },
  platformAnnouncement: {
    findUnique: async () => { events.push("read:notice"); return { ...notice }; },
    update: async ({ data }: { data: Record<string, unknown> }) => (notice = { ...notice, ...data }),
  },
  auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => { audits.push(data); return data; } },
};
const stubs = { "@/lib/db": { db: { $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx) } } };
const billing: typeof import("@/server/platform/invoices") = loadWithStubs("src/server/platform/invoices.ts", stubs);
const plans: typeof import("@/server/platform/plans") = loadWithStubs("src/server/platform/plans.ts", stubs);
const notices: typeof import("@/server/platform/announcements") = loadWithStubs("src/server/platform/announcements.ts", stubs);
beforeEach(() => {
  process.env.PLATFORM_OPERATOR_EMAILS = operator;
  events.length = 0; audits.length = 0;
  subscription = { id: "sub", institutionId: "a", status: "PAST_DUE", currentPeriodEnd: end };
  invoice = { id: "invoice", institutionId: "a", status: "OPEN", periodStart: new Date("2026-09-01Z"), periodEnd: end };
  plan = { code: "FREE", name: "Free", priceCents: 0, currency: "DOP", maxStudents: null,
    maxStorageMb: null, aiRequestsPerMonth: null, features: { ai: true, catalog: true }, active: true };
  notice = { id: "notice", title: "Notice", body: "Details", level: "INFO", audience: "ALL",
    startsAt: new Date("2026-01-01Z"), endsAt: null };
});
const payment = { paymentMethod: "transferencia", paidAt: new Date("2026-09-20Z") };
test("paying expired debt does not reactivate a past-due subscription after cron", async () => {
  await billing.payPlatformInvoice(operator, "a", "invoice", payment, now);
  assert.equal(invoice.status, "PAID");
  assert.equal(subscription.status, "PAST_DUE");
  assert.equal(subscription.currentPeriodEnd, end);
  assert.equal(audits.length, 2);
});
test("paying an expired active period computes past-due without waiting for cron", async () => {
  subscription.status = "ACTIVE";
  await billing.payPlatformInvoice(operator, "a", "invoice", payment, now);
  assert.equal(subscription.status, "PAST_DUE");
});
test("paid period ending at now is active, preserving cron's exclusive expiry boundary", async () => {
  invoice.periodEnd = now;
  await billing.payPlatformInvoice(operator, "a", "invoice", payment, now);
  assert.equal(subscription.status, "ACTIVE");
  assert.equal(subscription.currentPeriodEnd, now);
});
test("payment never revives a canceled subscription", async () => {
  subscription.status = "CANCELED"; invoice.periodEnd = new Date("2026-11-01Z");
  await billing.payPlatformInvoice(operator, "a", "invoice", payment, now);
  assert.equal(subscription.status, "CANCELED");
  assert.equal(audits.length, 1);
});
test("plan mutation locks its row before reading the audit predecessor", async () => {
  await plans.updatePlatformPlan(operator, { ...plan, priceCents: 100 });
  assert.match(events[0], /SELECT "code" FROM "platform_plans" WHERE "code"::text = \? FOR UPDATE/);
  assert.equal(events[1], "read:plan");
  const changes = audits[0].changes as { before: { priceCents: number }; after: { priceCents: number } };
  assert.equal(changes.before.priceCents, 0); assert.equal(changes.after.priceCents, 100);
});
test("announcement edits lock before reading audit predecessor", async () => {
  await notices.savePlatformAnnouncement(operator, { ...notice, title: "Revised" }, "notice");
  assert.match(events[0], /SELECT "id" FROM "platform_announcements" WHERE "id" = \? FOR UPDATE/);
  assert.equal(events[1], "read:notice");
});
test("announcement ending locks before title confirmation and audit snapshot", async () => {
  await notices.endPlatformAnnouncement(operator, "notice", "Notice");
  assert.match(events[0], /SELECT "id" FROM "platform_announcements" WHERE "id" = \? FOR UPDATE/);
  assert.equal(events[1], "read:notice");
  assert.equal(audits[0].action, "PLATFORM_ANNOUNCEMENT_ENDED");
});
