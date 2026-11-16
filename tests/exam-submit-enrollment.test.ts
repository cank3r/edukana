import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";
import type { PrismaClient } from "@prisma/client";
const actor = { id: "student", institutionId: "institution" };
const now = new Date("2026-10-09T12:00:00Z");
let eligible = true;
let attemptOpen = true;
let expired = false;
let events: string[] = [];
const tx = {
  $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join("?");
    if (sql.includes('FROM "enrollments" e')) {
      events.push("enrollment.lock");
      assert.match(sql, /FOR UPDATE OF e/);
      assert.match(sql, /e\."status" = 'ACTIVE'/);
      assert.match(sql, /a\."enrollmentId" = e\."id"/);
      assert.match(sql, /x\."courseId" = e\."courseId"/);
      assert.deepEqual(values, ["attempt", actor.id, actor.institutionId, actor.id, actor.institutionId, actor.institutionId, actor.institutionId]);
      return eligible ? [{ id: "enrollment" }] : [];
    }
    events.push("attempt.lock");
    assert.match(sql, /FROM "exam_attempts"/);
    return attemptOpen ? [{ id: "attempt" }] : [];
  },
  examAttempt: {
    findUniqueOrThrow: async () => {
      events.push("attempt.read");
      return { id: "attempt", enrollmentId: "enrollment", attemptNumber: 1,
        expiresAt: new Date(now.getTime() + (expired ? -31000 : 60000)),
        exam: { courseId: "course", gradeItem: null, course: { teacherId: "teacher" }, questions: [] } };
    },
    update: async () => { events.push("attempt.write"); },
  },
  examAnswer: { createMany: async () => { events.push("answers.write"); } },
};
(globalThis as unknown as { prisma: PrismaClient }).prisma = {
  $transaction: async (run: (client: typeof tx) => Promise<unknown>) => run(tx),
} as unknown as PrismaClient;
let submit: typeof import("../src/server/exams").submitExamAttempt;
before(async () => { ({ submitExamAttempt: submit } = await import("../src/server/exams")); });
beforeEach(() => { eligible = true; attemptOpen = true; expired = false; events = []; });
test("submission checks and locks active enrollment before attempt or any write", async () => {
  assert.equal((await submit(actor, "attempt", {}, now)).ok, true);
  assert.deepEqual(events, ["enrollment.lock", "attempt.lock", "attempt.read", "answers.write", "attempt.write"]);
});
test("ineligible enrollment fails closed without reading questions or mutating", async () => {
  eligible = false;
  assert.deepEqual(await submit(actor, "attempt", {}, now), { ok: false, reason: "not_found", message: "No hay un intento en curso para enviar." });
  assert.deepEqual(events, ["enrollment.lock"]);
});
test("revoked enrollment cannot even close an expired attempt", async () => {
  eligible = false; expired = true;
  assert.equal((await submit(actor, "attempt", {}, now)).ok, false);
  assert.deepEqual(events, ["enrollment.lock"]);
});
test("attempt changed while waiting is rechecked before any read or write", async () => {
  attemptOpen = false;
  assert.equal((await submit(actor, "attempt", {}, now)).ok, false);
  assert.deepEqual(events, ["enrollment.lock", "attempt.lock"]);
});
test("active enrollment preserves expiry handling", async () => {
  expired = true;
  const result = await submit(actor, "attempt", {}, now);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "expired");
  assert.deepEqual(events, ["enrollment.lock", "attempt.lock", "attempt.read", "attempt.write"]);
});
