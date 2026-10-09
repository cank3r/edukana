import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { createRequire } from "node:module";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { createExam, setExamPublished } from "@/server/assessment/exam-admin";
import { createQuestion, updateQuestion, type Manager } from "@/server/assessment/question-bank";
import { startExamAttempt, submitExamAttempt } from "@/server/exams";
import { A, B, ensureSeed } from "./setup";

// CI discovers this file via tests/integration/**/*.test.ts. Never run against staging.
// Only the authenticated-request/cache boundaries are stubbed; all database writes,
// scope checks, canonical scoring and grade revisions use the actual implementation.
const require = createRequire(import.meta.url);
const { loadLegacyExamReview } = require("../helpers/load-legacy-exam-review.cjs");
let user: Manager | null = A.teacher;
const paths: string[] = [];
const { reviewExamAttempt }: typeof import("@/app/dashboard/academico/actions") = loadLegacyExamReview({
  "@/lib/auth": { auth: async () => user ? { user } : null },
  "next/cache": { revalidatePath: (path: string) => paths.push(path) },
});
const TAG = "ITLEGACYREVIEW";
const PERIOD = "it_legacy_review_period";
const CATEGORY = "it_legacy_review_category";
let seeded = false;
const initial = { ok: false, message: "" };

before(async () => {
  await ensureSeed();
  const scope = { institutionId: A.institutionId, courseId: A.courseId };
  await db.gradingPeriod.create({ data: {
    id: PERIOD, ...scope, academicPeriodId: "a_period", name: TAG, isPublished: true,
    startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"),
    categories: { create: { id: CATEGORY, ...scope, name: TAG, weight: 100 } },
  } });
  seeded = true;
});
beforeEach(() => { user = A.teacher; paths.length = 0; });
after(async () => {
  if (seeded) {
    await db.exam.deleteMany({ where: { institutionId: A.institutionId, title: { startsWith: TAG } } });
    await db.gradingPeriod.deleteMany({ where: { id: PERIOD } });
    await db.questionBankItem.deleteMany({ where: { institutionId: A.institutionId, prompt: { startsWith: TAG } } });
  }
  await db.$disconnect();
});

async function pending() {
  const manual = await createQuestion(A.teacher, A.courseId, {
    type: "SHORT_ANSWER", prompt: `${TAG} Explain`, answer: "Explanation", points: 3,
  });
  const automatic = await createQuestion(A.teacher, A.courseId, {
    type: "TRUE_FALSE", prompt: `${TAG} True?`, answer: "Verdadero", points: 2,
  });
  assert.ok(manual.ok); assert.ok(automatic.ok);
  const created = await createExam(A.teacher, A.courseId, {
    title: `${TAG} Exam`, questions: [{ bankItemId: manual.id, points: 3 }, { bankItemId: automatic.id, points: 2 }],
    durationMinutes: 30, maxAttempts: 1, showReview: true, gradeCategoryId: CATEGORY,
  });
  assert.ok(created.ok);
  assert.equal((await setExamPublished(A.teacher, created.id, true)).ok, true);
  const started = await startExamAttempt(A.student, created.id);
  assert.ok(started.ok);
  const sent = await submitExamAttempt(A.student, started.attemptId, {
    [manual.id]: "The student's explanation", [automatic.id]: "Verdadero",
  });
  assert.ok(sent.ok); assert.equal(sent.status, "SUBMITTED");
  const attempt = await db.examAttempt.findUniqueOrThrow({ where: { id: started.attemptId }, include: { answers: true } });
  const answer = attempt.answers.find((item) => item.bankItemId === manual.id)!;
  const autoAnswer = attempt.answers.find((item) => item.bankItemId === automatic.id)!;
  const gradeItem = await db.gradeItem.findFirstOrThrow({ where: { examId: created.id } });
  return { attempt, answer, autoAnswer, gradeItem, examId: created.id, manualId: manual.id, automaticId: automatic.id };
}
function form(attemptId: string, answerId: string, extra: Record<string, string> = {}) {
  const fd = new FormData();
  for (const [key, value] of Object.entries({ attemptId, [`score_${answerId}`]: "2,5",
    [`feedback_${answerId}`]: "Buen razonamiento", reason: "Revisión de las respuestas del intento", ...extra })) fd.set(key, value);
  return fd;
}
async function unchanged(attemptId: string, gradeItemId: string) {
  assert.equal((await db.examAttempt.findUniqueOrThrow({ where: { id: attemptId } })).status, "SUBMITTED");
  assert.equal(await db.gradeEntry.count({ where: { gradeItemId } }), 0);
  assert.equal(paths.length, 0);
}

