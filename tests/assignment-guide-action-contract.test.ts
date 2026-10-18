import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createRequire } from "node:module";
import type { FileActionState } from "../src/server/actions/files";

// Exercise the existing action. Session, authorization, persistence and cache are
// explicit stubs: these checks do not prove database or deployed transport behavior.
const { loadWithStubs } = createRequire(import.meta.url)("./helpers/load-with-stubs.cjs");
type SessionUser = { id: string; institutionId: string; role: string };
type Payload = { assignmentId: string; content: string; link: string; assetIds: string[] };
type Actor = SessionUser & { capabilities: Set<string> };
type ServiceResult = { ok: true; courseId: string; resubmitted: boolean } | FileActionState;
let user: SessionUser | null;
let capabilities: Set<string>;
let calls: Array<{ actor: Actor; payload: Payload }>;
let invalidations: Array<[string, string | undefined]>;
let persist: () => Promise<ServiceResult>;
let failCache: boolean;
let failSession: boolean;

const { submitWithFilesAction } = loadWithStubs("src/server/actions/files.ts", {
  "@/lib/auth": { auth: async () => {
    if (failSession) throw new Error("synthetic session lookup failure");
    return user ? { user } : null;
  } },
  "@/lib/authorization": { getEffectiveCapabilities: async () => capabilities },
  "@/server/courses/images": {},
  "@/server/courses/submission-files": {
    submitAssignmentWithFiles: async (actor: Actor, payload: Payload) => {
      calls.push({ actor, payload });
      return persist();
    },
  },
  "next/cache": { revalidatePath: (path: string, type?: string) => {
    invalidations.push([path, type]);
    if (failCache) throw new Error("synthetic cache failure after persistence");
  } },
}) as { submitWithFilesAction: (state: FileActionState, form: FormData) => Promise<FileActionState> };

const initial = { ok: false, message: "" };
function form() {
  const data = new FormData();
  data.set("assignmentId", "  assignment-fixture  ");
  data.set("content", "  A synthetic answer.  ");
  data.set("link", "  https://example.test/resource  ");
  data.append("assetIds", "pending-fixture");
  data.append("assetIds", "previous-fixture");
  return data;
}
beforeEach(() => {
  user = { id: "student-fixture", institutionId: "institution-fixture", role: "STUDENT" };
  capabilities = new Set(["course.participate"]);
  calls = [];
  invalidations = [];
  failCache = false;
  failSession = false;
  persist = async () => ({ ok: true, courseId: "course-fixture", resubmitted: false });
});

for (const scenario of ["expired session", "teacher", "missing capability"] as const) {
  test(`guide action preserves the existing access boundary: ${scenario}`, async () => {
    if (scenario === "expired session") user = null;
    if (scenario === "teacher") user!.role = "TEACHER";
    if (scenario === "missing capability") capabilities.clear();
    const result = await submitWithFilesAction(initial, form());
    assert.equal(result.ok, false);
    assert.ok(result.message.length > 0);
    assert.deepEqual(calls, []);
    assert.deepEqual(invalidations, []);
  });
}

test("the action uses session identity and preserves the existing submission payload", async () => {
  const data = form();
  data.set("studentId", "forged-student");
  data.set("institutionId", "forged-institution");
  const result = await submitWithFilesAction(initial, data);
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{
    actor: { ...user!, capabilities },
    payload: {
      assignmentId: "assignment-fixture", content: "A synthetic answer.",
      link: "https://example.test/resource", assetIds: ["pending-fixture", "previous-fixture"],
    },
  }]);
  assert.deepEqual(invalidations, [
    ["/dashboard/aula/course-fixture/tareas", "layout"],
    ["/dashboard/aula/course-fixture", undefined],
  ]);
});

test("success cannot resolve while the persistence service is still pending", async () => {
  let release!: (result: ServiceResult) => void;
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  persist = () => { entered(); return new Promise(resolve => { release = resolve; }); };
  let settled = false;
  const action = submitWithFilesAction(initial, form()).then(result => { settled = true; return result; });
  await started;
  await Promise.resolve();
  assert.equal(settled, false);
  assert.deepEqual(invalidations, []);
  release({ ok: true, courseId: "course-fixture", resubmitted: false });
  assert.equal((await action).ok, true);
});

test("a business rejection is preserved without a success or cache invalidation", async () => {
  const rejection = { ok: false, message: "Synthetic assignment is closed." };
  persist = async () => rejection;
  assert.deepEqual(await submitWithFilesAction(initial, form()), rejection);
  assert.deepEqual(invalidations, []);
});

test("resubmission uses a distinct confirmation without inventing a receipt or time", async () => {
  const first = await submitWithFilesAction(initial, form());
  persist = async () => ({ ok: true, courseId: "course-fixture", resubmitted: true });
  const again = await submitWithFilesAction(initial, form());
  assert.equal(again.ok, true);
  assert.notEqual(again.message, first.message);
  assert.match(again.message, /^Entrega actualizada\./);
  assert.deepEqual(Object.keys(again).sort(), ["message", "ok"]);
});

test("a service exception never becomes an optimistic success", async (context) => {
  context.mock.method(console, "error", () => undefined);
  persist = async () => { throw new Error("synthetic service failure"); };
  const result = await submitWithFilesAction(initial, form());
  assert.equal(result.ok, false);
  assert.ok(result.message.length > 0);
  assert.deepEqual(invalidations, []);
});

test("false after cache failure does not establish that persistence was rolled back", async (context) => {
  context.mock.method(console, "error", () => undefined);
  let stored = false;
  persist = async () => { stored = true; return { ok: true, courseId: "course-fixture", resubmitted: false }; };
  failCache = true;
  const result = await submitWithFilesAction(initial, form());
  assert.equal(stored, true, "the stubbed service already confirmed the write");
  assert.equal(result.ok, false, "the same public false also covers a post-service cache failure");
  assert.deepEqual(Object.keys(result).sort(), ["message", "ok"]);
  assert.equal(invalidations.length, 1);
});

test("a session lookup exception can reject instead of returning FileActionState", async () => {
  failSession = true;
  await assert.rejects(submitWithFilesAction(initial, form()), /synthetic session lookup failure/);
  assert.deepEqual(calls, []);
});
