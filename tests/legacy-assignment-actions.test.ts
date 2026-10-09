import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createRequire } from "node:module";
import { resolveEffectiveCapabilities } from "@/lib/capabilities";
import type { EdukanaRole } from "@/types/next-auth";

const require = createRequire(import.meta.url);
const { loadLegacyAssignmentActions } = require("./helpers/load-legacy-assignment-actions.cjs");
type User = { id: string; institutionId: string; role: EdukanaRole };
let user: User | null = null;
let capabilities: ReturnType<typeof resolveEffectiveCapabilities>;
let authCalls = 0;
let result: object = { ok: true, courseId: "course", resubmitted: false };
const calls: Array<{ name: string; args: unknown[] }> = [];
const paths: unknown[][] = [];
const service = (name: string) => async (...args: unknown[]) => { calls.push({ name, args }); return result; };
const legacy: typeof import("@/app/dashboard/academico/actions") = loadLegacyAssignmentActions({
  "@/lib/auth": { auth: async () => { authCalls++; return user ? { user } : null; } },
  "@/lib/authorization": { getEffectiveCapabilities: async () => capabilities },
  "@/lib/db": { db: { course: { findFirst: async () => ({ id: "course" }) } } },
  "next/cache": { revalidatePath: (...args: unknown[]) => paths.push(args) },
  "@/server/assessment/assignments": {
    submitAssignment: service("submit"), gradeSubmission: service("grade"),
    setAssignmentPublished: service("publish"),
  },
});
const initial = { ok: false, message: "" };
function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}
function as(role: EdukanaRole, institutionId = "institution") {
  user = { id: `${role.toLowerCase()}-session`, institutionId, role };
  capabilities = resolveEffectiveCapabilities(role);
}
beforeEach(() => { user = null; calls.length = 0; paths.length = 0; authCalls = 0; });

test("legacy: expired sessions cannot submit or grade; no service executes", async () => {
  for (const action of [legacy.submitAssignment, legacy.reviewSubmission]) {
    const state = await action(initial, form({ assignmentId: "task", submissionId: "submission", score: "10" }));
    assert.equal(state.ok, false);
    assert.match(state.message, /sesión/);
  }
  assert.equal(authCalls, 2);
  assert.equal(calls.length, 0);
});

test("legacy: only an authorized student reaches the submission service", async () => {
  for (const role of ["TEACHER", "ADMIN", "COORDINATOR", "PARENT"] as const) {
    as(role);
    assert.equal((await legacy.submitAssignment(initial, form({ assignmentId: "task", content: "Work" }))).ok, false);
  }
  as("STUDENT");
  capabilities = new Set();
  assert.equal((await legacy.submitAssignment(initial, form({ assignmentId: "task", content: "Work" }))).ok, false);
  assert.equal(calls.length, 0);
});

test("legacy: session identity and every submission field reach M3 unchanged apart from its documented trimming", async () => {
  as("STUDENT", "foreign-institution");
  result = { ok: false, message: "Esta tarea no está disponible para ti." };
  const state = await legacy.submitAssignment(initial, form({
    assignmentId: " task ", content: " My work ", link: " https://example.test/work ",
    studentId: "victim", institutionId: "forged-institution", role: "ADMIN",
  }));
  assert.deepEqual(state, result);
  assert.deepEqual(calls, [{ name: "submit", args: [
    { id: "student-session", institutionId: "foreign-institution" },
    { assignmentId: "task", content: "My work", link: "https://example.test/work" },
  ] }]);
  assert.equal(paths.length, 0);
});

test("legacy: a graded re-submission rejection is preserved and does not refresh", async () => {
  as("STUDENT");
  result = { ok: false, message: "Tu docente ya calificó esta entrega. No puedes reemplazarla." };
  assert.deepEqual(await legacy.submitAssignment(initial, form({ assignmentId: "task", content: "Replacement" })), result);
  assert.equal(calls.length, 1);
  assert.equal(paths.length, 0);
});

test("legacy: successful re-submission refreshes both canonical and course routes", async () => {
  as("STUDENT");
  result = { ok: true, courseId: "course", resubmitted: true };
  const state = await legacy.submitAssignment(initial, form({ assignmentId: "task", content: "Updated work" }));
  assert.equal(state.ok, true);
  assert.match(state.message, /actualizada/);
  assert.deepEqual(paths, [["/dashboard/aula/course/tareas", "layout"], ["/dashboard/aula/course"]]);
});

test("legacy: students and parents cannot call reviewSubmission directly", async () => {
  for (const role of ["STUDENT", "PARENT"] as const) {
    as(role);
    assert.equal((await legacy.reviewSubmission(initial, form({ submissionId: "submission", score: "10" }))).ok, false);
  }
  assert.equal(calls.length, 0);
});

test("legacy: grade, feedback, and correction reason are delegated without score coercion", async () => {
  as("TEACHER");
  result = { ok: true, courseId: "course", corrected: true };
  const state = await legacy.reviewSubmission(initial, form({
    submissionId: " submission ", score: " 8,5 ", feedback: " Revised feedback ", reason: " Calculation error ",
  }));
  assert.equal(state.ok, true);
  assert.match(state.message, /historial/);
  assert.deepEqual(calls[0], { name: "grade", args: [
    { ...user, capabilities },
    { submissionId: "submission", score: "8,5", feedback: "Revised feedback", reason: "Calculation error" },
  ] });
});

test("legacy: missing correction reason and blank score stay blank for canonical validation", async () => {
  as("TEACHER");
  result = { ok: false, message: "Escribe el motivo del cambio." };
  assert.deepEqual(await legacy.reviewSubmission(initial, form({ submissionId: "submission", score: "" })), result);
  assert.deepEqual(calls[0].args[1], { submissionId: "submission", score: "", feedback: "", reason: "" });
});

test("legacy: publication maps old fields only and preserves failure without fallback", async () => {
  as("TEACHER");
  result = { ok: false, message: "No encontramos esa tarea o no tienes acceso a ella." };
  assert.deepEqual(await legacy.togglePublication(initial, form({
    entity: "assignment", id: "task", publish: "false", assignmentId: "forged", published: "true",
  })), result);
  assert.deepEqual(calls, [{ name: "publish", args: [{ ...user, capabilities }, "task", false] }]);
  assert.equal(paths.length, 0);
});

test("legacy: creation fails closed after authentication; no dates or defaults are silently translated", async () => {
  as("TEACHER");
  const state = await legacy.createAssignment(initial, form({ courseId: "course", dueDate: "2026-12-01T17:00" }));
  assert.equal(state.ok, false);
  assert.match(state.message, /abre «Tareas»/);
  as("STUDENT");
  assert.equal((await legacy.createAssignment(initial, form({ courseId: "course" }))).ok, false);
  user = null;
  assert.equal((await legacy.createAssignment(initial, form({ courseId: "course" }))).ok, false);
  assert.equal(calls.length, 0);
});
