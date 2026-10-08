import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { archiveSubmissionVersion, writeGradeEntry } from "@/server/grade-history";
import { checkSetupToken } from "@/server/setup-token";
import { A, ensureSeed } from "./setup";

const base = { institutionId: A.institutionId, courseId: A.courseId };
const grade = { institutionId: A.institutionId, gradeItemId: "it_gh_item", enrollmentId: "a_enrollment", actorId: A.teacher.id };

before(async () => {
  await ensureSeed();
  await db.assignment.create({ data: { id: "it_gh_assignment", ...base, title: "Tarea con historia", isPublished: true } });
  await db.gradingPeriod.create({
    data: {
      id: "it_gh_period",
      ...base,
      academicPeriodId: "a_period",
      name: "Período de prueba de historia",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-12-31"),
      categories: {
        create: {
          id: "it_gh_category",
          ...base,
          name: "Tareas",
          weight: 100,
          items: { create: { id: "it_gh_item", ...base, gradingPeriodId: "it_gh_period", title: "Tarea", assignmentId: "it_gh_assignment" } },
        },
      },
    },
  });
});

after(async () => {
  await db.gradingPeriod.deleteMany({ where: { id: "it_gh_period" } });
  await db.assignment.deleteMany({ where: { id: "it_gh_assignment" } });
  await db.$disconnect();
});

test("historia de notas: la primera nota no genera revisión y repetirla no cambia nada", async () => {
  assert.deepEqual(await db.$transaction((tx) => writeGradeEntry(tx, { ...grade, score: 70 })), { ok: true, changed: true });
  assert.deepEqual(await db.$transaction((tx) => writeGradeEntry(tx, { ...grade, score: 70 })), { ok: true, changed: false });
  assert.equal(await db.gradeEntryRevision.count({ where: { gradeEntry: { gradeItemId: "it_gh_item" } } }), 0);
});

test("historia de notas: corregir una nota conserva valor anterior, valor nuevo, actor y fecha", async () => {
  const when = new Date("2026-10-08T15:00:00Z");
  const result = await db.$transaction((tx) => writeGradeEntry(tx, { ...grade, score: 85, feedback: "Recalculada" }, when));
  assert.deepEqual(result, { ok: true, changed: true });
  const [revision] = await db.gradeEntryRevision.findMany({ where: { gradeEntry: { gradeItemId: "it_gh_item" } } });
  assert.equal(revision.previousScore, 70);
  assert.equal(revision.newScore, 85);
  assert.equal(revision.actorId, A.teacher.id);
  assert.equal(revision.institutionId, A.institutionId);
  assert.equal(revision.createdAt.toISOString(), when.toISOString());
  assert.equal((await db.gradeEntry.findFirstOrThrow({ where: { gradeItemId: "it_gh_item" } })).score, 85);
});

test("historia de notas: con el período publicado, cambiar una nota exige motivo y sin él nada cambia", async () => {
  await db.gradingPeriod.update({ where: { id: "it_gh_period" }, data: { isPublished: true, publishedAt: new Date() } });
  const withoutReason = await db.$transaction((tx) => writeGradeEntry(tx, { ...grade, score: 90, feedback: "Recalculada" }));
  assert.equal(withoutReason.ok, false);
  assert.equal((await db.gradeEntry.findFirstOrThrow({ where: { gradeItemId: "it_gh_item" } })).score, 85);

  const withReason = await db.$transaction((tx) =>
    writeGradeEntry(tx, { ...grade, score: 90, feedback: "Recalculada", reason: "Error al sumar la rúbrica" }),
  );
  assert.deepEqual(withReason, { ok: true, changed: true });
  const revisions = await db.gradeEntryRevision.findMany({
    where: { gradeEntry: { gradeItemId: "it_gh_item" } },
    orderBy: { createdAt: "asc" },
  });
  assert.equal(revisions.length, 2);
  assert.equal(revisions.at(-1)?.reason, "Error al sumar la rúbrica");
  assert.equal(revisions.at(-1)?.previousScore, 85);
});

test("historia de entregas: reenviar conserva la versión anterior con su fecha", async () => {
  const scope = { assignmentId: "it_gh_assignment", studentId: A.student.id, institutionId: A.institutionId };
  assert.equal(await db.$transaction((tx) => archiveSubmissionVersion(tx, scope)), false);
  const first = await db.submission.create({
    data: { ...scope, enrollmentId: "a_enrollment", content: "Primera versión", submittedAt: new Date("2026-10-01T10:00:00Z") },
  });
  assert.equal(await db.$transaction((tx) => archiveSubmissionVersion(tx, scope)), true);
  await db.submission.update({ where: { id: first.id }, data: { content: "Segunda versión", submittedAt: new Date() } });
  const [revision] = await db.submissionRevision.findMany({ where: { submissionId: first.id } });
  assert.equal(revision.content, "Primera versión");
  assert.equal(revision.submittedAt.toISOString(), "2026-10-01T10:00:00.000Z");
  assert.equal((await db.submission.findUniqueOrThrow({ where: { id: first.id } })).content, "Segunda versión");
});

test("alta inicial: con SETUP_TOKEN definido solo vale el valor exacto", () => {
  const env = { SETUP_TOKEN: "un-valor-largo-y-aleatorio-123456" };
  assert.equal(checkSetupToken("un-valor-largo-y-aleatorio-123456", env), "valid");
  assert.equal(checkSetupToken("un-valor-largo-y-aleatorio-123457", env), "invalid");
  assert.equal(checkSetupToken("", env), "invalid");
  assert.equal(checkSetupToken(undefined, env), "invalid");
});

test("alta inicial: sin SETUP_TOKEN se conserva el comportamiento anterior y un valor corto se rechaza", () => {
  assert.equal(checkSetupToken("", {}), "not_required");
  assert.throws(() => checkSetupToken("x", { SETUP_TOKEN: "corto" }), /24 caracteres/);
});
