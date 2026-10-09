import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createRequire } from "node:module";
import { db } from "@/lib/db";
import type { EdukanaRole } from "@/types/next-auth";
import { A, B, ensureSeed } from "./setup";

const require = createRequire(import.meta.url);
const { loadWithStubs } = require("../helpers/load-with-stubs.cjs");
type User = { id: string; institutionId: string; role: EdukanaRole };
let user: User | null = null;
// Authentication is the request boundary. Capability lookups, scope, services,
// row locks, history writes, and all database transactions remain real.
const actions: typeof import("@/server/actions/assignments") = loadWithStubs("src/server/actions/assignments.ts", {
  "@/lib/auth": { auth: async () => user ? { user } : null },
  "next/cache": { revalidatePath: () => undefined },
});
const initial = { ok: false, message: "" };
const courseId = "it_assignment_action_course";
const enrollmentId = "it_assignment_action_enrollment";
const periodId = "it_assignment_action_period";
const categoryId = "it_assignment_action_category";
const assignmentIds: string[] = [];
function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}
function rejected(state: { ok: boolean; message: string }, pattern?: RegExp) {
  assert.equal(state.ok, false, state.message);
  if (pattern) assert.match(state.message, pattern);
}
function accepted(state: { ok: boolean; message: string }) { assert.equal(state.ok, true, state.message); }
async function task(options: { linked?: boolean; published?: boolean; expired?: boolean } = {}) {
  const assignment = await db.assignment.create({
    data: {
      institutionId: A.institutionId, courseId, title: "Assignment action task", instructions: "Describe tu trabajo.",
      maxScore: 10, isPublished: options.published ?? true, publishedAt: new Date("2026-01-01T00:00:00Z"),
      dueDate: options.expired ? new Date(Date.now() - 60_000) : null, allowLate: false,
    },
  });
  assignmentIds.push(assignment.id);
  if (options.linked) await db.gradeItem.create({
    data: {
      institutionId: A.institutionId, courseId, gradingPeriodId: periodId, categoryId,
      assignmentId: assignment.id, title: assignment.title, maxScore: 10, isPublished: true,
    },
  });
  return assignment;
}
async function ownSubmission(assignmentId: string) {
  return db.submission.findUniqueOrThrow({ where: { assignmentId_studentId: { assignmentId, studentId: A.student.id } } });
}
before(async () => {
  await ensureSeed();
  await db.course.create({ data: {
    id: courseId, institutionId: A.institutionId, periodId: "a_period", teacherId: A.teacher.id,
    name: "Assignment action calls", code: "IT-ACTION-TASK", isPublished: true,
  } });
  await db.enrollment.create({ data: {
    id: enrollmentId, institutionId: A.institutionId, courseId, studentId: A.student.id, status: "ACTIVE",
  } });
  await db.gradingPeriod.create({ data: {
    id: periodId, institutionId: A.institutionId, courseId, academicPeriodId: "a_period",
    name: "Assignment action grades", startDate: new Date("2026-01-01"), endDate: new Date("2027-01-01"),
    isPublished: true,
    categories: { create: { id: categoryId, institutionId: A.institutionId, courseId, name: "Tareas", weight: 100 } },
  } });
});
after(async () => {
  const submissions = await db.submission.findMany({ where: { assignmentId: { in: assignmentIds } }, select: { id: true } });
  await db.auditLog.deleteMany({ where: { entityId: { in: submissions.map((row) => row.id) } } });
  await db.gradingPeriod.deleteMany({ where: { id: periodId } });
  await db.assignment.deleteMany({ where: { id: { in: assignmentIds } } });
  await db.enrollment.deleteMany({ where: { courseId } });
  await db.course.deleteMany({ where: { id: courseId } });
  await db.$disconnect();
});

