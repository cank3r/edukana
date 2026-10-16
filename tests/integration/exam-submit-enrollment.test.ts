import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { db } from "@/lib/db";
import { questionSnapshot, startExamAttempt, submitExamAttempt } from "@/server/exams";
import { A, B, ensureSeed } from "./setup";

const prefix = "it_exam_submit_access_";
const actor = { id: A.student.id, institutionId: A.institutionId };
const now = new Date("2026-10-09T12:00:00Z");
let seeded = false;
before(async () => { await ensureSeed(); seeded = true; });
after(async () => {
  if (!seeded) { await db.$disconnect(); return; }
  await db.exam.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.gradeItem.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.gradingPeriod.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.questionBankItem.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.enrollment.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.course.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.$disconnect();
});

test("withdrawal holding the enrollment lock wins before a waiting submission", async () => {
  const { id, attemptId } = await fixture("withdrawal_race");
  const original = await db.examAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  let acquired!: (pid: number) => void;
  let failed!: (error: unknown) => void;
  const ready = new Promise<number>((resolve, reject) => { acquired = resolve; failed = reject; });
  const withdrawal = db.$transaction(async (tx) => {
    await tx.enrollment.update({ where: { id }, data: { status: "DROPPED" } });
    const [backend] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
    acquired(backend.pid);
    await released;
  }, { timeout: 20_000 });
  void withdrawal.catch(failed);
  let submission: ReturnType<typeof submitExamAttempt> | undefined;
  try {
    const blocker = await ready;
    submission = submitExamAttempt(actor, attemptId, { [id]: "verdadero" }, now);
    void submission.catch(() => {});
    let waiting = false;
    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline) {
      const rows = await db.$queryRaw<Array<{ pid: number }>>`
        SELECT pid FROM pg_stat_activity
        WHERE ${blocker} = ANY(pg_blocking_pids(pid)) AND position('enrollments' IN query) > 0`;
      if (rows.length) { waiting = true; break; }
      await delay(15);
    }
    assert.ok(waiting, "submission must actually wait on the withdrawal's enrollment lock");
  } finally {
    release();
    await Promise.allSettled([withdrawal, submission]);
  }
  await withdrawal;
  assert.ok(submission);
  assert.equal((await submission).ok, false);
  assert.deepEqual(await db.examAttempt.findUniqueOrThrow({ where: { id: attemptId } }), original);
  await unchanged(attemptId, id);
});
async function fixture(suffix: string) {
  const id = prefix + suffix;
  await db.course.create({ data: { id, institutionId: A.institutionId, periodId: "a_period", teacherId: A.teacher.id, name: id } });
  await db.enrollment.create({ data: { id, institutionId: A.institutionId, courseId: id, studentId: actor.id } });
  const bank = await db.questionBankItem.create({ data: { id, institutionId: A.institutionId, courseId: id, type: "TRUE_FALSE", prompt: "Pregunta", answerKey: "verdadero", defaultPoints: 2 } });
  await db.gradingPeriod.create({ data: { id, institutionId: A.institutionId, courseId: id, academicPeriodId: "a_period", name: id, startDate: now, endDate: new Date("2026-12-31"), categories: { create: { id, institutionId: A.institutionId, courseId: id, name: id, weight: 100 } } } });
  await db.exam.create({ data: { id, institutionId: A.institutionId, courseId: id, title: id, isPublished: true, durationMinutes: 10,
    questions: { create: { institutionId: A.institutionId, bankItemId: id, points: 2, order: 0, snapshot: questionSnapshot(bank, 2) } },
    gradeItem: { create: { id, institutionId: A.institutionId, courseId: id, gradingPeriodId: id, categoryId: id, title: id, maxScore: 2 } } } });
  const result = await startExamAttempt(actor, id, now);
  assert.ok(result.ok);
  return { id, attemptId: result.attemptId };
}
async function unchanged(attemptId: string, id: string, submitter = actor) {
  const beforeAttempt = await db.examAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  const result = await submitExamAttempt(submitter, attemptId, { [id]: "verdadero" }, now);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "not_found");
  assert.deepEqual(await db.examAttempt.findUniqueOrThrow({ where: { id: attemptId } }), beforeAttempt);
  assert.equal(await db.examAnswer.count({ where: { attemptId } }), 0);
  assert.equal(await db.gradeEntry.count({ where: { gradeItemId: id } }), 0);
  assert.equal(await db.gradeEntryRevision.count({ where: { gradeEntry: { gradeItemId: id } } }), 0);
}
for (const status of ["DROPPED", "COMPLETED", "FAILED"] as const) {
  test(`submit rejects enrollment ${status} after start without changing evidence`, async () => {
    const { id, attemptId } = await fixture(status);
    await db.enrollment.update({ where: { id }, data: { status } });
    await unchanged(attemptId, id);
  });
}
test("active owned enrollment still accepts and grades a timed attempt", async () => {
  const { id, attemptId } = await fixture("active");
  const result = await submitExamAttempt(actor, attemptId, { [id]: "verdadero" }, now);
  assert.ok(result.ok);
  assert.equal(result.score, 2);
  assert.equal(await db.examAnswer.count({ where: { attemptId } }), 1);
  assert.equal(await db.gradeEntry.count({ where: { gradeItemId: id, score: 2 } }), 1);
});
test("another student or institution cannot submit the same attempt", async () => {
  const { id, attemptId } = await fixture("actor");
  await unchanged(attemptId, id, { ...actor, id: A.student2.id });
  await unchanged(attemptId, id, { ...actor, institutionId: B.institutionId });
});
for (const mismatch of ["student", "institution", "course"] as const) {
  test(`submit rejects mismatched enrollment ${mismatch}`, async () => {
    const { id, attemptId } = await fixture(mismatch);
    const data = mismatch === "student" ? { studentId: A.student2.id } : mismatch === "institution" ? { institutionId: B.institutionId } : { courseId: A.course2Id };
    await db.enrollment.update({ where: { id }, data });
    await unchanged(attemptId, id);
  });
}
