import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import {
  savePlatformAnnouncement, endPlatformAnnouncement, listPlatformAnnouncements, getPlatformAnnouncement,
  getDashboardPlatformAnnouncements,
} from "@/server/platform/announcements";
import { A, ensureSeed } from "./setup";
const operator = "announcements.operator@example.test";
const ids: string[] = [];
const oldOperators = process.env.PLATFORM_OPERATOR_EMAILS;
const input = { title: "Platform fixture", body: "Texto simple", level: "INFO", audience: "ALL",
  startsAt: new Date(Date.now() - 60_000), endsAt: null };
before(async () => { await ensureSeed(); process.env.PLATFORM_OPERATOR_EMAILS = operator; });
after(async () => {
  await db.auditLog.deleteMany({ where: { entity: "PlatformAnnouncement", entityId: { in: ids } } });
  await db.platformAnnouncement.deleteMany({ where: { id: { in: ids } } });
  if (oldOperators === undefined) delete process.env.PLATFORM_OPERATOR_EMAILS;
  else process.env.PLATFORM_OPERATOR_EMAILS = oldOperators;
  await db.$disconnect();
});
async function create(data: Record<string, unknown> = {}) {
  const result = await savePlatformAnnouncement(operator, { ...input, ...data });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("Fixture could not be created");
  ids.push(result.id); return result.id;
}
test("non-operators cannot list, read, create, edit or end platform notices", async () => {
  const count = await db.platformAnnouncement.count();
  for (const email of [null, "admin@example.test"]) {
    await assert.rejects(() => listPlatformAnnouncements(email), /permiso/);
    await assert.rejects(() => getPlatformAnnouncement(email, "any"), /permiso/);
    await assert.rejects(() => savePlatformAnnouncement(email, input), /permiso/);
    await assert.rejects(() => savePlatformAnnouncement(email, input, "any"), /permiso/);
    await assert.rejects(() => endPlatformAnnouncement(email, "any", "title"), /permiso/);
  }
  assert.equal(await db.platformAnnouncement.count(), count);
});
test("create edit terminate preserve author and write operator before/after audit", async () => {
  const id = await create();
  assert.equal((await getPlatformAnnouncement(operator, id))?.createdBy, operator);
  assert.equal((await savePlatformAnnouncement(operator, { ...input, title: "Editado", level: "WARNING" }, id)).ok, true);
  assert.equal((await endPlatformAnnouncement(operator, id, "wrong")).ok, false);
  assert.equal((await endPlatformAnnouncement(operator, id, "Editado")).ok, true);
  assert.equal((await endPlatformAnnouncement(operator, id, "Editado")).ok, true);
  const logs = await db.auditLog.findMany({ where: { entity: "PlatformAnnouncement", entityId: id } });
  assert.equal(logs.length, 3);
  assert.deepEqual(logs.map((log) => log.action).sort(), [
    "PLATFORM_ANNOUNCEMENT_CREATED", "PLATFORM_ANNOUNCEMENT_ENDED", "PLATFORM_ANNOUNCEMENT_UPDATED",
  ]);
  for (const log of logs) {
    const changes = log.changes as { operator: string; before: unknown; after: unknown };
    assert.equal(changes.operator, operator); assert.ok(changes.after);
    if (log.action !== "PLATFORM_ANNOUNCEMENT_CREATED") assert.ok(changes.before);
  }
});
test("dashboard filters dates and audience using actual membership role, not caller role", async () => {
  const everyone = await create();
  const admins = await create({ audience: "ADMINS" });
  const independent = await create({ audience: "INDEPENDENT" });
  const future = await create({ startsAt: new Date(Date.now() + 86400_000) });
  const expired = await create({ startsAt: new Date(Date.now() - 86400_000), endsAt: new Date(Date.now() - 1000) });
  const student = await getDashboardPlatformAnnouncements({ userId: A.student.id, institutionId: A.institutionId, role: "ADMIN" });
  const visible = student.announcements.map((notice) => notice.id);
  assert.ok(visible.includes(everyone));
  for (const id of [admins, independent, future, expired]) assert.ok(!visible.includes(id));
  const admin = await getDashboardPlatformAnnouncements({ userId: A.admin.id, institutionId: A.institutionId, role: "STUDENT" });
  assert.ok(admin.announcements.some((notice) => notice.id === admins));
  assert.deepEqual((await getDashboardPlatformAnnouncements({ userId: A.student.id, institutionId: "another", role: "ADMIN" })).announcements, []);
});
test("terminating a scheduled announcement cancels it and invalid input creates no audit", async () => {
  const id = await create({ startsAt: new Date(Date.now() + 86400_000) });
  assert.equal((await endPlatformAnnouncement(operator, id, input.title)).ok, true);
  const row = await db.platformAnnouncement.findUniqueOrThrow({ where: { id } });
  assert.ok(row.endsAt! < row.startsAt);
  const before = await db.auditLog.count({ where: { action: "PLATFORM_ANNOUNCEMENT_CREATED" } });
  assert.equal((await savePlatformAnnouncement(operator, { ...input, endsAt: input.startsAt })).ok, false);
  assert.equal(await db.auditLog.count({ where: { action: "PLATFORM_ANNOUNCEMENT_CREATED" } }), before);
});
