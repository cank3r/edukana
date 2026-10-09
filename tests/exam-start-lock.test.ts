import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import type { ExamInput } from "../src/server/assessment/exam-admin";

// Exercise the real functions without constructing a client or connecting to a database.
const now = new Date("2026-10-09T12:00:00Z");
const student = { id: "student", institutionId: "institution" };
const teacher = { id: "teacher", institutionId: "institution", role: "TEACHER" as const };
function question(id = "old", points = 2) {
  const bankItem = { type: "TRUE_FALSE" as const, prompt: `Question ${id}`, options: null, answerKey: "Verdadero" };
  return { bankItemId: id, order: 0, points, snapshot: { ...bankItem, points }, bankItem };
}
function initialExam() {
  return {
    id: "exam", institutionId: "institution", courseId: "course", title: "Exam title", isPublished: true,
    opensAt: null as Date | null, closesAt: null as Date | null, durationMinutes: 30, maxAttempts: 2,
    showReview: true, gradeItem: { id: "grade", _count: { entries: 0 } }, questions: [question()], _count: { attempts: 0 },
  };
}
type Attempt = { id: string; attemptNumber: number; status: string; expiresAt: Date };
let exam = initialExam();
let attempts: Attempt[] = [];
let events: string[] = [];
let afterExamLock: (() => void) | undefined;
let enrollmentActive = true;
let examExists = true;
let writes: Array<{ kind: string; data: unknown }> = [];

function examReader(transaction: boolean) {
  return async ({ where }: { where: { id?: string; institutionId?: string; courseId?: string; isPublished?: boolean } }) => {
    events.push(transaction ? "exam.read" : "exam.authorize");
    if (!examExists || where.id !== exam.id || where.institutionId !== exam.institutionId ||
      (where.courseId && where.courseId !== exam.courseId) || (where.isPublished && !exam.isPublished)) return null;
    return structuredClone({ ...exam, _count: { attempts: attempts.length } });
  };
}
const tx = {
  $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join("?");
    if (sql.includes('FROM "exams"')) {
      events.push("exam.lock");
      assert.match(sql, /"institutionId"\s*=\s*\?/);
      assert.match(sql, /FOR UPDATE/);
      afterExamLock?.();
      if (!examExists || values[0] !== exam.id || values[1] !== exam.institutionId) return [];
      if (sql.includes('"isPublished"') && !exam.isPublished) return [];
      return [{ id: exam.id }];
    }
    assert.match(sql, /FROM "enrollments"/);
    assert.match(sql, /"status" = 'ACTIVE'/);
    assert.deepEqual(values, [student.id, exam.courseId]);
    events.push("enrollment.lock");
    return enrollmentActive ? [{ id: "enrollment" }] : [];
  },
  exam: {
    findFirst: examReader(true),
    update: async ({ data }: { data: object }) => { events.push("exam.update"); writes.push({ kind: "exam", data }); },
  },
  examAttempt: {
    findMany: async () => { events.push("attempts.read"); return structuredClone(attempts); },
    count: async () => { events.push("attempts.count"); return attempts.length; },
    create: async ({ data }: { data: object }) => { events.push("attempt.create"); writes.push({ kind: "attempt", data }); return { id: "attempt" }; },
    update: async ({ data }: { data: object }) => { writes.push({ kind: "attempt.update", data }); },
  },
  questionBankItem: {
    findMany: async () => { events.push("bank.read"); return [{ id: "new", ...question("new").bankItem }]; },
  },
  examQuestion: {
    deleteMany: async () => { events.push("questions.delete"); },
    createMany: async ({ data }: { data: object }) => { events.push("questions.create"); writes.push({ kind: "questions", data }); },
  },
  gradeItem: { update: async ({ data }: { data: object }) => { writes.push({ kind: "grade", data }); } },
};
const fake = {
  $transaction: async (run: (client: typeof tx) => Promise<unknown>, options?: { isolationLevel: string }) => {
    events.push("transaction");
    assert.equal(options?.isolationLevel, "ReadCommitted");
    return run(tx);
  },
  exam: { findFirst: examReader(false) },
  roleCapabilityOverride: { findMany: async () => [] },
  course: { findFirst: async ({ where }: { where: { AND: Array<{ teacherId?: string }> } }) => {
    if (where.AND.some((scope) => scope.teacherId && scope.teacherId !== teacher.id)) return null;
    return { id: exam.courseId, name: "Course", teacherId: teacher.id, institution: { timezone: "UTC" } };
  } },
  questionBankItem: tx.questionBankItem,
};
(globalThis as unknown as { prisma: PrismaClient }).prisma = fake as unknown as PrismaClient;
let startExamAttempt: typeof import("../src/server/exams").startExamAttempt;
let updateExam: typeof import("../src/server/assessment/exam-admin").updateExam;
let LOCKED_MESSAGE: string;
before(async () => {
  ({ startExamAttempt } = await import("../src/server/exams"));
  ({ LOCKED_MESSAGE, updateExam } = await import("../src/server/assessment/exam-admin"));
});

