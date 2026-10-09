import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";
import { loadLegacyExamActions } from "./helpers/legacy-exam-actions.mjs";

let actions;
let user;
let granted;
let reads;
let writes;
let authFailure;
const fixture = {
  auth: async () => {
    if (authFailure) throw new Error("Session revoked");
    return user ? { user } : null;
  },
  getEffectiveCapabilities: async (...args) => { reads.push(args); return granted; },
  db: new Proxy({}, { get(_target, name) {
    writes.push(String(name));
    throw new Error("Legacy exam submission must never access assessments or grades");
  } }),
  revalidatePath: () => { writes.push("revalidate"); },
};
before(async () => { actions = await loadLegacyExamActions(fixture); });
beforeEach(() => {
  user = { id: "student-a", institutionId: "institution-a", role: "STUDENT" };
  granted = new Set(["course.participate"]);
  reads = [];
  writes = [];
  authFailure = false;
});

function payload(extra = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ examId: "exam-a", question_bank: "mutable-bank-answer", ...extra })) {
    data.set(key, value);
  }
  return data;
}
async function submit(data = payload()) {
  const result = await actions.submitExam({ ok: false, message: "" }, data);
  assert.equal(result.ok, false);
  assert.deepEqual(writes, [], "no attempt, answer, grade, revision or cache writes");
  assert.doesNotMatch(result.message, /mutable-bank-answer|bank-key|foreign-exam/);
  return result;
}

test("the actual legacy action fails closed without creating an attempt at submission", async () => {
  assert.match((await submit()).message, /Ver mis exámenes/);
  assert.deepEqual(reads, [["institution-a", "STUDENT"]]);
});

test("existing, absent, foreign and expired attempt identifiers never revive the old payload", async () => {
  for (const attemptId of ["", "missing", "own-live", "other-student", "other-institution", "expired", "submitted"]) {
    await submit(payload({ attemptId, startedAt: "2099-01-01", expiresAt: "2099-12-31" }));
  }
});

test("foreign exam and question identifiers cannot trigger a database read or write", async () => {
  await submit(payload({ examId: "foreign-exam", question_foreign: "bank-key", institutionId: "institution-b" }));
});

test("repeated legacy submits leave attempts, grades and academic history unchanged", async () => {
  const first = await submit();
  for (let retry = 0; retry < 3; retry++) assert.equal((await submit()).message, first.message);
});

test("every non-student role is denied even with a participation capability", async () => {
  for (const role of ["SUPER_ADMIN", "ADMIN", "COORDINATOR", "TEACHER", "PARENT", "ACCOUNTANT"]) {
    user.role = role;
    assert.match((await submit()).message, /No tienes permiso/);
  }
});

test("missing session, identity or institution cannot submit", async () => {
  for (const actor of [null, { id: "", institutionId: "institution-a", role: "STUDENT" },
    { id: "student-a", institutionId: "", role: "STUDENT" }]) {
    user = actor;
    assert.match((await submit()).message, /No tienes permiso/);
  }
  assert.equal(reads.length, 0);
});

test("revoked capabilities and failed live authentication fail closed", async () => {
  granted.clear();
  assert.match((await submit()).message, /No tienes permiso/);
  granted.add("course.participate");
  authFailure = true;
  assert.match((await submit()).message, /No tienes permiso/);
});
