import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createRequire } from "node:module";
import type { EdukanaRole } from "@/types/next-auth";

const require = createRequire(import.meta.url);
const { loadLegacyExamReview } = require("./helpers/load-legacy-exam-review.cjs");
type User = { id: string; institutionId: string; role: EdukanaRole };
const teacher: User = { id: "teacher", institutionId: "institution", role: "TEACHER" };
let user: User | null = teacher;
const snapshot = { type: "SHORT_ANSWER", prompt: "Original question", options: null, answerKey: "Original answer", points: 3 };
function pending() {
  return {
    id: "attempt", institutionId: "institution", enrollmentId: "enrollment", status: "SUBMITTED", maxScore: 5, score: 2,
    answers: [
      { id: "manual", bankItemId: "open", score: null as number | null, feedback: null as string | null,
        bankItem: { type: "TRUE_FALSE" } },
      { id: "automatic", bankItemId: "auto", score: 2, feedback: null, bankItem: { type: "SHORT_ANSWER" } },
    ],
    exam: { id: "exam", courseId: "course", gradeItem: { id: "grade" }, questions: [
      { bankItemId: "open", points: 3, snapshot, bankItem: { ...snapshot, type: "TRUE_FALSE", defaultPoints: 99 } },
      { bankItemId: "auto", points: 2, snapshot: { ...snapshot, type: "TRUE_FALSE", points: 2 },
        bankItem: { ...snapshot, defaultPoints: 99 } },
    ] },
  };
}
let attempt = pending();
let entry: { id: string; score: number; feedback: string | null; gradeItem: { gradingPeriod: { isPublished: boolean } } } | null;
let writes: Array<{ kind: string; data: Record<string, unknown> }> = [];
let paths: unknown[][] = [];
let claimed = true;
let overrideDenied = false;
const tx = {
  examAttempt: {
    updateMany: async ({ where, data }: { where: { id: string; status: string }; data: object }) => {
      if (!claimed || where.id !== attempt.id || where.status !== attempt.status) return { count: 0 };
      writes.push({ kind: "attempt", data: { ...data } }); Object.assign(attempt, data); return { count: 1 };
    },
    update: async ({ data }: { data: object }) => { writes.push({ kind: "attempt", data: { ...data } }); },
  },
  examAnswer: { update: async ({ where, data }: { where: { id: string }; data: object }) => {
    writes.push({ kind: "answer", data: { id: where.id, ...data } });
  } },
  gradeEntry: {
    findUnique: async () => entry,
    create: async ({ data }: { data: Record<string, unknown> }) => { writes.push({ kind: "grade.create", data }); },
    update: async ({ data }: { data: Record<string, unknown> }) => { writes.push({ kind: "grade.update", data }); },
  },
  gradeEntryRevision: { create: async ({ data }: { data: Record<string, unknown> }) => {
    writes.push({ kind: "history", data });
  } },
};
const db = {
  roleCapabilityOverride: { findMany: async () => overrideDenied ? [{ capability: "course.manage", enabled: false }] : [] },
  course: { findFirst: async ({ where }: { where: { AND?: Array<Record<string, unknown>>; teacherId?: string } }) => {
    const scopes = where.AND ?? [where];
    if (scopes.some((scope) => (scope.teacherId && scope.teacherId !== teacher.id) ||
      (scope.institutionId && scope.institutionId !== teacher.institutionId))) return null;
    return { id: "course", teacherId: teacher.id, institution: { timezone: "UTC" } };
  } },
  examAttempt: { findFirst: async ({ where }: { where: { id: string; institutionId: string; status: string;
    exam?: { course: { teacherId?: string; id?: string } } } }) => {
    if (where.id !== attempt.id || where.institutionId !== attempt.institutionId || where.status !== attempt.status) return null;
    const scope = where.exam?.course;
    if (scope && ((scope.teacherId && scope.teacherId !== teacher.id) || scope.id === "__restricted__")) return null;
    return structuredClone(attempt);
  } },
  $transaction: async (run: (client: typeof tx) => Promise<unknown>) => {
    const saved = structuredClone(attempt); const length = writes.length;
    try { return await run(tx); } catch (error) { attempt = saved; writes.length = length; throw error; }
  },
};
const { reviewExamAttempt }: typeof import("@/app/dashboard/academico/actions") = loadLegacyExamReview({
  "@/lib/auth": { auth: async () => user ? { user } : null },
  "@/lib/db": { db },
  "next/cache": { revalidatePath: (...args: unknown[]) => paths.push(args) },
});
const initial = { ok: false, message: "" };
function form(extra: Record<string, string> = {}) {
  const fd = new FormData();
  const fields = { attemptId: "attempt", score_manual: "2,5", feedback_manual: " Good work ",
    reason: "Revisión de la respuesta del estudiante", ...extra };
  for (const [key, value] of Object.entries(fields)) {
    fd.set(key, value);
  }
  return fd;
}
beforeEach(() => { user = teacher; attempt = pending(); entry = null; writes = []; paths = []; claimed = true; overrideDenied = false; });

