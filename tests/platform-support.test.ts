import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createRequire } from "node:module";
import type { Prisma } from "@prisma/client";
const require = createRequire(import.meta.url);
const { loadWithStubs } = require("./helpers/load-with-stubs.cjs");
const OPERATOR = "support@edukana.test";
type Row = { id: string; action: string; institutionId: string; entity: string; entityId: string; createdAt: Date; changes: Prisma.JsonValue };
const audit = new Map<string, Row>();
let readCalls = 0;
let dbCalls = 0;
const service: typeof import("@/server/platform/support") = loadWithStubs("src/server/platform/support.ts", {
  "@/lib/db": { db: {
    institution: { findUnique: async ({ where }: { where: { id: string } }) => { dbCalls++; return where.id === "a" ? { name: "Institución A" } : null; } },
    auditLog: {
      findUnique: async ({ where }: { where: { id: string } }) => { dbCalls++; return audit.get(where.id) ?? null; },
      create: async ({ data }: { data: Row }) => { dbCalls++; audit.set(data.id, data); return data; },
      createMany: async ({ data, skipDuplicates }: { data: Row; skipDuplicates: boolean }) => {
        dbCalls++; assert.equal(skipDuplicates, true);
        if (audit.has(data.id)) return { count: 0 };
        audit.set(data.id, data); return { count: 1 };
      },
    },
  } },
  "@/server/admin-home": { getAdminHome: async (id: string) => { readCalls++; return { institutionName: `Institución ${id}`, numbers: {} }; } },
});
const t = new Date("2026-10-09T20:00:00Z");
beforeEach(() => { process.env.PLATFORM_OPERATOR_EMAILS = OPERATOR; audit.clear(); readCalls = 0; dbCalls = 0; });
async function enter() {
  const result = await service.startSupportView(OPERATOR, "a", "Institución A", t);
  assert.ok(result.ok);
  return result;
}

test("support rejects a non-operator before any database read or audit write", async () => {
  assert.equal((await service.startSupportView("admin@a.test", "a", "Institución A", t)).ok, false);
  assert.equal(await service.readSupportView(null, "f".repeat(64), "a", "read", t), null);
  assert.equal(await service.stopSupportView("admin@a.test", "f".repeat(64), t), null);
  assert.equal(dbCalls, 0);
});
test("support requires the exact written institution name and an existing institution", async () => {
  assert.equal((await service.startSupportView(OPERATOR, "a", "Institución B", t)).ok, false);
  assert.equal((await service.startSupportView(OPERATOR, "b", "Institución A", t)).ok, false);
  assert.equal(audit.size, 0);
});
test("support uses an opaque ticket, audits safe metadata and only reads the target institution", async () => {
  const result = await enter();
  assert.equal(result.expiresAt.getTime() - t.getTime(), 30 * 60_000);
  assert.equal(JSON.stringify([...audit.values()]).includes(result.ticket), false);
  assert.equal(await service.readSupportView(OPERATOR, result.ticket, "b", "read", t), null);
  assert.equal(readCalls, 0);
  assert.ok(await service.readSupportView(OPERATOR, result.ticket, "a", "read", t));
  assert.equal(readCalls, 1);
  assert.equal([...audit.values()][0].action, "PLATFORM_SUPPORT_ENTERED");
  assert.equal((Object([...audit.values()][0].changes)).operator, OPERATOR);
});
test("support rejects write operations without reaching domain data", async () => {
  const { ticket } = await enter();
  for (const operation of ["write", "create", "update", "delete"]) {
    await assert.rejects(() => service.readSupportView(OPERATOR, ticket, "a", operation, t), /solo lectura/);
  }
  assert.equal(readCalls, 0);
  assert.equal(audit.size, 1);
});
test("support expires at exactly 30 minutes, records expiry once, and never reads expired data", async () => {
  const { ticket, expiresAt } = await enter();
  assert.ok(await service.readSupportView(OPERATOR, ticket, "a", "read", new Date(expiresAt.getTime() - 1)));
  assert.equal(await service.readSupportView(OPERATOR, ticket, "a", "read", expiresAt), null);
  assert.equal(await service.readSupportView(OPERATOR, ticket, "a", "read", expiresAt), null);
  assert.equal(readCalls, 1);
  assert.equal(audit.size, 2);
  assert.equal([...audit.values()][1].action, "PLATFORM_SUPPORT_EXITED");
  assert.equal(Object([...audit.values()][1].changes).reason, "expired");
});
test("support exit revokes replay and is idempotent", async () => {
  const { ticket } = await enter();
  assert.equal(await service.stopSupportView(OPERATOR, ticket, t), "a");
  assert.equal(await service.stopSupportView(OPERATOR, ticket, t), null);
  assert.equal(await service.readSupportView(OPERATOR, ticket, "a", "read", t), null);
  assert.equal(audit.size, 2);
});
test("ticket manipulation, another operator and live allowlist removal fail closed", async () => {
  const { ticket } = await enter();
  assert.equal(await service.readSupportView(OPERATOR, "f".repeat(64), "a", "read", t), null);
  process.env.PLATFORM_OPERATOR_EMAILS = `${OPERATOR},other@edukana.test`;
  assert.equal(await service.readSupportView("other@edukana.test", ticket, "a", "read", t), null);
  process.env.PLATFORM_OPERATOR_EMAILS = "";
  assert.equal(await service.readSupportView(OPERATOR, ticket, "a", "read", t), null);
  assert.equal(readCalls, 0);
});

test("support parallel exits and expiry use atomic duplicate-safe insertion and retain first event", async () => {
  const { ticket, expiresAt } = await enter();
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => i % 2
    ? service.stopSupportView(OPERATOR, ticket, expiresAt)
    : service.readSupportView(OPERATOR, ticket, "a", "read", expiresAt)));
  assert.ok(results.every((value) => value === null || value === "a"));
  const exits = [...audit.values()].filter((row) => row.action === "PLATFORM_SUPPORT_EXITED");
  assert.equal(exits.length, 1);
  const original = JSON.stringify(exits[0]);
  await service.stopSupportView(OPERATOR, ticket, new Date(expiresAt.getTime() + 1000));
  assert.equal(JSON.stringify([...audit.values()].find((row) => row.action === "PLATFORM_SUPPORT_EXITED")), original);
  assert.equal(readCalls, 0);
});