test("direct action calls: expired session, wrong role, foreign tenant, and missing enrollment fail closed", async () => {
  const assignment = await task();
  for (const actor of [null, A.teacher, A.admin, A.parent, B.student, A.student2]) {
    user = actor;
    rejected(await actions.submitAssignmentAction(initial, form({ assignmentId: assignment.id, content: "Unauthorized work" })));
  }
  assert.equal(await db.submission.count({ where: { assignmentId: assignment.id } }), 0);
});

test("direct action calls: session identity wins over forged IDs and permitted replacement preserves history", async () => {
  const assignment = await task();
  user = A.student;
  accepted(await actions.submitAssignmentAction(initial, form({
    assignmentId: assignment.id, content: "First version", studentId: B.student.id, institutionId: B.institutionId,
  })));
  const original = await ownSubmission(assignment.id);
  assert.equal(original.institutionId, A.institutionId);
  assert.equal(original.enrollmentId, enrollmentId);
  accepted(await actions.submitAssignmentAction(initial, form({ assignmentId: assignment.id, content: "Second version" })));
  const revisions = await db.submissionRevision.findMany({ where: { submissionId: original.id } });
  assert.equal(revisions.length, 1);
  assert.equal(revisions[0].content, "First version");
  assert.equal(revisions[0].submittedAt.toISOString(), original.submittedAt.toISOString());
  assert.equal((await ownSubmission(assignment.id)).content, "Second version");
});

test("direct action calls: unpublished tasks/course, closed deadline, completed or withdrawn enrollment reject writes", async () => {
  user = A.student;
  const hidden = await task({ published: false });
  rejected(await actions.submitAssignmentAction(initial, form({ assignmentId: hidden.id, content: "Hidden task" })));
  const expired = await task({ expired: true });
  rejected(await actions.submitAssignmentAction(initial, form({ assignmentId: expired.id, content: "Late task" })), /fecha límite/);
  const assignment = await task();
  await db.course.update({ where: { id: courseId }, data: { isPublished: false } });
  try { rejected(await actions.submitAssignmentAction(initial, form({ assignmentId: assignment.id, content: "Hidden course" }))); }
  finally { await db.course.update({ where: { id: courseId }, data: { isPublished: true } }); }
  for (const status of ["COMPLETED", "DROPPED"] as const) {
    await db.enrollment.update({ where: { id: enrollmentId }, data: { status } });
    try { rejected(await actions.submitAssignmentAction(initial, form({ assignmentId: assignment.id, content: "Inactive enrollment" }))); }
    finally { await db.enrollment.update({ where: { id: enrollmentId }, data: { status: "ACTIVE" } }); }
  }
  assert.equal(await db.submission.count({ where: { assignmentId: { in: [hidden.id, expired.id, assignment.id] } } }), 0);
});

test("direct action calls: no-column corrections require a reason and graded work cannot be replaced", async () => {
  const assignment = await task();
  user = A.student;
  accepted(await actions.submitAssignmentAction(initial, form({ assignmentId: assignment.id, content: "Original work" })));
  const submission = await ownSubmission(assignment.id);
  user = A.teacher;
  rejected(await actions.gradeSubmissionAction(initial, form({ submissionId: submission.id, score: "" })), /entre 0 y 10/);
  accepted(await actions.gradeSubmissionAction(initial, form({ submissionId: submission.id, score: "6", feedback: "First grade" })));
  const graded = await ownSubmission(assignment.id);
  rejected(await actions.gradeSubmissionAction(initial, form({ submissionId: submission.id, score: "8" })), /motivo/);
  assert.deepEqual(await ownSubmission(assignment.id), graded);
  accepted(await actions.gradeSubmissionAction(initial, form({
    submissionId: submission.id, score: "8", feedback: "Revised grade", reason: "Error al sumar",
  })));
  const audit = await db.auditLog.findFirstOrThrow({ where: { entityId: submission.id, action: "SUBMISSION_GRADE_CORRECTED" } });
  assert.equal(audit.userId, A.teacher.id);
  assert.deepEqual(audit.changes, { previousScore: 6, newScore: 8, reason: "Error al sumar" });
  const corrected = await ownSubmission(assignment.id);
  user = A.student;
  rejected(await actions.submitAssignmentAction(initial, form({ assignmentId: assignment.id, content: "Replace graded work" })), /ya calificó/);
  assert.deepEqual(await ownSubmission(assignment.id), corrected);
  assert.equal(await db.submissionRevision.count({ where: { submissionId: submission.id } }), 0);
});

