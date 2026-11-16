import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, afterEach, before, test } from "node:test";
import type { Role } from "@prisma/client";
import { GET as readLocal } from "@/app/api/local-storage/route";
import { getCommunityAnnouncementWhere } from "@/lib/announcement-data";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { createPrivateAnnouncementAssetUpload } from "@/lib/storage";
import { assetReadAccess, type UploadActor } from "@/server/courses/uploads";
import { assertAssetBytes, createPrivateAccessFixture, putBytes } from "./private-access-fixture";

// PostgreSQL and the supported local provider stay real. Only the session boundary is replaced.
const require = createRequire(import.meta.url);
const { loadWithStubs } = require("../helpers/load-with-stubs.cjs");
let session: UploadActor | null = null;
const { GET: readAsset }: typeof import("@/app/api/assets/[assetId]/route") =
  loadWithStubs("src/app/api/assets/[assetId]/route.ts", {
    "@/lib/auth": { auth: async () => session ? { user: session } : null },
  });

type Fixture = Awaited<ReturnType<typeof createPrivateAccessFixture>>;
type Side = Fixture["a"];
type Notice = Awaited<ReturnType<typeof createNotice>>;
let fx: Fixture;
let aNotices: Notice[];
let bNotice: Notice;
let aLinks: string[] = [];
let bLink = "";
const overrideIds: string[] = [];
const access = { canManage: false, canPublish: false };

async function createLink(side: Side, studentId: string) {
  const link = await fx.db.guardianship.create({ data: {
    institutionId: side.institutionId, parentId: side.parent.id, studentId,
    relationship: "MOTHER", status: "ACTIVE", canViewAnnouncements: true,
    createdById: side.admin.id, updatedById: side.admin.id,
  } });
  return link.id;
}

async function createNotice(side: Side, courseId: string, relational: boolean) {
  const announcement = await fx.db.announcement.create({ data: {
    institutionId: side.institutionId, authorId: side.teacher.id,
    title: "Synthetic private parent notice", content: "Synthetic private audience proof.",
    audience: relational ? "ROLE" : "COURSE", audienceId: relational ? null : courseId,
    ...(relational ? { courseTargets: { create: { institutionId: side.institutionId, courseId } } } : {}),
  } });
  const upload = await createPrivateAnnouncementAssetUpload({
    institutionId: side.institutionId, uploaderId: side.teacher.id, fileName: "parent-proof.pdf",
  });
  await putBytes(upload.signedUrl, fx.pdf, "application/pdf");
  const asset = await fx.db.storageAsset.create({ data: {
    institutionId: side.institutionId, announcementId: announcement.id, uploaderId: side.teacher.id,
    bucket: upload.bucket, objectPath: upload.objectPath, originalName: "parent-proof.pdf",
    mimeType: "application/pdf", sizeBytes: fx.pdf.length, kind: "DOCUMENT", visibility: "PRIVATE",
    confirmedAt: new Date(),
  } });
  return { announcement, asset };
}

async function setOverride(side: Side, role: Role, capability: string, enabled: boolean) {
  const row = await fx.db.roleCapabilityOverride.upsert({
    where: { institutionId_role_capability: { institutionId: side.institutionId, role, capability } },
    create: { institutionId: side.institutionId, role, capability, enabled, updatedById: side.admin.id },
    update: { enabled },
  });
  if (!overrideIds.includes(row.id)) overrideIds.push(row.id);
  return row.id;
}

async function visible(actor: UploadActor) {
  const where = await getCommunityAnnouncementWhere(actor, access);
  return (await fx.db.announcement.findMany({ where, select: { id: true } })).map((row) => row.id).sort();
}

async function checkFile(actor: UploadActor, notice: Notice, expected: 200 | 403 | 404) {
  assert.equal((await assetReadAccess(actor, notice.asset.id)).status, expected);
  session = actor; // Reuse the identity and capability Set captured before each committed transition.
  const response = await readAsset(new Request(`${process.env.APP_URL}/api/assets/${notice.asset.id}`), {
    params: Promise.resolve({ assetId: notice.asset.id }),
  });
  assert.equal(response.status, expected === 200 ? 302 : expected);
  if (expected === 200) {
    const location = response.headers.get("location");
    assert.ok(location, "An authorized read must issue a location");
    const url = new URL(location);
    assert.ok(url.origin === process.env.APP_URL && url.pathname === "/api/local-storage", "Local provider required");
    const stored = await readLocal(new Request(location));
    assert.equal(stored.status, 200);
    assert.deepEqual(new Uint8Array(await stored.arrayBuffer()), fx.pdf);
  } else {
    assert.equal(response.headers.has("location"), false, "A denied read must not issue a signed URL");
  }
  assert.deepEqual(await fx.db.storageAsset.findUnique({ where: { id: notice.asset.id } }), notice.asset);
  await assertAssetBytes(notice.asset, fx.pdf);
}

async function checkA(expected: readonly boolean[], repeats = 1) {
  const ids = aNotices.filter((_, index) => expected[index]).map((notice) => notice.announcement.id).sort();
  for (let repeat = 0; repeat < repeats; repeat++) {
    assert.deepEqual(await visible(fx.a.parent), ids);
    for (let index = 0; index < aNotices.length; index++) {
      await checkFile(fx.a.parent, aNotices[index], expected[index] ? 200 : 403);
    }
  }
}