test("legacy direct review uses frozen questions and preserves the correction reason and history", async () => {
  const data = await pending();
  await updateQuestion(A.teacher, data.manualId, {
    type: "TRUE_FALSE", prompt: `${TAG} Changed to true false`, answer: "Falso", points: 99,
  });
  await updateQuestion(A.teacher, data.automaticId, {
    type: "SHORT_ANSWER", prompt: `${TAG} Changed to open`, answer: "New answer", points: 99,
  });
  const oldGrade = await db.gradeEntry.create({ data: {
    institutionId: A.institutionId, gradeItemId: data.gradeItem.id, enrollmentId: data.attempt.enrollmentId,
    score: 1, feedback: "Anterior", gradedById: A.teacher.id,
  } });
  const reason = "Corregida después de comprobar la respuesta original";
  const result = await reviewExamAttempt(initial, form(data.attempt.id, data.answer.id, {
    reason, institutionId: B.institutionId, userId: B.teacher.id,
  }));
  assert.equal(result.ok, true, result.message);
  const graded = await db.examAttempt.findUniqueOrThrow({ where: { id: data.attempt.id }, include: { answers: true } });
  assert.deepEqual([graded.status, graded.score, graded.maxScore], ["GRADED", 4.5, 5]);
  assert.equal(graded.answers.find((answer) => answer.id === data.autoAnswer.id)?.score, 2);
  const revision = await db.gradeEntryRevision.findFirstOrThrow({ where: { gradeEntryId: oldGrade.id } });
  assert.deepEqual([revision.previousScore, revision.newScore, revision.reason, revision.actorId, revision.institutionId],
    [1, 4.5, reason, A.teacher.id, A.institutionId]);
  assert.equal((await db.gradeEntry.findUniqueOrThrow({ where: { id: oldGrade.id } })).score, 4.5);
  assert.deepEqual(paths, [`/dashboard/aula/${A.courseId}`]);
  assert.equal((await reviewExamAttempt(initial, form(data.attempt.id, data.answer.id))).ok, false);
  assert.equal(await db.gradeEntryRevision.count({ where: { gradeEntryId: oldGrade.id } }), 1);
});

test("legacy direct review rejects foreign actors, missing reason and invalid or missing scores without writes", async () => {
  const data = await pending();
  for (const outsider of [null, A.student, A.parent, A.teacher2, B.teacher, B.admin, B.coordinator]) {
    user = outsider;
    assert.equal((await reviewExamAttempt(initial, form(data.attempt.id, data.answer.id))).ok, false);
    await unchanged(data.attempt.id, data.gradeItem.id);
  }
  user = A.teacher;
  for (const score of ["", " ", "-1", "3.01", "NaN", "Infinity"]) {
    const result = await reviewExamAttempt(initial, form(data.attempt.id, data.answer.id, { [`score_${data.answer.id}`]: score }));
    assert.equal(result.ok, false);
    await unchanged(data.attempt.id, data.gradeItem.id);
  }
  for (const answerId of ["foreign-answer", data.autoAnswer.id]) {
    const result = await reviewExamAttempt(initial, form(data.attempt.id, data.answer.id, { [`score_${answerId}`]: "0" }));
    assert.equal(result.ok, false);
    assert.match(result.message, /respuestas.*Exámenes/);
    await unchanged(data.attempt.id, data.gradeItem.id);
  }

  const missing = form(data.attempt.id, data.answer.id); missing.delete(`score_${data.answer.id}`);
  assert.equal((await reviewExamAttempt(initial, missing)).ok, false);
  const noReason = await reviewExamAttempt(initial, form(data.attempt.id, data.answer.id, { reason: " " }));
  assert.equal(noReason.ok, false); assert.match(noReason.message, /motivo.*Exámenes/);
  await unchanged(data.attempt.id, data.gradeItem.id);
});

test("legacy direct review refuses missing snapshots and mismatched mutable point rows", async () => {
  const data = await pending();
  const question = await db.examQuestion.findFirstOrThrow({ where: { examId: data.examId, bankItemId: data.manualId } });
  await db.examQuestion.update({ where: { id: question.id }, data: { snapshot: Prisma.DbNull } });
  const missing = await reviewExamAttempt(initial, form(data.attempt.id, data.answer.id));
  assert.equal(missing.ok, false); assert.match(missing.message, /Exámenes/);
  await unchanged(data.attempt.id, data.gradeItem.id);
  await db.examQuestion.update({ where: { id: question.id }, data: { snapshot: question.snapshot as Prisma.InputJsonValue, points: 99 } });
  assert.equal((await reviewExamAttempt(initial, form(data.attempt.id, data.answer.id))).ok, false);
  await unchanged(data.attempt.id, data.gradeItem.id);
});

test("an incomplete legacy attempt cannot be graded even if the submitted manual score is valid", async () => {
  const data = await pending();
  await db.examAnswer.delete({ where: { id: data.autoAnswer.id } });
  const result = await reviewExamAttempt(initial, form(data.attempt.id, data.answer.id));
  assert.equal(result.ok, false); assert.match(result.message, /Exámenes/);
  await unchanged(data.attempt.id, data.gradeItem.id);
});

test("concurrent legacy reviews use the canonical single-review claim", async () => {
  const data = await pending();
  const results = await Promise.all([
    reviewExamAttempt(initial, form(data.attempt.id, data.answer.id)),
    reviewExamAttempt(initial, form(data.attempt.id, data.answer.id, { [`score_${data.answer.id}`]: "1" })),
  ]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(await db.gradeEntry.count({ where: { gradeItemId: data.gradeItem.id } }), 1);
  assert.equal(paths.length, 1);
});
