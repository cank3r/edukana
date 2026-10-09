import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";
import { Prisma, type PrismaClient } from "@prisma/client";
import { resolveEffectiveCapabilities } from "../src/lib/capabilities";

// These are the production writers with a DB-free client, not replicas of their logic.
const now = new Date("2026-10-09T12:00:00Z");
const student = { id: "student", institutionId: "institution" };
const teacher = { id: "teacher", institutionId: "institution", role: "TEACHER" as const,
  capabilities: resolveEffectiveCapabilities("TEACHER") };
const initialAssignment = () => ({ id: "assignment", courseId: "course", maxScore: 100,
  isPublished: true, dueDate: null as Date | null, allowLate: false, gradeItem: { id: "item" } as { id: string } | null });
const initialSubmission = () => ({ id: "submission", assignmentId: "assignment", studentId: student.id,
  enrollmentId: "enrollment", content: "Original", fileUrls: null as unknown, status: "SUBMITTED", score: null as number | null,
  feedback: null as string | null, gradedAt: null as Date | null, submittedAt: now, assets: [{ id: "asset" }], _count: { revisions: 0 } });
let assignment = initialAssignment();
let submission: ReturnType<typeof initialSubmission> | null = initialSubmission();
let course = { institutionId: "institution", teacherId: "teacher", isPublished: true };
let enrollmentActive = true;
let assignmentExists = true;
let entry: { id: string; score: number | null; feedback: string | null; gradeItem: { gradingPeriod: { isPublished: boolean } } } | null;
let events: string[] = [];
let writes: Array<{ kind: string; data: unknown }> = [];
let onLock: (() => void) | undefined;
let transactionError: Error | undefined;

type Scope = { institutionId: string; teacherId?: string; isPublished?: boolean };
const accessible = (scope: Scope) => scope.institutionId === course.institutionId &&
  (!scope.teacherId || scope.teacherId === course.teacherId) && (!scope.isPublished || course.isPublished);