test("direct action calls: linked corrections keep actor, reason and revision; unauthorized reviewers cannot write", async () => {
  const assignment = await task({ linked: true });
  user = A.student;
  accepted(await actions.submitAssignmentAction(initial, form({ assignmentId: assignment.id, content: "Work with gradebook" })));
  const submission = await ownSubmission(assignment.id);
  for (const actor of [null, A.student, A.parent, A.teacher2, B.teacher, B.admin]) {
    user = actor;
    rejected(await actions.gradeSubmissionAction(initial, form({ submissionId: submission.id, score: "9", reason: "Forged" })));
  }
  assert.equal((await ownSubmission(assignment.id)).score, null);
  user = A.teacher;
  accepted(await actions.gradeSubmissionAction(initial, form({ submissionId: submission.id, score: "7", feedback: "First feedback" })));
  const before = await ownSubmission(assignment.id);
  rejected(await actions.gradeSubmissionAction(initial, form({ submissionId: submission.id, score: "7", feedback: "Changed" })), /motivo/);
  assert.deepEqual(await ownSubmission(assignment.id), before);
  accepted(await actions.gradeSubmissionAction(initial, form({
    submissionId: submission.id, score: "9", feedback: "Revised feedback", reason: "Revisión de la rúbrica",
  })));
  const entry = await db.gradeEntry.findFirstOrThrow({ where: { enrollmentId, gradeItem: { assignmentId: assignment.id } } });
  assert.equal(entry.score, 9);
  const revision = await db.gradeEntryRevision.findFirstOrThrow({ where: { gradeEntryId: entry.id } });
  assert.equal(revision.previousScore, 7);
  assert.equal(revision.newScore, 9);
  assert.equal(revision.actorId, A.teacher.id);
  assert.equal(revision.reason, "Revisión de la rúbrica");
});

test("direct action calls: a submission link cannot be silently lost through a text-only replacement", async () => {
  const assignment = await task();
  user = A.student;
  accepted(await actions.submitAssignmentAction(initial, form({
    assignmentId: assignment.id, content: "Document", link: "https://example.test/original",
  })));
  const original = await ownSubmission(assignment.id);
  rejected(await actions.submitAssignmentAction(initial, form({ assignmentId: assignment.id, content: "Replacement" })), /enlaces/);
  assert.deepEqual(await ownSubmission(assignment.id), original);
  assert.equal(await db.submissionRevision.count({ where: { submissionId: original.id } }), 0);
});

test("direct action calls: assignment publication is atomic and only course managers can change it", async () => {
  const assignment = await task({ linked: true });
  const fd = form({ assignmentId: assignment.id, published: "false" });
  for (const actor of [null, A.student, A.teacher2, B.teacher, B.admin]) {
    user = actor;
    rejected(await actions.setAssignmentPublishedAction(initial, fd));
  }
  user = A.teacher;
  accepted(await actions.setAssignmentPublishedAction(initial, fd));
  const hidden = await db.assignment.findUniqueOrThrow({ where: { id: assignment.id }, include: { gradeItem: true } });
  assert.equal(hidden.isPublished, false);
  assert.equal(hidden.gradeItem?.isPublished, false);
  assert.equal(hidden.publishedAt?.toISOString(), assignment.publishedAt?.toISOString());
  accepted(await actions.setAssignmentPublishedAction(initial, form({ assignmentId: assignment.id, published: "true" })));
  const published = await db.assignment.findUniqueOrThrow({ where: { id: assignment.id }, include: { gradeItem: true } });
  assert.equal(published.isPublished, true);
  assert.equal(published.gradeItem?.isPublished, true);
});
