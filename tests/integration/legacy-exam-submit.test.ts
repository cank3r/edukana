import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { db } from "@/lib/db";
import type { EdukanaRole } from "@/types/next-auth";
import { questionSnapshot, startExamAttempt, submitExamAttempt } from "@/server/exams";
import { loadLegacyExamActions } from "../helpers/legacy-exam-actions.mjs";
import { A, B, ensureSeed } from "./setup";

// CI only: the real legacy action uses a mocked session and the actual PostgreSQL database.
const prefix = "it_legacy_exam_";
const questionId = `${prefix}question`;
const T0 = new Date("2026-10-09T12:00:00Z");
let user: { id: string; institutionId: string; role: EdukanaRole } | null;
let submitLegacy: (state: { ok: boolean; message: string }, data: FormData) => Promise<{ ok: boolean; message: string }>;

before(async () => {
  await ensureSeed();
  const base = { institutionId: A.institutionId, courseId: A.courseId };
  await db.questionBankItem.create({ data: {
    id: questionId, ...base, type: "TRUE_FALSE", prompt: "Pregunta de prueba", answerKey: "Verdadero", defaultPoints: 1,
  } });
  await db.gradingPeriod.create({ data: {
    id: `${prefix}period`, ...base, academicPeriodId: "a_period", name: "Pruebas de entrega antigua",
    startDate: new Date("2026-09-01"), endDate: new Date("2026-12-31"),
    categories: { create: { id: `${prefix}category`, ...base, name: "Exámenes", weight: 100 } },
  } });
  const actions = await loadLegacyExamActions({
    db, auth: async () => user ? { user } : null,
    getEffectiveCapabilities: async () => new Set(["course.participate"]),
    revalidatePath: () => { throw new Error("A rejected legacy payload must not revalidate"); },
  });
  submitLegacy = actions.submitExam;
});
beforeEach(() => { user = A.student; });
after(async () => {
  await db.gradingPeriod.deleteMany({ where: { id: `${prefix}period` } });
  await db.exam.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.questionBankItem.deleteMany({ where: { id: questionId } });
  await db.$disconnect();
});

async function makeExam(suffix: string) {
  const id = `${prefix}${suffix}`;
  const bank = await db.questionBankItem.findUniqueOrThrow({ where: { id: questionId } });
  await db.exam.create({ data: {
    id, institutionId: A.institutionId, courseId: A.courseId, title: "Examen con tiempo", isPublished: true,
    maxAttempts: 2, durationMinutes: 1,
    questions: { create: {
      institutionId: A.institutionId, bankItemId: questionId, order: 0, points: 1, snapshot: questionSnapshot(bank, 1),
    } },
    gradeItem: { create: {
      institutionId: A.institutionId, courseId: A.courseId, gradingPeriodId: `${prefix}period`,
      categoryId: `${prefix}category`, title: "Nota del examen", maxScore: 1,
    } },
  } });
  return id;
}
function payload(examId: string, attemptId?: string) {
  const fd = new FormData();
  fd.set("examId", examId);
  fd.set(`question_${questionId}`, "Falso");
  fd.set("expiresAt", "2099-01-01T00:00:00Z");
  if (attemptId) fd.set("attemptId", attemptId);
  return fd;
}
async function snapshot(examId: string) {
  return {
    attempts: await db.examAttempt.findMany({ where: { examId }, orderBy: { id: "asc" }, include: { answers: true } }),
    grades: await db.gradeEntry.findMany({ where: { gradeItem: { examId } }, include: { revisions: true } }),
  };
}
async function rejectsWithoutMutation(examId: string, attemptId?: string) {
  const before = await snapshot(examId);
  const result = await submitLegacy({ ok: false, message: "" }, payload(examId, attemptId));
  assert.equal(result.ok, false);
  assert.deepEqual(await snapshot(examId), before);
}

test("legacy action cannot create an attempt, even on repeated direct calls", async () => {
  const examId = await makeExam("absent");
  await rejectsWithoutMutation(examId);
  await rejectsWithoutMutation(examId);
  await rejectsWithoutMutation(examId, "missing-attempt");
  assert.equal(await db.examAttempt.count({ where: { examId } }), 0);
});

test("legacy action cannot alter a running timer, score against changed bank answers, or replace grade history", async () => {
  const examId = await makeExam("snapshot");
  const first = await startExamAttempt(A.student, examId, T0);
  assert.ok(first.ok);
  if (!first.ok) return;
  await db.questionBankItem.update({ where: { id: questionId }, data: { answerKey: "Falso" } });
  try {
    await rejectsWithoutMutation(examId, first.attemptId);
    const resumed = await startExamAttempt(A.student, examId, new Date(T0.getTime() + 10_000));
    assert.ok(resumed.ok);
    if (!resumed.ok) return;
    assert.equal(resumed.attemptId, first.attemptId);
    assert.equal(resumed.expiresAt.getTime(), first.expiresAt.getTime());
    const scored = await submitExamAttempt(A.student, first.attemptId, { [questionId]: "Verdadero" },
      new Date(T0.getTime() + 20_000));
    assert.equal(scored.ok && scored.score, 1, "the timed service uses the original immutable key");
    await rejectsWithoutMutation(examId, first.attemptId);
    const second = await startExamAttempt(A.student, examId, new Date(T0.getTime() + 30_000));
    assert.ok(second.ok);
    if (!second.ok) return;
    await submitExamAttempt(A.student, second.attemptId, { [questionId]: "Falso" }, new Date(T0.getTime() + 40_000));
    const entry = await db.gradeEntry.findFirstOrThrow({ where: { gradeItem: { examId } }, include: { revisions: true } });
    assert.equal(entry.revisions.length, 1);
    await rejectsWithoutMutation(examId, second.attemptId);
    const exhausted = await startExamAttempt(A.student, examId, new Date(T0.getTime() + 50_000));
    assert.equal(exhausted.ok, false);
  } finally {
    await db.questionBankItem.update({ where: { id: questionId }, data: { answerKey: "Verdadero" } });
  }
});

test("legacy action cannot revive an expired attempt; authoritative late submit keeps its deadline", async () => {
  const examId = await makeExam("expired");
  const started = await startExamAttempt(A.student, examId, T0);
  assert.ok(started.ok);
  if (!started.ok) return;
  await rejectsWithoutMutation(examId, started.attemptId);
  const late = await submitExamAttempt(A.student, started.attemptId, { [questionId]: "Verdadero" },
    new Date(T0.getTime() + 91_000));
  assert.equal(late.ok, false);
  assert.equal(!late.ok && late.reason, "expired");
  await rejectsWithoutMutation(examId, started.attemptId);
});

test("direct legacy calls cannot change another student's or institution's attempts, regardless of role", async () => {
  const examId = await makeExam("isolation");
  const started = await startExamAttempt(A.student, examId, T0);
  assert.ok(started.ok);
  if (!started.ok) return;
  for (const actor of [A.student2, B.student, A.teacher, A.admin, A.coordinator, A.parent, null]) {
    user = actor;
    await rejectsWithoutMutation(examId, started.attemptId);
  }
});
