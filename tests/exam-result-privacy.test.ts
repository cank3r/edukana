import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";

// This suite never constructs a database client. Exercise the production reader with a read-only fake.
const expiresAt = new Date("2026-10-09T12:00:00Z");
let status = "IN_PROGRESS";
let showReview = true;
let enrollmentAllowed = true;
const key = "private-answer-key";
const question = {
  bankItemId: "question", order: 0, points: 1,
  snapshot: { type: "SHORT_ANSWER", prompt: "Question", options: null, answerKey: key, points: 1 },
  bankItem: { type: "SHORT_ANSWER", prompt: "Question", options: null, answerKey: key, explanation: "private-explanation" },
};
const attempt = () => ({
  id: "attempt", attemptNumber: 1, status, expiresAt, submittedAt: status === "IN_PROGRESS" ? null : expiresAt,
  score: 1, maxScore: 1, answers: [],
  exam: { id: "exam", title: "Exam", courseId: "course", showReview, opensAt: null, closesAt: null,
    maxAttempts: 1, course: { institution: { timezone: "UTC" } }, questions: [question], _count: { attempts: 1 } },
});
const fake = {
  examAttempt: { findFirst: async () => attempt() },
  enrollment: { findFirst: async () => enrollmentAllowed ? { id: "enrollment", status: "ACTIVE" } : null },
  exam: { findFirst: async () => ({
    ...attempt().exam, isPublished: true, instructions: null, durationMinutes: 1,
    course: { name: "Course", institution: { timezone: "UTC" } },
    _count: { questions: 1 }, attempts: [attempt()],
  }) },
};
(globalThis as unknown as { prisma: PrismaClient }).prisma = fake as unknown as PrismaClient;
const actor = { id: "student", institutionId: "institution" };

test("an unsubmitted attempt never exposes a result before, during or after the submission grace period", async () => {
  const { getAttemptResult, getExamIntro } = await import("../src/server/assessment/exam-taking");
  status = "IN_PROGRESS";
  for (const offset of [-1, 0, 15_000, 30_000, 30_001, 86_400_000]) {
    const now = new Date(expiresAt.getTime() + offset);
    assert.equal(await getAttemptResult(actor, "attempt", now), null, `offset ${offset}`);
    const intro = await getExamIntro(actor, "exam", now);
    assert.equal(intro?.lastFinishedAttemptId, null);
    assert.equal(intro?.hasUnsubmittedExpiredAttempt, offset >= 0);
  }
});

test("terminal attempts retain showReview policy and enrollment checks", async () => {
  const { getAttemptResult } = await import("../src/server/assessment/exam-taking");
  for (status of ["SUBMITTED", "GRADED"]) {
    showReview = true;
    enrollmentAllowed = true;
    const result = await getAttemptResult(actor, "attempt", expiresAt);
    assert.equal(result?.review?.[0].correctAnswer, key);
    showReview = false;
    const hidden = await getAttemptResult(actor, "attempt", expiresAt);
    assert.equal(hidden?.review, null);
    assert.equal(JSON.stringify(hidden).includes(key), false);
    enrollmentAllowed = false;
    assert.equal(await getAttemptResult(actor, "attempt", expiresAt), null);
  }
});