before(async () => {
  fx = await createPrivateAccessFixture();
  // These actor objects are never refreshed after writes; the real reader must requery policy.
  for (const side of [fx.a, fx.b]) {
    assert.ok(side.parent.capabilities.has("child.portal.view"));
    assert.ok(side.parent.capabilities.has("child.announcements.view"));
  }
  aLinks = [await createLink(fx.a, fx.a.student.id), await createLink(fx.a, fx.a.otherStudent.id)];
  bLink = await createLink(fx.b, fx.b.student.id);
  aNotices = [await createNotice(fx.a, fx.a.courseId, true), await createNotice(fx.a, fx.a.otherCourseId, false)];
  bNotice = await createNotice(fx.b, fx.b.courseId, true);
});

afterEach(async () => {
  session = null;
  if (!fx) return;
  await fx.db.roleCapabilityOverride.deleteMany({ where: { id: { in: overrideIds.splice(0) } } });
  await fx.db.guardianship.updateMany({
    where: { id: { in: [...aLinks, bLink].filter(Boolean) } },
    data: { status: "ACTIVE", revokedAt: null, canViewAnnouncements: true },
  });
  await fx.db.user.updateMany({
    where: { id: { in: [fx.a.parent.id, fx.a.student.id, fx.a.otherStudent.id] } }, data: { status: "ACTIVE" },
  });
});

after(async () => { if (fx) await fx.close(); });

for (const capability of ["child.portal.view", "child.announcements.view"] as const) {
  test(`PostgreSQL: ${capability} revocation/restoration overrides stale tutor capabilities on every read`, async () => {
    await checkA([true, true]);
    const overrideId = await setOverride(fx.a, "PARENT", capability, false);
    assert.equal((await getEffectiveCapabilities(fx.a.institutionId, "PARENT")).has(capability), false);
    assert.equal(fx.a.parent.capabilities.has(capability), true, "The caller must remain stale during the denial");
    await checkA([false, false], 3);
    await setOverride(fx.a, "PARENT", capability, true);
    assert.equal((await getEffectiveCapabilities(fx.a.institutionId, "PARENT")).has(capability), true);
    await checkA([true, true]);
    await fx.db.roleCapabilityOverride.delete({ where: { id: overrideId } });
    await checkA([true, true]);
  });
}

test("PostgreSQL: role/institution overrides are isolated and foreign private files remain undiscoverable", async () => {
  await checkA([true, true]);
  assert.deepEqual(await visible(fx.b.parent), [bNotice.announcement.id]);
  await checkFile(fx.b.parent, bNotice, 200);
  await setOverride(fx.b, "PARENT", "child.announcements.view", false);
  await setOverride(fx.a, "TEACHER", "child.portal.view", false);
  await checkA([true, true], 3);
  assert.deepEqual(await visible(fx.b.parent), []);
  await checkFile(fx.b.parent, bNotice, 403);
  for (const notice of aNotices) await checkFile(fx.b.parent, notice, 404);
  await checkFile(fx.a.parent, bNotice, 404);
});

test("PostgreSQL: disabling or revoking one link removes only that child's course and attachment audience", async () => {
  const enrollments = await fx.db.enrollment.findMany({
    where: { studentId: { in: [fx.a.student.id, fx.a.otherStudent.id] } }, select: { studentId: true, status: true },
  });
  assert.equal(enrollments.find((row) => row.studentId === fx.a.student.id)?.status, "ACTIVE");
  assert.equal(enrollments.find((row) => row.studentId === fx.a.otherStudent.id)?.status, "COMPLETED");
  await checkA([true, true]);
  await fx.db.guardianship.update({ where: { id: aLinks[0] }, data: { canViewAnnouncements: false } });
  await checkA([false, true], 3);
  await fx.db.guardianship.update({ where: { id: aLinks[0] }, data: { canViewAnnouncements: true } });
  await checkA([true, true]);
  for (const status of ["PENDING", "REVOKED"] as const) {
    await fx.db.guardianship.update({ where: { id: aLinks[0] }, data: {
      status, revokedAt: status === "REVOKED" ? new Date() : null,
    } });
    await checkA([false, true], 3);
  }
  await fx.db.guardianship.update({ where: { id: aLinks[0] }, data: { status: "ACTIVE", revokedAt: null } });
  await checkA([true, true]);
});

test("PostgreSQL: suspended child or tutor changes repeated audience/file reads without deleting retained bytes", async () => {
  await checkA([true, true]);
  await fx.db.user.update({ where: { id: fx.a.student.id }, data: { status: "SUSPENDED" } });
  await checkA([false, true], 3);
  await fx.db.user.update({ where: { id: fx.a.parent.id }, data: { status: "SUSPENDED" } });
  await checkA([false, false], 3);
  await fx.db.user.update({ where: { id: fx.a.parent.id }, data: { status: "ACTIVE" } });
  await checkA([false, true]);
  await fx.db.user.update({ where: { id: fx.a.student.id }, data: { status: "ACTIVE" } });
  await checkA([true, true]);
});