function assignmentReader(transaction: boolean) {
  return async ({ where }: { where: { id: string; course: Scope } }) => {
    events.push(transaction ? "assignment.read" : "assignment.authorize");
    return assignmentExists && where.id === assignment.id && assignment.isPublished && accessible(where.course)
      ? structuredClone(assignment) : null;
  };
}
function submissionReader(transaction: boolean) {
  return async ({ where }: { where: { id: string; assignment: { course: Scope } } }) => {
    events.push(transaction ? "submission.read" : "submission.authorize");
    return submission && submission.id === where.id && submission.status !== "DRAFT" && accessible(where.assignment.course)
      ? structuredClone({ ...submission, assignment }) : null;
  };
}
function enrollmentReader(transaction: boolean) {
  return async ({ where }: { where: { studentId: string; courseId: string; status: string } }) => {
    events.push(transaction ? "enrollment.read" : "enrollment.authorize");
    assert.equal(where.status, "ACTIVE");
    return enrollmentActive && where.studentId === student.id && where.courseId === assignment.courseId ? { id: "enrollment" } : null;
  };
}
const tx = {
  $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join("?");
    if (sql.includes('FROM "assignments"')) {
      events.push("assignment.lock"); onLock?.();
      assert.match(sql, /c\."institutionId" = \?/);
      assert.match(sql, /FOR UPDATE OF a/);
      return assignmentExists && values[0] === assignment.id && values[1] === course.institutionId ? [{ id: assignment.id }] : [];
    }
    events.push("submission.lock");
    assert.match(sql, /FROM "submissions"/); assert.match(sql, /FOR UPDATE/);
    assert.deepEqual(values, [assignment.id, student.id]);
    return submission ? [{ id: submission.id }] : [];
  },
  assignment: { findFirst: assignmentReader(true) },
  enrollment: { findFirst: enrollmentReader(true) },
  submission: {
    findFirst: submissionReader(true),
    findUnique: async () => { events.push("submission.current"); return structuredClone(submission); },
    update: async ({ data }: { data: object }) => {
      events.push("submission.grade"); writes.push({ kind: "submission", data }); Object.assign(submission!, data);
    },
    upsert: async ({ create, update }: { create: object; update: object }) => {
      events.push("submission.submit"); writes.push({ kind: "submission", data: submission ? update : create });
      if (!submission) submission = initialSubmission();
      Object.assign(submission, update);
    },
  },
  submissionRevision: { create: async ({ data }: { data: object }) => {
    events.push("submission.archive"); writes.push({ kind: "submissionRevision", data }); submission!._count.revisions++;
  } },
  gradeEntry: {
    findUnique: async () => structuredClone(entry),
    create: async ({ data }: { data: object }) => { writes.push({ kind: "gradeEntry", data }); },
    update: async ({ data }: { data: object }) => { writes.push({ kind: "gradeEntry", data }); Object.assign(entry!, data); },
  },
  gradeEntryRevision: { create: async ({ data }: { data: object }) => { writes.push({ kind: "gradeEntryRevision", data }); } },
  auditLog: { create: async ({ data }: { data: object }) => { writes.push({ kind: "audit", data }); } },
};
const fake = {
  $transaction: async (run: (client: typeof tx) => Promise<unknown>, options?: { isolationLevel: string }) => {
    events.push("transaction"); assert.equal(options?.isolationLevel, "ReadCommitted");
    if (transactionError) throw transactionError;
    const snapshot = structuredClone({ submission, entry, writes });
    try { return await run(tx); } catch (error) {
      ({ submission, entry, writes } = snapshot); throw error;
    }
  },
  assignment: { findFirst: assignmentReader(false) },
  submission: { findFirst: submissionReader(false) },
  enrollment: { findFirst: enrollmentReader(false) },
};
(globalThis as unknown as { prisma: PrismaClient }).prisma = fake as unknown as PrismaClient;
let gradeSubmission: typeof import("../src/server/assessment/assignments").gradeSubmission;
let submitAssignment: typeof import("../src/server/assessment/assignments").submitAssignment;
before(async () => { ({ gradeSubmission, submitAssignment } = await import("../src/server/assessment/assignments")); });
beforeEach(() => {
  assignment = initialAssignment(); submission = initialSubmission(); entry = null; events = []; writes = [];
  course = { institutionId: "institution", teacherId: "teacher", isPublished: true };
  enrollmentActive = true; assignmentExists = true; onLock = undefined; transactionError = undefined;
});
const grade = (extra = {}) => gradeSubmission(teacher, { submissionId: "submission", score: 80, ...extra }, now);
const submit = () => submitAssignment(student, { assignmentId: assignment.id, content: "Replacement" }, now);
const rejected = (result: { ok: boolean; message?: string }, pattern: RegExp) => {
  assert.equal(result.ok, false); assert.match(result.message ?? "", pattern); assert.equal(writes.length, 0);
};

test("both production writers lock assignment then submission before reading mutable state", async () => {
  assert.equal((await grade()).ok, true);
  assert.deepEqual(events.slice(0, 6), ["submission.authorize", "transaction", "assignment.lock", "submission.lock",
    "submission.read", "submission.grade"]);
  submission = initialSubmission(); events = []; writes = [];
  assert.equal((await submit()).ok, true);
  assert.deepEqual(events.slice(0, 8), ["assignment.authorize", "enrollment.authorize", "transaction", "assignment.lock",
    "submission.lock", "assignment.read", "enrollment.read", "submission.current"]);
  const archived = writes.find(({ kind }) => kind === "submissionRevision")?.data as { content: string; assetIds: string[] };
  assert.equal(archived.content, "Original"); assert.deepEqual(archived.assetIds, ["asset"]);
});

test("a grade placed while submit waits cannot be erased or archived", async () => {
  onLock = () => { submission!.status = "GRADED"; submission!.score = 75; };
  rejected(await submit(), /ya calificó/);
  assert.deepEqual([submission!.content, submission!.score], ["Original", 75]);
});

test("a first submission inserted while another waits is archived before replacement", async () => {
  submission = null;
  onLock = () => { submission = initialSubmission(); };
  const result = await submit();
  assert.ok(result.ok && result.resubmitted);
  assert.equal(writes.filter(({ kind }) => kind === "submissionRevision").length, 1);
  assert.equal(submission!.content, "Replacement");
});

test("a true first submission locks the parent even without a submission row", async () => {
  submission = null;
  const result = await submit();
  assert.ok(result.ok && !result.resubmitted);
  assert.equal(events.includes("assignment.lock"), true);
  assert.equal(writes.some(({ kind }) => kind === "submissionRevision"), false);
});

