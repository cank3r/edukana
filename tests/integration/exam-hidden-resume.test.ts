import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { getAttemptResult, getExamIntro, getOngoingAttempt, listStudentExams } from "@/server/assessment/exam-taking";
import { questionSnapshot, startExamAttempt, submitExamAttempt } from "@/server/exams";
import { A, B, ensureSeed } from "./setup";

// CI discovers this suite via tests/integration/**/*.test.ts. Requires disposable PostgreSQL.
const student = { id: A.student.id, institutionId: A.institutionId };
const classmate = { id: A.student2.id, institutionId: A.institutionId };
const outsider = { id: B.student.id, institutionId: B.institutionId };
const prefix = "it_hidden_resume_";
const bankId = `${prefix}question`;
const key = "private-snapshot-key";
const explanation = "private-question-explanation";
const T0 = new Date("2026-10-09T12:00:00Z");
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

before(async () => {
  await ensureSeed();
  await db.questionBankItem.create({ data: {
    id: bankId, institutionId: A.institutionId, courseId: A.courseId,
    type: "MULTIPLE_CHOICE", prompt: "Frozen question", options: ["A", "B"], answerKey: key, explanation, defaultPoints: 1,
  } });
});

after(async () => {
  await db.exam.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.questionBankItem.deleteMany({ where: { id: bankId } });
  await db.$disconnect();
});

async function makeExam(suffix: string) {
  const bank = await db.questionBankItem.findUniqueOrThrow({ where: { id: bankId } });
  const exam = await db.exam.create({ data: {
    id: `${prefix}${suffix}`, institutionId: A.institutionId, courseId: A.courseId,
    title: "Hidden exam", durationMinutes: 10, maxAttempts: 3, isPublished: true, showReview: true,
    questions: { create: {
      institutionId: A.institutionId, bankItemId: bankId, order: 0, points: 1, snapshot: questionSnapshot(bank, 1),
    } },
  } });
  return exam.id;
}

function assertPrivate(value: unknown) {
  const json = JSON.stringify(value);
  for (const secret of [key, explanation, "answerKey", "correctAnswer"]) {
    assert.equal(json.includes(secret), false, `must not expose ${secret}`);
  }
}

async function assertUnavailable(actor: typeof student, examId: string, now = at(120)) {
  assert.equal(await getExamIntro(actor, examId, now), null);
  assert.equal(await getOngoingAttempt(actor, examId, now), null);
}

