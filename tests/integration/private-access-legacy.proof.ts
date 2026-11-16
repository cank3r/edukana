import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { GET as readLocalBytes } from "@/app/api/local-storage/route";
import { submitAssignmentWithFiles } from "@/server/courses/submission-files";
import { createPrivateAccessFixture } from "./private-access-fixture";
import { legacyHarness } from "./private-access-legacy.helpers";

let f: Awaited<ReturnType<typeof createPrivateAccessFixture>>;
let h: ReturnType<typeof legacyHarness>;
before(async () => { f = await createPrivateAccessFixture(); h = legacyHarness(f); });
after(async () => { await f?.close(); });

test("legacy lesson: real reservation, local upload, confirmation, bytes and repeated requests", async () => {
  const section = await f.db.courseSection.create({ data: {
    institutionId: f.a.institutionId, courseId: f.a.courseId, title: "Synthetic lesson section",
  } });
  const lesson = await f.db.lesson.create({ data: {
    institutionId: f.a.institutionId, courseId: f.a.courseId, sectionId: section.id, title: "Synthetic lesson",
  } });
  const file = await h.upload({ lessonId: lesson.id });
  assert.equal(file.row.lessonId, lesson.id);
  assert.equal(file.row.submissionId, null);
  assert.equal(file.row.bucket, "local-private");
  assert.equal((await h.request("GET", file.id)).status, 404, "Pending files have no read authorization");
  assert.equal((await h.request("PATCH", file.id)).status, 200);
  const confirmed = await f.db.storageAsset.findUniqueOrThrow({ where: { id: file.id } });
  assert.ok(confirmed.confirmedAt);
  assert.ok(confirmed.checksum);
  const read = await h.request("GET", file.id);
  assert.equal(read.status, 302);
  const bytes = await readLocalBytes(new Request(read.headers.get("location")!));
  assert.equal(bytes.status, 200);
  assert.deepEqual(new Uint8Array(await bytes.arrayBuffer()), f.pdf);
  assert.equal((await h.request("PATCH", file.id)).status, 404, "Repeated confirmation cannot rewrite metadata");
  await h.preserved({ ...file, row: confirmed });
  assert.equal((await h.request("DELETE", file.id)).status, 204);
  assert.equal((await h.request("DELETE", file.id)).status, 404);
  assert.equal((await h.request("GET", file.id)).status, 404);
  await h.absent(file);
});

test("legacy POST denies valid student submissions, foreign courses and unassigned teachers without reservations", async () => {
  const submission = await h.submission();
  await f.db.submission.update({ where: { id: submission.id }, data: { status: "GRADED", score: 95 } });
  const before = await f.db.storageAsset.count({ where: { institutionId: { in: [f.a.institutionId, f.b.institutionId] } } });
  for (const [actor, fields, status] of [
    [null, {}, 401], [f.a.student, {}, 403], [f.a.student, { submissionId: submission.id }, 403],
    [f.a.teacher, { submissionId: submission.id }, 403], [f.a.otherTeacher, {}, 403], [f.b.teacher, {}, 403],
  ] as const) {
    h.as(actor);
    const response = await h.post(fields);
    assert.equal(response.status, status);
    const body = await response.json() as Record<string, unknown>;
    assert.equal(Object.hasOwn(body, "uploadUrl"), false);
    assert.equal(Object.hasOwn(body, "assetId"), false);
  }
  assert.equal(await f.db.storageAsset.count({ where: { institutionId: { in: [f.a.institutionId, f.b.institutionId] } } }), before);
});

test("legacy size mismatch discards only the unassociated reservation and its actual local bytes", async () => {
  const file = await h.upload({ declaredSize: f.pdf.length + 1 });
  assert.deepEqual(new Uint8Array(await readFile(file.path)), f.pdf);
  assert.equal((await h.request("PATCH", file.id)).status, 409);
  await h.absent(file);
  assert.equal((await h.request("PATCH", file.id)).status, 404);
});

for (const capability of ["course.view", "course.manage"] as const) {
  test(`legacy mutations reread PostgreSQL ${capability} withdrawal and restoration with the same session`, async () => {
    const pending = await h.upload();
    const confirmed = await h.upload({ confirmed: true });
    const where = { institutionId_role_capability: { institutionId: f.a.institutionId, role: "TEACHER" as const, capability } };
    try {
      await f.db.roleCapabilityOverride.upsert({ where, create: {
        institutionId: f.a.institutionId, role: "TEACHER", capability, enabled: false, updatedById: f.a.admin.id,
      }, update: { enabled: false } });
      const count = await f.db.storageAsset.count({ where: { institutionId: f.a.institutionId } });
      for (let repeat = 0; repeat < 2; repeat++) {
        assert.equal((await h.post()).status, 403);
        assert.equal((await h.request("PATCH", pending.id)).status, 403);
        assert.equal((await h.request("DELETE", confirmed.id)).status, 403);
      }
      assert.equal(await f.db.storageAsset.count({ where: { institutionId: f.a.institutionId } }), count);
      assert.equal((await h.request("GET", confirmed.id)).status, capability === "course.view" ? 403 : 302);
      await h.preserved(pending); await h.preserved(confirmed);
    } finally {
      await f.db.roleCapabilityOverride.deleteMany({ where: { institutionId: f.a.institutionId, role: "TEACHER", capability } });
    }
    assert.equal((await h.request("PATCH", pending.id)).status, 200);
    assert.equal((await h.request("DELETE", confirmed.id)).status, 204);
    await h.absent(confirmed);
  });
}

