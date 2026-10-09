import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { resolveEffectiveCapabilities } from "@/lib/capabilities";
import { db } from "@/lib/db";
import { gradeSubmission, submitAssignment } from "@/server/assessment/assignments";
import { A, ensureSeed } from "./setup";

// Run only through the isolated PostgreSQL integration runner, never against staging.
const PREFIX = `it_submission_lock_${randomUUID()}_`;
const PERIOD = `${PREFIX}period`;
const CATEGORY = `${PREFIX}category`;
const NOW = new Date("2026-10-09T12:00:00Z");
const LATER = new Date("2026-10-09T12:01:00Z");
const scope = { institutionId: A.institutionId, courseId: A.courseId };
const teacher = { ...A.teacher, capabilities: resolveEffectiveCapabilities(A.teacher.role) };
let seeded = false;

before(async () => {
  await ensureSeed();
  seeded = true;
  await db.gradingPeriod.create({ data: {
    id: PERIOD, ...scope, academicPeriodId: "a_period", name: PREFIX,
    startDate: new Date("2026-09-01"), endDate: new Date("2026-12-31"),
    categories: { create: { id: CATEGORY, ...scope, name: "Assignments", weight: 100 } },
  } });
});

after(async () => {
  if (seeded) {
    await db.auditLog.deleteMany({ where: { institutionId: A.institutionId, entityId: { startsWith: PREFIX } } });
    await db.gradingPeriod.deleteMany({ where: { id: PERIOD } });
    await db.assignment.deleteMany({ where: { id: { startsWith: PREFIX } } });
  }
  await db.$disconnect();
});

async function makeAssignment(suffix: string, submitted = true) {
  const assignmentId = `${PREFIX}${suffix}`;
  const submissionId = `${assignmentId}_submission`;
  const gradeItemId = `${assignmentId}_grade`;
  await db.assignment.create({ data: {
    id: assignmentId, ...scope, title: "Submission lock regression", isPublished: true,
    gradeItem: { create: {
      id: gradeItemId, ...scope, gradingPeriodId: PERIOD, categoryId: CATEGORY,
      title: "Submission lock regression", isPublished: true,
    } },
    submissions: submitted ? { create: {
      id: submissionId, institutionId: A.institutionId, studentId: A.student.id,
      enrollmentId: "a_enrollment", content: "Original", submittedAt: NOW,
    } } : undefined,
  } });
  return { assignmentId, submissionId, gradeItemId };
}

function holdRow(kind: "submission" | "enrollment", id: string) {
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  let acquired!: (pid: number) => void;
  let failed!: (error: unknown) => void;
  const ready = new Promise<number>((resolve, reject) => { acquired = resolve; failed = reject; });
  const finished = db.$transaction(async (tx) => {
    if (kind === "submission") await tx.$queryRaw`SELECT "id" FROM "submissions" WHERE "id" = ${id} FOR UPDATE`;
    else await tx.$queryRaw`SELECT "id" FROM "enrollments" WHERE "id" = ${id} FOR UPDATE`;
    const [backend] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
    acquired(backend.pid);
    await released;
  }, { timeout: 20_000 });
  void finished.catch(failed);
  return { ready, release, finished };
}

/** Wait for a real lock edge, never infer ordering from elapsed time or Promise order. */
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

async function race<First, Second>(
  kind: "submission" | "enrollment", id: string,
  first: () => Promise<First>, second: () => Promise<Second>,
): Promise<[First, Second]> {
  const held = holdRow(kind, id);
  let firstResult: Promise<First> | undefined;
  let secondResult: Promise<Second> | undefined;
  try {
    const holderPid = await held.ready;
    firstResult = first();
    void firstResult.catch(() => {});
    // Existing row: SELECT FOR UPDATE. First insert: its enrollment FK check.
    const firstPid = await blockedBy(holderPid, "submissions");
    secondResult = second();
    void secondResult.catch(() => {});
    // Both callers have finished preflight; the first owns the assignment lock.
    await blockedBy(firstPid, "assignments");
  } finally {
    held.release();
    await Promise.allSettled([held.finished, firstResult, secondResult]);
  }
  return Promise.all([firstResult, secondResult]);
}

function submission(assignmentId: string) {
  return db.submission.findUniqueOrThrow({
    where: { assignmentId_studentId: { assignmentId, studentId: A.student.id } },
    include: { revisions: true },
  });
}

function entry(gradeItemId: string) {
  return db.gradeEntry.findUniqueOrThrow({
    where: { gradeItemId_enrollmentId: { gradeItemId, enrollmentId: "a_enrollment" } },
    include: { revisions: true },
  });
}

function audits(submissionId: string) {
  return db.auditLog.findMany({ where: {
    institutionId: A.institutionId, entityId: submissionId, action: "SUBMISSION_GRADE_CORRECTED",
  } });
}

