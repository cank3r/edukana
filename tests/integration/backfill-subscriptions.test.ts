import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { backfillMissingSubscriptions } from "@/server/platform/backfill-subscriptions";
import { PLATFORM_TRIAL_DAYS } from "@/server/platform/plan-defaults";
import { ensureSeed } from "./setup";

const SLUG = "backfill-planes-prueba";
const NOW = new Date("2026-10-10T12:00:00.000Z");
let institutionId = "";
let withoutBefore = new Set<string>();

before(async () => {
  await ensureSeed();
  await db.institution.deleteMany({ where: { slug: SLUG } });
  // Instituciones que ya no tenían plan antes de la prueba: al final se les quita lo que la prueba les dio.
  withoutBefore = new Set((await db.institution.findMany({ where: { platformSubscription: null }, select: { id: true } })).map((i) => i.id));
  institutionId = (await db.institution.create({ data: { name: "Colegio sin plan", slug: SLUG, type: "SCHOOL" }, select: { id: true } })).id;
});

after(async () => {
  const touched = [...withoutBefore];
  await db.auditLog.deleteMany({ where: { institutionId: { in: touched }, action: "PLATFORM_SUBSCRIPTION_TRIAL_CREATED", changes: { path: ["reason"], equals: "backfill" } } });
  await db.institutionSubscription.deleteMany({ where: { institutionId: { in: touched } } });
  await db.institution.deleteMany({ where: { slug: SLUG } });
});

test("asignar planes: en modo prueba solo lista y no crea nada", async () => {
  const result = await backfillMissingSubscriptions(db, { dryRun: true, now: NOW });
  assert.equal(result.created, 0);
  assert.ok(result.pending.some((row) => row.institutionId === institutionId && row.slug === SLUG));
  assert.equal(await db.institutionSubscription.count({ where: { institutionId } }), 0);
});

test("asignar planes: respeta un plan previo distinto de FREE", async () => {
  const other = await db.institution.create({ data: { name: "Instituto con plan", slug: `${SLUG}-pro`, type: "INSTITUTE", plan: "PRO" }, select: { id: true } });
  withoutBefore.add(other.id);
  await backfillMissingSubscriptions(db, { dryRun: false, now: NOW });
  const sub = await db.institutionSubscription.findUniqueOrThrow({ where: { institutionId: other.id } });
  assert.equal(sub.planCode, "PRO");
  assert.equal(sub.status, "TRIAL");
  await db.institutionSubscription.deleteMany({ where: { institutionId: other.id } });
  await db.auditLog.deleteMany({ where: { institutionId: other.id } });
  await db.institution.delete({ where: { id: other.id } });
  // Deja la institución de la siguiente prueba sin plan otra vez.
  await db.auditLog.deleteMany({ where: { institutionId, action: "PLATFORM_SUBSCRIPTION_TRIAL_CREATED" } });
  await db.institutionSubscription.deleteMany({ where: { institutionId } });
});

test("asignar planes: da prueba gratis FREE y deja bitácora; repetir no duplica", async () => {
  const existing = await db.institutionSubscription.findMany({ select: { id: true, institutionId: true, planCode: true, status: true, currentPeriodEnd: true } });

  const first = await backfillMissingSubscriptions(db, { dryRun: false, now: NOW });
  assert.ok(first.created >= 1);
  const sub = await db.institutionSubscription.findUniqueOrThrow({ where: { institutionId } });
  assert.equal(sub.planCode, "FREE");
  assert.equal(sub.status, "TRIAL");
  assert.equal(sub.priceCents, 0);
  assert.equal(sub.currentPeriodStart.getTime(), NOW.getTime());
  assert.equal(sub.currentPeriodEnd.getTime(), NOW.getTime() + PLATFORM_TRIAL_DAYS * 86400000);
  const audit = await db.auditLog.findFirst({ where: { institutionId, action: "PLATFORM_SUBSCRIPTION_TRIAL_CREATED" } });
  assert.equal((audit?.changes as { reason?: string } | null)?.reason, "backfill");

  // Las suscripciones que ya existían no cambian.
  for (const before of existing) {
    const now = await db.institutionSubscription.findUniqueOrThrow({ where: { id: before.id } });
    assert.deepEqual({ planCode: now.planCode, status: now.status, end: now.currentPeriodEnd.getTime() },
      { planCode: before.planCode, status: before.status, end: before.currentPeriodEnd.getTime() });
  }

  const second = await backfillMissingSubscriptions(db, { dryRun: false, now: NOW });
  assert.equal(second.created, 0);
  assert.equal(second.pending.length, 0);
  assert.equal(await db.institutionSubscription.count({ where: { institutionId } }), 1);
});
