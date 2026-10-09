import assert from "node:assert/strict";
import { test } from "node:test";
import { platformPlanSchema, requirePlatformOperator } from "@/server/platform/plans";
import { invoicePeriodSchema } from "@/server/platform/invoices";
import { GET } from "@/app/api/cron/plataforma/route";

test("billing authorization fails closed without operator allowlist", () => {
  const previous = process.env.PLATFORM_OPERATOR_EMAILS;
  delete process.env.PLATFORM_OPERATOR_EMAILS;
  assert.throws(() => requirePlatformOperator("admin@example.test"), /permiso/);
  assert.throws(() => requirePlatformOperator(null), /permiso/);
  process.env.PLATFORM_OPERATOR_EMAILS = "operator@example.test";
  assert.doesNotThrow(() => requirePlatformOperator("OPERATOR@example.test"));
  if (previous === undefined) delete process.env.PLATFORM_OPERATOR_EMAILS; else process.env.PLATFORM_OPERATOR_EMAILS = previous;
});
test("billing accepts integer cents and optional limits only", () => {
  const data = { code: "FREE", name: "Gratis", priceCents: 0, currency: "DOP", maxStudents: null,
    maxStorageMb: 0, aiRequestsPerMonth: 100, active: true, features: { ai: true, catalog: true } };
  assert.ok(platformPlanSchema.safeParse(data).success);
  for (const priceCents of [-1, 1.5, Infinity, 2147483648]) assert.equal(platformPlanSchema.safeParse({ ...data, priceCents }).success, false);
  assert.equal(platformPlanSchema.safeParse({ ...data, maxStudents: -1 }).success, false);
});
test("billing periods must be valid and move forward", () => {
  const start = new Date("2026-01-01Z"); const end = new Date("2026-02-01Z");
  assert.ok(invoicePeriodSchema.safeParse({ periodStart: start, periodEnd: end, dueDate: end }).success);
  assert.equal(invoicePeriodSchema.safeParse({ periodStart: end, periodEnd: start, dueDate: end }).success, false);
  assert.equal(invoicePeriodSchema.safeParse({ periodStart: start, periodEnd: start, dueDate: end }).success, false);
});
test("billing cron rejects missing configuration, absent and incorrect bearer", async () => {
  const before = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  assert.equal((await GET(new Request("https://example.test/api/cron/plataforma"))).status, 401);
  process.env.CRON_SECRET = "test-only-secret";
  for (const authorization of ["", "Bearer wrong", "Bearer test-only-secrex"]) {
    assert.equal((await GET(new Request("https://example.test/api/cron/plataforma", { headers: { authorization } }))).status, 401);
  }
  if (before === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = before;
});
