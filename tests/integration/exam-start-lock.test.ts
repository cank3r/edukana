import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { db } from "@/lib/db";
import { LOCKED_MESSAGE, updateExam, type ExamInput } from "@/server/assessment/exam-admin";
import { questionSnapshot, startExamAttempt, submitExamAttempt } from "@/server/exams";
import { A, ensureSeed } from "./setup";

// Only the isolated PostgreSQL integration runner may execute this suite.
const PREFIX = "it_exam_lock_";
const OLD = `${PREFIX}old`;
const NEW = `${PREFIX}new`;
const PERIOD = `${PREFIX}period`;
const CATEGORY = `${PREFIX}category`;
const scope = { institutionId: A.institutionId, courseId: A.courseId };
let seeded = false;

before(async () => {
  await ensureSeed();
  seeded = true;
  await db.questionBankItem.createMany({ data: [
    { id: OLD, ...scope, type: "TRUE_FALSE", prompt: "Original question", answerKey: "Verdadero", defaultPoints: 2 },
    { id: NEW, ...scope, type: "TRUE_FALSE", prompt: "Replacement question", answerKey: "Falso", defaultPoints: 7 },
  ] });
  await db.gradingPeriod.create({ data: {
    id: PERIOD, ...scope, academicPeriodId: "a_period", name: "Exam lock regression",
    startDate: new Date("2026-09-01"), endDate: new Date("2026-12-31"),
    categories: { create: { id: CATEGORY, ...scope, name: "Exams", weight: 100 } },
  } });
});

after(async () => {
  if (seeded) {
    await db.exam.deleteMany({ where: { id: { startsWith: PREFIX } } });
    await db.gradingPeriod.deleteMany({ where: { id: PERIOD } });
    await db.questionBankItem.deleteMany({ where: { id: { in: [OLD, NEW] } } });
  }
  await db.$disconnect();
});

async function makeExam(suffix: string) {
  const id = `${PREFIX}${suffix}`;
  const bank = await db.questionBankItem.findUniqueOrThrow({ where: { id: OLD } });
  return db.exam.create({ data: {
    id, ...scope, title: "Exam lock regression", isPublished: true, durationMinutes: 30, maxAttempts: 2, showReview: true,
    questions: { create: {
      institutionId: A.institutionId, bankItemId: OLD, points: 2, order: 0, snapshot: questionSnapshot(bank, 2),
    } },
    gradeItem: { create: {
      ...scope, gradingPeriodId: PERIOD, categoryId: CATEGORY, title: "Exam lock regression", maxScore: 2,
    } },
  }, include: { gradeItem: true } });
}

const changedInput: ExamInput = {
  title: "Updated exam", questions: [{ bankItemId: NEW, points: 7 }], durationMinutes: 5, maxAttempts: 2, showReview: true,
};

/** Hold a real row lock until the test has observed both competing transactions waiting. */
function holdRow(kind: "enrollment" | "grade", id: string) {
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  let acquired!: (pid: number) => void;
  let failed!: (error: unknown) => void;
  const ready = new Promise<number>((resolve, reject) => { acquired = resolve; failed = reject; });
  const finished = db.$transaction(async (tx) => {
    if (kind === "enrollment") await tx.$queryRaw`SELECT "id" FROM "enrollments" WHERE "id" = ${id} FOR UPDATE`;
    else await tx.$queryRaw`SELECT "id" FROM "grade_items" WHERE "id" = ${id} FOR UPDATE`;
    const [backend] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
    acquired(backend.pid);
    await released;
  }, { timeout: 20_000 });
  void finished.catch(failed);
  return { ready, release, finished };
}

/** Observe PostgreSQL's actual wait graph instead of assuming which Promise ran first. */
async function blockedBy(blockerPid: number, table: string) {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const rows = await db.$queryRaw<Array<{ pid: number }>>`
      SELECT pid FROM pg_stat_activity
      WHERE ${blockerPid} = ANY(pg_blocking_pids(pid)) AND position(${table} IN query) > 0`;
    if (rows.length) return rows[0].pid;
    await delay(15);
  }
  throw new Error(`No transaction waited for ${table} behind backend ${blockerPid}.`);
}

test("first start holds the exam while editing waits, then the edit cannot change its questions or rules", async () => {
  const exam = await makeExam("start_first");
  const held = holdRow("enrollment", "a_enrollment");
  const now = new Date("2026-10-09T12:00:00Z");
  let started: ReturnType<typeof startExamAttempt> | undefined;
  let edited: ReturnType<typeof updateExam> | undefined;
  try {
    const holderPid = await held.ready;
    started = startExamAttempt(A.student, exam.id, now);
    const startPid = await blockedBy(holderPid, "enrollments");
    edited = updateExam(A.teacher, exam.id, changedInput);
    await blockedBy(startPid, "exams");
  } finally {
    held.release();
    await Promise.allSettled([held.finished, started, edited]);
  }
  const result = await started;
  assert.ok(result?.ok);
  assert.deepEqual(await edited, { ok: false, message: LOCKED_MESSAGE });
  assert.deepEqual(result.questions.map(({ bankItemId, points }) => ({ bankItemId, points })), [{ bankItemId: OLD, points: 2 }]);
  assert.equal(result.expiresAt.toISOString(), "2026-10-09T12:30:00.000Z");
  const persisted = await db.exam.findUniqueOrThrow({ where: { id: exam.id }, include: { questions: true } });
  assert.deepEqual([persisted.questions[0].bankItemId, persisted.durationMinutes], [OLD, 30]);
  const sent = await submitExamAttempt(A.student, result.attemptId, { [OLD]: "Verdadero" }, now);
  assert.equal(sent.ok && sent.score, 2);
  assert.equal(sent.ok && sent.maxScore, 2);
});

test("editing first commits a complete question set before start reads snapshots and grading rules", async () => {
  const exam = await makeExam("edit_first");
  assert.ok(exam.gradeItem);
  const held = holdRow("grade", exam.gradeItem.id);
  const now = new Date("2026-10-09T12:00:00Z");
  let started: ReturnType<typeof startExamAttempt> | undefined;
  let edited: ReturnType<typeof updateExam> | undefined;
  try {
    const holderPid = await held.ready;
    edited = updateExam(A.teacher, exam.id, changedInput);
    const editPid = await blockedBy(holderPid, "grade_items");
    started = startExamAttempt(A.student, exam.id, now);
    await blockedBy(editPid, "exams");
  } finally {
    held.release();
    await Promise.allSettled([held.finished, started, edited]);
  }
  assert.equal((await edited)?.ok, true);
  const result = await started;
  assert.ok(result?.ok);
  assert.deepEqual(result.questions.map(({ bankItemId, points }) => ({ bankItemId, points })), [{ bankItemId: NEW, points: 7 }]);
  assert.equal(result.expiresAt.toISOString(), "2026-10-09T12:05:00.000Z");
  const persisted = await db.exam.findUniqueOrThrow({ where: { id: exam.id }, include: { questions: true } });
  assert.deepEqual([persisted.questions[0].bankItemId, persisted.durationMinutes], [NEW, 5]);
  const sent = await submitExamAttempt(A.student, result.attemptId, { [NEW]: "Falso" }, now);
  assert.equal(sent.ok && sent.score, 7);
  assert.equal(sent.ok && sent.maxScore, 7);
});