test("legacy review uses the frozen types and canonical points after bank changes", async () => {
  const result = await reviewExamAttempt(initial, form({ points_manual: "999", role: "ADMIN" }));
  assert.equal(result.ok, true, result.message);
  assert.match(result.message, /4.5.*5/);
  assert.deepEqual(writes.filter((write) => write.kind === "answer"), [
    { kind: "answer", data: { id: "manual", score: 2.5, feedback: "Good work" } },
  ]);
  assert.equal(writes.find((write) => write.kind === "grade.create")?.data.score, 4.5);
  assert.equal(writes.find((write) => write.kind === "grade.create")?.data.gradedById, teacher.id);
  assert.deepEqual(paths, [["/dashboard/aula/course", "layout"]]);
});

test("legacy direct calls reject invalid or incomplete scores without grading", async () => {
  for (const score of ["", " ", "-1", "3.01", "Infinity", "NaN", "not a number"]) {
    const result = await reviewExamAttempt(initial, form({ score_manual: score }));
    assert.equal(result.ok, false, score);
    assert.equal(writes.length, 0);
  }
  const missing = form(); missing.delete("score_manual");
  assert.equal((await reviewExamAttempt(initial, missing)).ok, false);
  assert.equal(writes.length, 0);
  assert.equal(paths.length, 0);
});

test("legacy direct calls use session identity and reject foreign roles, users and institutions", async () => {
  for (const outsider of [null, { ...teacher, role: "STUDENT" as const }, { ...teacher, role: "PARENT" as const },
    { ...teacher, id: "another-teacher" }, { ...teacher, institutionId: "foreign" }]) {
    user = outsider;
    const result = await reviewExamAttempt(initial, form({ score_manual: "2", institutionId: "institution", userId: teacher.id }));
    assert.equal(result.ok, false);
  }
  user = teacher; overrideDenied = true;
  assert.equal((await reviewExamAttempt(initial, form())).ok, false);
  assert.equal(writes.length, 0);
});

test("legacy review preserves an explicit correction reason and immutable grade history", async () => {
  entry = { id: "entry", score: 1, feedback: "Previous feedback", gradeItem: { gradingPeriod: { isPublished: true } } };
  const result = await reviewExamAttempt(initial, form({ reason: "  Segunda revisión tras comprobar la respuesta  " }));
  assert.equal(result.ok, true, result.message);
  const revision = writes.find((write) => write.kind === "history")?.data;
  assert.equal(revision?.previousScore, 1);
  assert.equal(revision?.newScore, 4.5);
  assert.equal(revision?.reason, "Segunda revisión tras comprobar la respuesta");
  assert.equal(revision?.actorId, teacher.id);
  assert.equal(revision?.institutionId, teacher.institutionId);
  assert.ok(revision?.createdAt instanceof Date);
});

test("canonical claim rejects a simultaneous review without overwriting answers or grades", async () => {
  claimed = false;
  const result = await reviewExamAttempt(initial, form());
  assert.equal(result.ok, false);
  assert.match(result.message, /ya revisó/);
  assert.equal(writes.length, 0);
  assert.equal(paths.length, 0);
});


test("an old form without an explicit reason fails closed with navigation guidance", async () => {
  for (const reason of ["", "   "]) {
    const result = await reviewExamAttempt(initial, form({ reason }));
    assert.equal(result.ok, false);
    assert.match(result.message, /motivo/);
    assert.match(result.message, /Exámenes/);
    assert.equal(writes.length, 0);
  }
});

test("missing or inconsistent immutable evidence cannot silently fall back to the live bank", async () => {
  const corruptions = [
    () => { (attempt.exam.questions[0] as { snapshot: unknown }).snapshot = null; },
    () => { (attempt.exam.questions[0] as { snapshot: unknown }).snapshot = { type: "SHORT_ANSWER", points: 3 }; },
    () => { attempt.exam.questions[0].points = 99; },
    () => { attempt.maxScore = 99; },
    () => { attempt.answers.pop(); },
    () => { attempt.answers[0].bankItemId = "foreign-question"; },
  ];
  for (const corrupt of corruptions) {
    attempt = pending(); corrupt();
    const result = await reviewExamAttempt(initial, form());
    assert.equal(result.ok, false);
    assert.match(result.message, /Exámenes/);
    assert.equal(writes.length, 0);
  }
});

test("a file upload cannot stand in for an explicit review reason", async () => {
  const fd = form(); fd.set("reason", new File(["reason"], "reason.txt"));
  const result = await reviewExamAttempt(initial, fd);
  assert.equal(result.ok, false);
  assert.match(result.message, /motivo/);
  assert.equal(writes.length, 0);
});


test("foreign, unknown and automatically scored answer IDs cannot be smuggled into a review", async () => {
  for (const answerId of ["foreign-answer", "unknown", "automatic", "__proto__", "constructor"]) {
    const result = await reviewExamAttempt(initial, form({ [`score_${answerId}`]: "0" }));
    assert.equal(result.ok, false, answerId);
    assert.match(result.message, /respuestas.*Exámenes/);
    assert.equal(writes.length, 0);
    assert.equal(paths.length, 0);
  }
});
