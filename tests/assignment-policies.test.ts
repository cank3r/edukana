import assert from "node:assert/strict";
import { test } from "node:test";
import type { Prisma } from "@prisma/client";
import {
  assignmentDeletionBlocked,
  assignmentSubmissionAccess,
  hasUnarchivableSubmissionFiles,
  studentAssignmentGrade,
  SubmissionRevisionUnavailable,
  SUBMISSION_LINK_RETENTION_MESSAGE,
} from "../src/server/assessment/assignment-policies";
import { archiveSubmissionVersion } from "../src/server/grade-history";

const submission = { status: "GRADED", score: 45, feedback: "Private draft feedback" };
const entry = { score: 90, feedback: "Corrected feedback", isExcused: false };
const hidden = { graded: false, score: null, feedback: "" };

test("hidden linked grades redact score, feedback and graded state even with a graded submission", () => {
  const result = studentAssignmentGrade(submission, { isPublished: false, entries: [entry] });
  assert.deepEqual(result, hidden);
  assert.equal(JSON.stringify(result).includes("Private"), false);
  assert.equal(JSON.stringify(result).includes("Corrected"), false);
});

test("published linked tasks read the authoritative gradebook entry instead of stale submission fields", () => {
  assert.deepEqual(studentAssignmentGrade(submission, { isPublished: true, entries: [entry] }), {
    graded: true, score: 90, feedback: "Corrected feedback",
  });
  assert.deepEqual(studentAssignmentGrade(submission, { isPublished: true, entries: [{ ...entry, score: 0, feedback: null }] }), {
    graded: true, score: 0, feedback: "",
  });
});

test("missing, excused and cleared linked entries never fall back to a stale submission grade", () => {
  for (const entries of [[], [{ ...entry, isExcused: true }], [{ ...entry, score: null }]]) {
    assert.deepEqual(studentAssignmentGrade(submission, { isPublished: true, entries }), hidden);
  }
});

test("unlinked tasks preserve their previous graded submission behavior", () => {
  assert.deepEqual(studentAssignmentGrade(submission, null), {
    graded: true, score: 45, feedback: "Private draft feedback",
  });
  assert.deepEqual(studentAssignmentGrade({ status: "GRADED", score: 0 }, null), { graded: true, score: 0, feedback: "" });
  assert.deepEqual(studentAssignmentGrade({ ...submission, status: "SUBMITTED" }, null), hidden);
  assert.deepEqual(studentAssignmentGrade(null, null), hidden);
});

test("drafts and absent submissions do not expose grades even when a linked item is published", () => {
  const item = { isPublished: true, entries: [entry] };
  assert.deepEqual(studentAssignmentGrade({ ...submission, status: "DRAFT" }, item), hidden);
  assert.deepEqual(studentAssignmentGrade(null, item), hidden);
});

test("only null or empty fileUrls can be archived without losing evidence", () => {
  for (const value of [null, undefined, []]) assert.equal(hasUnarchivableSubmissionFiles(value), false);
  for (const value of [["https://example.test/original"], [""], { legacy: "link" }, "https://example.test/original"]) {
    assert.equal(hasUnarchivableSubmissionFiles(value), true);
  }
});

const now = new Date("2026-10-09T15:00:00Z");
const open = { dueDate: null, allowLate: true };

test("the actual submission permission policy blocks overwriting delivered links", () => {
  for (const status of ["SUBMITTED", "RETURNED"]) {
    const result = assignmentSubmissionAccess(open, { status, fileUrls: ["https://example.test/original"] }, true, now);
    assert.deepEqual(result, { allowed: false, why: SUBMISSION_LINK_RETENTION_MESSAGE });
  }
  assert.equal(assignmentSubmissionAccess(open, { status: "SUBMITTED", fileUrls: null }, true, now).allowed, true);
  assert.equal(assignmentSubmissionAccess(open, { status: "DRAFT", fileUrls: ["https://example.test/draft"] }, true, now).allowed, true);
  assert.equal(assignmentSubmissionAccess(open, null, true, now).allowed, true);
});

test("resubmission retains enrollment, grading and deadline restrictions", () => {
  assert.equal(assignmentSubmissionAccess(open, null, false, now).allowed, false);
  assert.equal(assignmentSubmissionAccess(open, { status: "GRADED", fileUrls: null }, true, now).allowed, false);
  const expired = { dueDate: new Date(now.getTime() - 1), allowLate: false };
  assert.equal(assignmentSubmissionAccess(expired, null, true, now).allowed, false);
  assert.equal(assignmentSubmissionAccess({ ...expired, allowLate: true }, null, true, now).allowed, true);
});

test("any submission or grade entry blocks deletion, independently of publication", () => {
  assert.equal(assignmentDeletionBlocked(0, 0), false);
  for (const [submissions, grades] of [[1, 0], [0, 1], [2, 2]]) {
    assert.equal(assignmentDeletionBlocked(submissions, grades), true);
  }
});

const scope = { assignmentId: "task", studentId: "student", institutionId: "institution" };
function archiveFixture(fileUrls: unknown, exists = true) {
  const writes: unknown[] = [];
  const original = {
    id: "submission", content: "Original text", fileUrls, submittedAt: now, assets: [{ id: "asset" }],
  };
  const tx = {
    submission: { findUnique: async () => exists ? original : null },
    submissionRevision: { create: async (input: unknown) => { writes.push(input); } },
  } as unknown as Prisma.TransactionClient;
  return { tx, writes, original };
}

test("archiveSubmissionVersion rejects prior links before writing a lossy revision", async () => {
  const { tx, writes, original } = archiveFixture(["https://example.test/original"]);
  const snapshot = structuredClone(original);
  await assert.rejects(archiveSubmissionVersion(tx, scope), SubmissionRevisionUnavailable);
  assert.deepEqual(writes, []);
  assert.deepEqual(original, snapshot);
});

test("archiveSubmissionVersion still preserves prior text, asset IDs and timestamp", async () => {
  for (const fileUrls of [null, []]) {
    const { tx, writes } = archiveFixture(fileUrls);
    assert.equal(await archiveSubmissionVersion(tx, scope), true);
    assert.deepEqual(writes, [{ data: {
      institutionId: scope.institutionId, submissionId: "submission", content: "Original text",
      assetIds: ["asset"], submittedAt: now,
    } }]);
  }
});

test("archiveSubmissionVersion preserves the no-prior-submission result", async () => {
  const { tx, writes } = archiveFixture(null, false);
  assert.equal(await archiveSubmissionVersion(tx, scope), false);
  assert.deepEqual(writes, []);
});
