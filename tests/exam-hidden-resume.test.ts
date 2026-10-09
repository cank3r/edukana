import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import type { PrismaClient } from "@prisma/client";

// A query-aware, read-only fake exercises the actual readers without constructing a DB client.
type Row = Record<string, unknown>;
const actor = { id: "student", institutionId: "institution" };
const now = new Date("2026-10-09T12:00:00Z");
const expiresAt = new Date(now.getTime() + 60_000);
const key = "private-snapshot-answer";
const explanation = "private-bank-explanation";
let published = false;
let enrollmentStatus = "ACTIVE";
let attemptStatus = "IN_PROGRESS";
let deadline: Date | null = expiresAt;
let attemptStudent = actor.id;
let attemptInstitution = actor.institutionId;
let enrollmentStudent = actor.id;
let enrollmentInstitution = actor.institutionId;
let hasAttempt = true;
let hasEnrollment = true;
let previousGrade = false;

function matches(value: unknown, condition: unknown): boolean {
  if (condition === null || typeof condition !== "object") return value === condition;
  if (condition instanceof Date) return value instanceof Date && value.getTime() === condition.getTime();
  return Object.entries(condition).every(([key, expected]) => {
    if (key === "OR") return (expected as unknown[]).some((item) => matches(value, item));
    if (key === "in") return (expected as unknown[]).includes(value);
    if (key === "gt") return value instanceof Date && expected instanceof Date && value > expected;
    if (key === "some") return Array.isArray(value) && value.some((item) => matches(item, expected));
    return value !== null && typeof value === "object" && matches((value as Row)[key], expected);
  });
}

function select(row: Row, fields: Row): Row {
  return Object.fromEntries(Object.entries(fields).map(([key, spec]) => {
    if (spec === true) return [key, row[key]];
    const nested = spec as { select: Row; where?: Row };
    const value = row[key];
    if (Array.isArray(value)) return [key, value.filter((item) => matches(item, nested.where ?? {}))
      .map((item) => select(item, nested.select))];
    return [key, value == null ? value : select(value as Row, nested.select)];
  }));
}

function rows() {
  const course: Row = { id: "course", name: "Course", institutionId: actor.institutionId, institution: { timezone: "UTC" } };
  const enrollment = {
    id: "enrollment", courseId: "course", studentId: enrollmentStudent, institutionId: enrollmentInstitution,
    status: enrollmentStatus, course,
  };
  const question = {
    bankItemId: "question", order: 0, points: 1,
    snapshot: { type: "SHORT_ANSWER", prompt: "Frozen prompt", options: null, answerKey: key, points: 1 },
    bankItem: { type: "SHORT_ANSWER", prompt: "Changed prompt", options: null, answerKey: "changed-key", explanation },
  };
  const exam: Row = {
    id: "exam", institutionId: actor.institutionId, courseId: "course", title: "Exam", instructions: "Read carefully.",
    isPublished: published, opensAt: null, closesAt: null, durationMinutes: 10, maxAttempts: 3, showReview: true,
    course, questions: [question], _count: { questions: 1 },
  };
  const attempt = {
    id: "attempt", examId: "exam", studentId: attemptStudent, institutionId: attemptInstitution,
    enrollmentId: "enrollment", enrollment: hasEnrollment ? enrollment : null,
    attemptNumber: 2, status: attemptStatus, expiresAt: deadline, score: null, maxScore: null, exam,
  };
  const attempts: Row[] = hasAttempt ? [attempt] : [];
  if (previousGrade) attempts.push({ ...attempt, id: "previous", attemptNumber: 1, status: "GRADED", score: 1, maxScore: 1 });
  exam.attempts = attempts;
  course.exams = [exam];
  return { exam: [exam], examAttempt: attempts, enrollment: hasEnrollment ? [enrollment] : [], course: [course] };
}

function model(name: keyof ReturnType<typeof rows>) {
  return { findFirst: async ({ where, select: fields }: { where: Row; select: Row }) => {
    const row = rows()[name].find((candidate) => matches(candidate, where));
    return row ? select(row, fields) : null;
  } };
}
const fake = { exam: model("exam"), examAttempt: model("examAttempt"), enrollment: model("enrollment"), course: model("course") };
const db = { ...fake, $transaction: async (run: (tx: typeof fake) => unknown) => run(fake) };
(globalThis as unknown as { prisma: PrismaClient }).prisma = db as unknown as PrismaClient;

beforeEach(() => {
  published = false;
  enrollmentStatus = "ACTIVE";
  attemptStatus = "IN_PROGRESS";
  deadline = expiresAt;
  attemptStudent = enrollmentStudent = actor.id;
  attemptInstitution = enrollmentInstitution = actor.institutionId;
  hasAttempt = hasEnrollment = true;
  previousGrade = false;
});

function assertPrivate(value: unknown) {
  const json = JSON.stringify(value);
  for (const secret of [key, explanation, "changed-key", "answerKey", "correctAnswer"]) {
    assert.equal(json.includes(secret), false, `must not expose ${secret}`);
  }
}