test("grading wins: resubmission cannot erase the grade or replace the graded content", async () => {
  const { assignmentId, submissionId, gradeItemId } = await makeAssignment("grade_first");
  const [graded, resubmitted] = await race("submission", submissionId,
    () => gradeSubmission(teacher, { submissionId, score: 80, feedback: "Reviewed original" }, LATER),
    () => submitAssignment(A.student, { assignmentId, content: "Replacement" }, LATER),
  );
  assert.ok(graded.ok && !graded.corrected);
  assert.ok(!resubmitted.ok);
  assert.match(resubmitted.message, /ya calificó/);
  const saved = await submission(assignmentId);
  assert.deepEqual([saved.content, saved.status, saved.score, saved.feedback],
    ["Original", "GRADED", 80, "Reviewed original"]);
  assert.equal(saved.submittedAt.toISOString(), NOW.toISOString());
  assert.equal(saved.gradedAt?.toISOString(), LATER.toISOString());
  assert.equal(saved.revisions.length, 0);
  assert.equal((await entry(gradeItemId)).score, 80);
});

test("resubmission wins: in-flight grading rejects the new version even when timestamps match", async () => {
  const { assignmentId, submissionId, gradeItemId } = await makeAssignment("submit_first");
  const [resubmitted, graded] = await race("submission", submissionId,
    () => submitAssignment(A.student, { assignmentId, content: "Replacement" }, NOW),
    () => gradeSubmission(teacher, { submissionId, score: 80, feedback: "Reviewed original" }, LATER),
  );
  assert.ok(resubmitted.ok && resubmitted.resubmitted);
  assert.ok(!graded.ok);
  assert.match(graded.message, /entrega cambió/);
  const saved = await submission(assignmentId);
  assert.deepEqual([saved.content, saved.status, saved.score, saved.feedback, saved.gradedAt],
    ["Replacement", "SUBMITTED", null, null, null]);
  assert.equal(saved.revisions.length, 1);
  assert.equal(saved.revisions[0].content, "Original");
  assert.equal(saved.revisions[0].submittedAt.toISOString(), NOW.toISOString());
  assert.equal(await db.gradeEntry.count({ where: { gradeItemId } }), 0);
  assert.equal((await audits(submissionId)).length, 0);
  assert.ok((await gradeSubmission(teacher, { submissionId, score: 90 }, LATER)).ok);
  assert.equal((await entry(gradeItemId)).score, 90);
});

test("concurrent first submissions serialize and preserve both submitted versions", async () => {
  const { assignmentId } = await makeAssignment("first_submissions", false);
  const [first, second] = await race("enrollment", "a_enrollment",
    () => submitAssignment(A.student, { assignmentId, content: "First" }, NOW),
    () => submitAssignment(A.student, { assignmentId, content: "Second" }, LATER),
  );
  assert.ok(first.ok && !first.resubmitted);
  assert.ok(second.ok && second.resubmitted);
  assert.equal(await db.submission.count({ where: { assignmentId } }), 1);
  const saved = await submission(assignmentId);
  assert.deepEqual([saved.content, saved.status, saved.score], ["Second", "SUBMITTED", null]);
  assert.equal(saved.submittedAt.toISOString(), LATER.toISOString());
  assert.equal(saved.revisions.length, 1);
  assert.equal(saved.revisions[0].content, "First");
  assert.equal(saved.revisions[0].submittedAt.toISOString(), NOW.toISOString());
});

test("concurrent grading rechecks the committed grade and requires a correction reason", async () => {
  const { assignmentId, submissionId, gradeItemId } = await makeAssignment("reason_required");
  const [first, second] = await race("submission", submissionId,
    () => gradeSubmission(teacher, { submissionId, score: 60, feedback: "First assessment" }, NOW),
    () => gradeSubmission(teacher, { submissionId, score: 80, feedback: "Second assessment" }, LATER),
  );
  assert.ok(first.ok && !first.corrected);
  assert.ok(!second.ok);
  assert.match(second.message, /motivo/);
  const saved = await submission(assignmentId);
  assert.deepEqual([saved.score, saved.feedback], [60, "First assessment"]);
  const grade = await entry(gradeItemId);
  assert.deepEqual([grade.score, grade.feedback, grade.revisions.length], [60, "First assessment", 0]);
  assert.equal((await audits(submissionId)).length, 0);
});

test("concurrent grading with a reason records the actual preceding score in history and audit", async () => {
  const { assignmentId, submissionId, gradeItemId } = await makeAssignment("audit_current");
  const reason = "Rechecked the rubric";
  const [first, second] = await race("submission", submissionId,
    () => gradeSubmission(teacher, { submissionId, score: 60, feedback: "First assessment" }, NOW),
    () => gradeSubmission(teacher, { submissionId, score: 80, feedback: "Corrected", reason }, LATER),
  );
  assert.ok(first.ok && !first.corrected);
  assert.ok(second.ok && second.corrected);
  const saved = await submission(assignmentId);
  assert.deepEqual([saved.score, saved.feedback], [80, "Corrected"]);
  const grade = await entry(gradeItemId);
  assert.equal(grade.score, 80);
  assert.equal(grade.revisions.length, 1);
  const revision = grade.revisions[0];
  assert.deepEqual([revision.previousScore, revision.newScore, revision.previousFeedback, revision.reason, revision.actorId],
    [60, 80, "First assessment", reason, A.teacher.id]);
  assert.equal(revision.createdAt.toISOString(), LATER.toISOString());
  const logs = await audits(submissionId);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].userId, A.teacher.id);
  assert.deepEqual(logs[0].changes, { previousScore: 60, newScore: 80, reason });
});
