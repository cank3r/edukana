import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { loadWithStubs } = require("./helpers/load-with-stubs.cjs");
const operator = "consistency@example.test";
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