test("hidden exam resumes only the existing attempt, with its original clock and safe snapshot", async () => {
  const { getExamIntro, getOngoingAttempt, getAttemptResult, listStudentExams } =
    await import("../src/server/assessment/exam-taking");
  previousGrade = true;
  const intro = await getExamIntro(actor, "exam", now);
  assert.ok(intro);
  assert.equal(intro.hasOngoingAttempt, true);
  assert.equal(intro.canStart, false, "hiding never offers a new start");
  assert.equal(intro.best, null, "resuming does not expose previous grades");
  assert.equal(intro.lastFinishedAttemptId, null);
  assert.equal(intro.pendingReview, false);
  assert.equal(JSON.stringify(intro).includes("Frozen prompt"), false);
  const ongoing = await getOngoingAttempt(actor, "exam", now);
  assert.ok(ongoing);
  assert.equal(ongoing.attemptId, "attempt");
  assert.equal(ongoing.attemptNumber, 2);
  assert.deepEqual(ongoing.expiresAt, expiresAt);
  assert.deepEqual(ongoing.serverNow, now);
  assert.equal(ongoing.questions[0].prompt, "Frozen prompt");
  assertPrivate(intro);
  assertPrivate(ongoing);
  assert.equal(await getAttemptResult(actor, "attempt", now), null);
  assert.equal(await getAttemptResult(actor, "previous", now), null);
  assert.deepEqual((await listStudentExams(actor, "course", now))?.exams, []);
  const { startExamAttempt } = await import("../src/server/exams");
  const result = await startExamAttempt(actor, "exam", now);
  assert.equal(result.ok, false, "the unchanged start action rejects hidden exams before any write");
});

test("hidden exam is not exposed to another student, institution, or missing enrollment", async () => {
  const { getExamIntro, getOngoingAttempt } = await import("../src/server/assessment/exam-taking");
  for (const other of [{ ...actor, id: "other-student" }, { ...actor, institutionId: "other-institution" }]) {
    assert.equal(await getExamIntro(other, "exam", now), null);
    assert.equal(await getOngoingAttempt(other, "exam", now), null);
  }
  hasEnrollment = false;
  assert.equal(await getExamIntro(actor, "exam", now), null);
  assert.equal(await getOngoingAttempt(actor, "exam", now), null);
});

test("hidden exam rejects absent, terminal, expired and undated attempts", async () => {
  const { getExamIntro, getOngoingAttempt } = await import("../src/server/assessment/exam-taking");
  for (const status of ["SUBMITTED", "GRADED"]) {
    attemptStatus = status;
    assert.equal(await getExamIntro(actor, "exam", now), null, status);
    assert.equal(await getOngoingAttempt(actor, "exam", now), null, status);
  }
  attemptStatus = "IN_PROGRESS";
  for (const expiry of [now, new Date(now.getTime() - 1), null]) {
    deadline = expiry;
    assert.equal(await getExamIntro(actor, "exam", now), null, String(expiry));
    assert.equal(await getOngoingAttempt(actor, "exam", now), null, String(expiry));
  }
  deadline = expiresAt;
  hasAttempt = false;
  assert.equal(await getExamIntro(actor, "exam", now), null);
  assert.equal(await getOngoingAttempt(actor, "exam", now), null);
});

test("hidden exam requires an active enrollment belonging to the attempt owner and institution", async () => {
  const { getExamIntro, getOngoingAttempt } = await import("../src/server/assessment/exam-taking");
  for (const status of ["COMPLETED", "DROPPED", "FAILED"]) {
    enrollmentStatus = status;
    assert.equal(await getExamIntro(actor, "exam", now), null, status);
    assert.equal(await getOngoingAttempt(actor, "exam", now), null, status);
  }
  enrollmentStatus = "ACTIVE";
  for (const field of ["attemptStudent", "attemptInstitution", "enrollmentStudent", "enrollmentInstitution"]) {
    attemptStudent = enrollmentStudent = actor.id;
    attemptInstitution = enrollmentInstitution = actor.institutionId;
    if (field === "attemptStudent") attemptStudent = "other";
    if (field === "attemptInstitution") attemptInstitution = "other";
    if (field === "enrollmentStudent") enrollmentStudent = "other";
    if (field === "enrollmentInstitution") enrollmentInstitution = "other";
    assert.equal(await getExamIntro(actor, "exam", now), null, field);
    assert.equal(await getOngoingAttempt(actor, "exam", now), null, field);
  }
});

test("published introductions keep new-start, completed-enrollment and expired-attempt behavior", async () => {
  const { getExamIntro, getOngoingAttempt } = await import("../src/server/assessment/exam-taking");
  published = true;
  hasAttempt = false;
  assert.equal((await getExamIntro(actor, "exam", now))?.canStart, true);
  hasAttempt = true;
  deadline = now;
  const expired = await getExamIntro(actor, "exam", now);
  assert.equal(expired?.hasUnsubmittedExpiredAttempt, true);
  assert.equal(expired?.lastFinishedAttemptId, null);
  assert.equal(await getOngoingAttempt(actor, "exam", now), null);
  enrollmentStatus = "COMPLETED";
  assert.equal((await getExamIntro(actor, "exam", now))?.startBlock, "course_finished");
  assert.equal(await getOngoingAttempt(actor, "exam", now), null);
});