test("grading rejects replacement during the call, even with an unchanged millisecond timestamp", async () => {
  onLock = () => { submission!.content = "New version"; submission!._count.revisions++; };
  rejected(await grade(), /nueva versión/);
  assert.equal(submission!.score, null);
  onLock = () => { submission!.submittedAt = new Date(now.getTime() + 1); };
  rejected(await grade(), /nueva versión/);
});

test("concurrent grading rechecks the current score and requires a correction reason", async () => {
  onLock = () => { submission!.status = "GRADED"; submission!.score = 70; };
  rejected(await grade(), /motivo/);
  assert.equal(submission!.score, 70);
});

test("correction audit and grade history use the post-lock previous score", async () => {
  onLock = () => {
    submission!.status = "GRADED"; submission!.score = 70;
    entry = { id: "entry", score: 70, feedback: "Previous", gradeItem: { gradingPeriod: { isPublished: true } } };
  };
  const result = await grade({ reason: "Revisión" });
  assert.ok(result.ok && result.corrected);
  const audit = writes.find(({ kind }) => kind === "audit")?.data as { changes: { previousScore: number; reason: string } };
  assert.deepEqual(audit.changes, { previousScore: 70, newScore: 80, reason: "Revisión" });
  const revision = writes.find(({ kind }) => kind === "gradeEntryRevision")?.data as { previousScore: number };
  assert.equal(revision.previousScore, 70);
});

test("published grade feedback changes without a reason roll back the submission update", async () => {
  submission!.status = "GRADED"; submission!.score = 80; submission!.feedback = "Previous";
  entry = { id: "entry", score: 80, feedback: "Previous", gradeItem: { gradingPeriod: { isPublished: true } } };
  rejected(await grade({ feedback: "Replacement" }), /motivo/);
  assert.equal(submission!.feedback, "Previous");
});

test("grading uses the locked maximum and permits the existing no-gradebook path", async () => {
  onLock = () => { assignment.maxScore = 50; };
  rejected(await grade(), /entre 0 y 50/);
  onLock = undefined; assignment.maxScore = 100; assignment.gradeItem = null;
  assert.equal((await grade({ score: 0 })).ok, true);
  assert.equal(writes.some(({ kind }) => kind === "gradeEntry"), false);
});

test("submission rereads link retention, deadline, publication and active enrollment", async () => {
  for (const [change, pattern] of [
    [() => { submission!.fileUrls = ["https://example.test/original"]; }, /enlaces/],
    [() => { assignment.dueDate = new Date(now.getTime() - 1); }, /fecha límite/],
    [() => { assignment.isPublished = false; }, /disponible/],
    [() => { course.isPublished = false; }, /disponible/],
    [() => { enrollmentActive = false; }, /disponible/],
  ] as const) {
    assignment = initialAssignment(); submission = initialSubmission(); enrollmentActive = true; course.isPublished = true;
    onLock = change; rejected(await submit(), pattern);
  }
});

test("grading and submitting revalidate access after waiting and fail if the assignment disappeared", async () => {
  onLock = () => { course.teacherId = "other"; }; rejected(await grade(), /acceso/);
  course.teacherId = teacher.id; onLock = () => { assignmentExists = false; };
  rejected(await grade(), /acceso/); assignmentExists = true; rejected(await submit(), /disponible/);
});

test("preflight rejects other teachers, institutions, students and missing active enrollment", async () => {
  for (const actor of [{ ...teacher, id: "other" }, { ...teacher, institutionId: "other" },
    { ...teacher, role: "STUDENT" as const }, { ...teacher, role: "PARENT" as const }]) {
    rejected(await gradeSubmission(actor, { submissionId: "submission", score: 80 }), /acceso/);
  }
  rejected(await submitAssignment({ ...student, institutionId: "other" }, { assignmentId: assignment.id, content: "Text" }), /disponible/);
  enrollmentActive = false; rejected(await submit(), /disponible/);
  assert.equal(events.includes("transaction"), false);
});

test("deadlock conflicts return a retry message rather than claim a successful write", async () => {
  transactionError = new Prisma.PrismaClientKnownRequestError("Conflict", { code: "P2034", clientVersion: "5.22.0" });
  rejected(await grade(), /Recarga/); rejected(await submit(), /Recarga/);
});