test("hidden exam: reload resumes only the owner's current attempt without extending time or revealing results", async () => {
  const examId = await makeExam("lifecycle");
  const first = await startExamAttempt(student, examId, T0);
  assert.ok(first.ok);
  if (!first.ok) return;
  assert.ok((await submitExamAttempt(student, first.attemptId, { [bankId]: key }, at(10))).ok);
  const started = await startExamAttempt(student, examId, at(20));
  assert.ok(started.ok);
  if (!started.ok) return;
  await db.exam.update({ where: { id: examId }, data: { isPublished: false } });
  const before = await db.examAttempt.findUniqueOrThrow({ where: { id: started.attemptId } });
  const intro = await getExamIntro(student, examId, at(120));
  assert.ok(intro);
  assert.equal(intro.hasOngoingAttempt, true);
  assert.equal(intro.canStart, false);
  assert.equal(intro.best, null);
  assert.equal(intro.lastFinishedAttemptId, null);
  assert.equal(intro.pendingReview, false);
  assert.equal(intro.attemptsUsed, 2);
  assertPrivate(intro);
  const ongoing = await getOngoingAttempt(student, examId, at(120));
  assert.ok(ongoing);
  assert.equal(ongoing.attemptId, started.attemptId);
  assert.deepEqual(ongoing.questions, started.questions);
  assert.deepEqual(ongoing.expiresAt, started.expiresAt);
  assert.equal(ongoing.expiresAt.getTime() - ongoing.serverNow.getTime(), 500_000);
  assertPrivate(ongoing);
  assert.equal(await getAttemptResult(student, started.attemptId, at(120)), null);
  assert.equal(await getAttemptResult(student, first.attemptId, at(120)), null);
  assert.equal((await listStudentExams(student, A.courseId, at(120)))?.exams.some((exam) => exam.id === examId), false);
  assert.equal((await startExamAttempt(student, examId, at(120))).ok, false);
  assert.equal(await db.examAttempt.count({ where: { examId } }), 2);
  assert.deepEqual(await db.examAttempt.findUniqueOrThrow({ where: { id: started.attemptId } }), before,
    "readers and denied starts do not mutate or finalize the attempt");

  for (const stranger of [classmate, outsider, { ...student, institutionId: B.institutionId }]) {
    await assertUnavailable(stranger, examId);
  }
  const enrollment = await db.enrollment.create({ data: {
    institutionId: A.institutionId, studentId: classmate.id, courseId: A.courseId, status: "ACTIVE",
  } });
  try {
    await assertUnavailable(classmate, examId);
    assert.equal((await startExamAttempt(classmate, examId, at(120))).ok, false);
  } finally {
    await db.enrollment.delete({ where: { id: enrollment.id } });
  }
  assert.ok((await submitExamAttempt(student, started.attemptId, { [bankId]: key }, at(121))).ok,
    "hiding does not prevent submission of the authorized existing attempt");
  await assertUnavailable(student, examId, at(122));
  assert.equal(await getAttemptResult(student, started.attemptId, at(122)), null);
  assert.equal((await startExamAttempt(student, examId, at(122))).ok, false);
});

test("hidden exam: no absent, expired, undated or terminal attempt can authorize readers", async () => {
  const examId = await makeExam("states");
  await db.exam.update({ where: { id: examId }, data: { isPublished: false } });
  await assertUnavailable(student, examId);
  await db.exam.update({ where: { id: examId }, data: { isPublished: true } });
  const started = await startExamAttempt(student, examId, T0);
  assert.ok(started.ok);
  if (!started.ok) return;
  await db.exam.update({ where: { id: examId }, data: { isPublished: false } });
  for (const instant of [at(600), at(601), at(630), at(631)]) {
    await assertUnavailable(student, examId, instant);
    assert.equal(await getAttemptResult(student, started.attemptId, instant), null);
  }
  assert.equal((await db.examAttempt.findUniqueOrThrow({ where: { id: started.attemptId } })).status, "IN_PROGRESS");
  await db.examAttempt.update({ where: { id: started.attemptId }, data: { expiresAt: null } });
  await assertUnavailable(student, examId);
  for (const status of ["SUBMITTED", "GRADED"] as const) {
    await db.examAttempt.update({ where: { id: started.attemptId }, data: { status, expiresAt: at(600) } });
    await assertUnavailable(student, examId);
    assert.equal(await getAttemptResult(student, started.attemptId, at(120)), null);
  }
});

test("hidden exam: resuming requires the owner's enrollment to stay active", async () => {
  const examId = await makeExam("enrollment");
  const started = await startExamAttempt(student, examId, T0);
  assert.ok(started.ok);
  if (!started.ok) return;
  await db.exam.update({ where: { id: examId }, data: { isPublished: false } });
  const attempt = await db.examAttempt.findUniqueOrThrow({ where: { id: started.attemptId } });
  const enrollment = await db.enrollment.findUniqueOrThrow({ where: { id: attempt.enrollmentId } });
  try {
    for (const status of ["COMPLETED", "DROPPED", "FAILED"] as const) {
      await db.enrollment.update({ where: { id: enrollment.id }, data: { status } });
      await assertUnavailable(student, examId);
    }
  } finally {
    await db.enrollment.update({ where: { id: enrollment.id }, data: { status: enrollment.status } });
  }
  assert.ok(await getOngoingAttempt(student, examId, at(120)));
});