function input(extra: Partial<ExamInput> = {}): ExamInput {
  return { title: "Updated title", questions: [{ bankItemId: "old", points: 2 }], durationMinutes: 30,
    maxAttempts: 2, showReview: true, ...extra };
}
beforeEach(() => {
  exam = initialExam(); attempts = []; events = []; afterExamLock = undefined;
  enrollmentActive = true; examExists = true; writes = [];
});

test("start locks the scoped exam before snapshots, enrollment and attempts", async () => {
  const result = await startExamAttempt(student, exam.id, now);
  assert.ok(result.ok);
  assert.deepEqual(events, ["transaction", "exam.lock", "exam.read", "enrollment.lock", "attempts.read", "attempt.create"]);
  assert.equal(result.expiresAt.toISOString(), "2026-10-09T12:30:00.000Z");
  assert.equal(JSON.stringify(result.questions).includes("answerKey"), false);
});

test("edit winning the lock supplies the new questions, points and duration to start", async () => {
  afterExamLock = () => { exam.questions = [question("new", 7)]; exam.durationMinutes = 5; };
  const result = await startExamAttempt(student, exam.id, now);
  assert.ok(result.ok);
  assert.deepEqual(result.questions.map(({ bankItemId, points }) => ({ bankItemId, points })), [{ bankItemId: "new", points: 7 }]);
  assert.equal(result.expiresAt.toISOString(), "2026-10-09T12:05:00.000Z");
});

test("start rechecks publication after waiting for the exam lock", async () => {
  afterExamLock = () => { exam.isPublished = false; };
  assert.equal((await startExamAttempt(student, exam.id, now)).ok, false);
  assert.equal(writes.length, 0);
  assert.equal(events.includes("enrollment.lock"), false);
});

test("start cannot lock or reveal another institution's exam", async () => {
  const result = await startExamAttempt({ ...student, institutionId: "other" }, exam.id, now);
  assert.equal(!result.ok && result.reason, "unavailable");
  assert.equal(events.includes("exam.read"), false);
  assert.equal(writes.length, 0);
});

test("start still requires an active enrollment", async () => {
  enrollmentActive = false;
  const result = await startExamAttempt(student, exam.id, now);
  assert.equal(!result.ok && result.reason, "not_enrolled");
  assert.equal(writes.length, 0);
});

test("start preserves attempt resumption and its original deadline", async () => {
  attempts = [{ id: "running", attemptNumber: 1, status: "IN_PROGRESS", expiresAt: new Date(now.getTime() + 1_000) }];
  const result = await startExamAttempt(student, exam.id, now);
  assert.ok(result.ok);
  assert.deepEqual([result.attemptId, result.resumed, result.expiresAt], ["running", true, attempts[0].expiresAt]);
  assert.equal(writes.length, 0);
});