test("legacy teacher reassignment denies old owner, other uploader and foreign institution; restoration recovers access", async () => {
  const pending = await h.upload();
  const confirmed = await h.upload({ confirmed: true });
  try {
    await f.db.course.update({ where: { id: f.a.courseId }, data: { teacherId: f.a.otherTeacher.id } });
    for (let repeat = 0; repeat < 2; repeat++) {
      assert.equal((await h.post()).status, 403);
      assert.equal((await h.request("PATCH", pending.id)).status, 403);
      assert.equal((await h.request("DELETE", confirmed.id)).status, 403);
      assert.equal((await h.request("GET", confirmed.id)).status, 403);
    }
    for (const actor of [f.a.otherTeacher, f.b.teacher, null]) {
      h.as(actor);
      assert.equal((await h.request("PATCH", pending.id)).status, actor ? 404 : 401);
      assert.equal((await h.request("DELETE", confirmed.id)).status, actor ? 404 : 401);
    }
    await h.preserved(pending); await h.preserved(confirmed);
  } finally {
    await f.db.course.update({ where: { id: f.a.courseId }, data: { teacherId: f.a.teacher.id } });
    h.as(f.a.teacher);
  }
  assert.equal((await h.request("PATCH", pending.id)).status, 200);
  assert.equal((await h.request("DELETE", confirmed.id)).status, 204);
});

test("legacy historical files are retained by real JSONB produced by resubmission, including repeated deletes", async () => {
  const submission = await h.submission();
  const files = await Promise.all([h.upload({ confirmed: true }), h.upload({ confirmed: true })]);
  // Seed the old representation: student-owned files in the former course folder, linked to the current delivery.
  for (const file of files) await f.db.storageAsset.update({ where: { id: file.id }, data: {
    uploaderId: f.a.student.id, submissionId: submission.id, assignmentId: submission.assignmentId, visibility: "PRIVATE",
  } });
  h.as(f.a.student);
  for (const file of files) assert.equal((await h.request("DELETE", file.id)).status, 409, "Current delivery is retained");
  const resubmitted = await submitAssignmentWithFiles(f.a.student, {
    assignmentId: submission.assignmentId, content: "Synthetic replacement without old files", assetIds: [],
  });
  assert.ok(resubmitted.ok);
  const revision = await f.db.submissionRevision.findFirstOrThrow({ where: { submissionId: submission.id } });
  assert.deepEqual((revision.assetIds as string[]).slice().sort(), files.map((file) => file.id).sort());
  for (const file of files) {
    const row = await f.db.storageAsset.findUniqueOrThrow({ where: { id: file.id } });
    assert.equal(row.submissionId, null); assert.equal(row.assignmentId, null);
    assert.ok(row.objectPath.startsWith(`${f.a.institutionId}/${f.a.courseId}/`));
    for (let repeat = 0; repeat < 2; repeat++) assert.equal((await h.request("DELETE", file.id)).status, 409);
    await h.preserved({ ...file, row });
    assert.equal((await h.request("GET", file.id)).status, 302);
    h.as(f.a.otherStudent);
    assert.equal((await h.request("GET", file.id)).status, 403);
    h.as(f.a.student);
  }
  assert.deepEqual(await f.db.submissionRevision.findUniqueOrThrow({ where: { id: revision.id } }), revision);
  const unrelated = await h.upload({ confirmed: true });
  assert.equal((await h.request("DELETE", unrelated.id)).status, 204, "History must not blanket-block unrelated course files");
});

test("concurrent legacy PATCH requests observe a PostgreSQL lock chain and confirm exactly once", async (t) => {
  const file = await h.upload();
  const results = await h.queued(file, "PATCH", t);
  assert.deepEqual(results.map((response) => response.status), [200, 409]);
  const row = await f.db.storageAsset.findUniqueOrThrow({ where: { id: file.id } });
  assert.ok(row.confirmedAt); assert.ok(row.checksum);
  assert.equal(await f.db.storageAsset.count({ where: { id: file.id } }), 1);
  await h.preserved({ ...file, row });
  assert.equal((await h.request("PATCH", file.id)).status, 404);
});

test("concurrent legacy DELETE requests observe a PostgreSQL lock chain and remove exactly once", async (t) => {
  const file = await h.upload({ confirmed: true });
  const results = await h.queued(file, "DELETE", t);
  assert.deepEqual(results.map((response) => response.status), [204, 409]);
  await h.absent(file);
  assert.equal((await h.request("DELETE", file.id)).status, 404);
});

for (const reference of ["announcement", "submission"] as const) {
  test(`legacy stale DELETE preserves a winning ${reference} fixture association and exact bytes`, async (t) => {
    const file = await h.upload({ confirmed: true });
    const target = reference === "announcement" ? await f.db.announcement.create({ data: {
      institutionId: f.a.institutionId, authorId: f.a.teacher.id, title: "Synthetic association", content: "Synthetic only",
    } }) : await h.submission();
    const association = reference === "announcement" ? { announcementId: target.id } : { submissionId: target.id };
    const results = await h.queued(file, "DELETE", t, association);
    assert.deepEqual(results.map((response) => response.status), [409]);
    const row = await f.db.storageAsset.findUniqueOrThrow({ where: { id: file.id } });
    assert.equal(reference === "announcement" ? row.announcementId : row.submissionId, target.id);
    assert.deepEqual(row, { ...file.row, ...association });
    assert.deepEqual(new Uint8Array(await readFile(file.path)), f.pdf);
    assert.equal((await h.request("DELETE", file.id)).status, reference === "announcement" ? 404 : 409);
  });
}