test("start preserves schedule, maximum attempts and close-based deadline", async () => {
  exam.opensAt = new Date(now.getTime() + 1_000);
  assert.equal((await startExamAttempt(student, exam.id, now)).ok, false);
  exam.opensAt = null;
  attempts = [1, 2].map((attemptNumber) => ({ id: String(attemptNumber), attemptNumber, status: "GRADED", expiresAt: now }));
  const exhausted = await startExamAttempt(student, exam.id, now);
  assert.equal(!exhausted.ok && exhausted.reason, "no_attempts_left");
  attempts = [];
  exam.closesAt = new Date(now.getTime() + 60_000);
  const result = await startExamAttempt(student, exam.id, now);
  assert.ok(result.ok);
  assert.equal(result.expiresAt.getTime(), exam.closesAt.getTime());
});

test("start winning the lock prevents a concurrent edit from replacing the questions", async () => {
  afterExamLock = () => { attempts = [{ id: "running", attemptNumber: 1, status: "IN_PROGRESS", expiresAt: now }]; };
  const result = await updateExam(teacher, exam.id, input({ questions: [{ bankItemId: "new", points: 7 }] }));
  assert.deepEqual(result, { ok: false, message: LOCKED_MESSAGE });
  assert.equal(writes.length, 0);
  assert.equal(events.includes("questions.delete"), false);
  assert.ok(events.indexOf("exam.lock") < events.indexOf("exam.read"));
});

test("edit compares rules and points against state read after the lock", async () => {
  afterExamLock = () => {
    attempts = [{ id: "running", attemptNumber: 1, status: "IN_PROGRESS", expiresAt: now }];
    exam.durationMinutes = 5; exam.questions = [question("old", 7)];
  };
  assert.deepEqual(await updateExam(teacher, exam.id, input()), { ok: false, message: LOCKED_MESSAGE });
  assert.equal(writes.length, 0);
});

test("edit keeps allowed title changes after an attempt starts during the lock wait", async () => {
  afterExamLock = () => { attempts = [{ id: "running", attemptNumber: 1, status: "IN_PROGRESS", expiresAt: now }]; };
  assert.equal((await updateExam(teacher, exam.id, input())).ok, true);
  assert.deepEqual(writes.map(({ kind }) => kind), ["exam", "grade"]);
  assert.equal(events.includes("questions.delete"), false);
});

test("edit keeps the latest snapshot if another edit won the lock", async () => {
  afterExamLock = () => { exam.questions[0].snapshot.prompt = "Latest frozen prompt"; };
  const result = await updateExam(teacher, exam.id, input({ questions: [{ bankItemId: "old", points: 4 }] }));
  assert.equal(result.ok, true);
  const data = writes.find(({ kind }) => kind === "questions")?.data as Array<{ snapshot: { prompt: string; points: number } }>;
  assert.deepEqual(data[0].snapshot, { ...question().snapshot, prompt: "Latest frozen prompt", points: 4 });
});

test("edit checks current publication before allowing an empty question set", async () => {
  exam.isPublished = false;
  afterExamLock = () => { exam.isPublished = true; };
  assert.equal((await updateExam(teacher, exam.id, input({ questions: [] }))).ok, false);
  assert.equal(writes.length, 0);
});

test("edit fails safely if the exam disappears before acquiring the lock", async () => {
  afterExamLock = () => { examExists = false; };
  assert.equal((await updateExam(teacher, exam.id, input())).ok, false);
  assert.equal(writes.length, 0);
});

test("edit preserves manager, teacher ownership and institution authorization", async () => {
  for (const actor of [{ ...teacher, id: "other-teacher" }, { ...teacher, institutionId: "other" },
    { ...teacher, role: "STUDENT" as const }, { ...teacher, role: "PARENT" as const }]) {
    assert.equal((await updateExam(actor, exam.id, input())).ok, false);
  }
  assert.equal(events.includes("transaction"), false);
  assert.equal(writes.length, 0);
});
