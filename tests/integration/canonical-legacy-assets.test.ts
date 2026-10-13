import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { createRequire } from "node:module";
import { resolveEffectiveCapabilities } from "@/lib/capabilities";
import type { EdukanaRole } from "@/types/next-auth";

// Handler regression only: no environment, Prisma connection, filesystem fixture or provider.
// Keep request parsing, course scope and upload-purpose policy real; stub external boundaries.
const require = createRequire(import.meta.url);
const { loadWithStubs } = require("../helpers/load-with-stubs.cjs");
type Row = Record<string, unknown>;
type Query = { where?: Row; select?: Row; data?: Row };
type Actor = { id: string; institutionId: string; role: EdukanaRole };
let user: Actor | null;
let capabilities: ReturnType<typeof resolveEffectiveCapabilities>;
let course: Row;
let assignment: Row;
let submission: Row;
let assets: Row[];
let revisions: Row[];
let writes: string[];
let storageCalls: string[];
let beforeMutation: (() => void) | undefined;
let mismatched: boolean;
let providerBytes: Buffer | null;

function record(value: unknown): Row {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as Row;
}

// Evaluate the filters actually sent by the handler, including nested scope and JSON retention.
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === "AND") return (Array.isArray(expected) ? expected : [expected]).every((part) => matches(row, record(part)));
    if (key === "OR") return (expected as Row[]).some((part) => matches(row, part));
    const actual = row[key];
    if (expected === null || typeof expected !== "object") return actual === expected;
    const condition = record(expected);
    if (Object.hasOwn(condition, "not")) return actual !== condition.not;
    if (Object.hasOwn(condition, "in")) return (condition.in as unknown[]).includes(actual);
    if (Object.hasOwn(condition, "startsWith")) return typeof actual === "string" && actual.startsWith(String(condition.startsWith));
    if (Object.hasOwn(condition, "some")) return Array.isArray(actual) && actual.some((item) => matches(record(item), record(condition.some)));
    if (Object.hasOwn(condition, "array_contains")) {
      assert.ok(Array.isArray(condition.array_contains), "PostgreSQL JSON array_contains needs an array");
      return Array.isArray(actual) && condition.array_contains.every((item) => actual.includes(item));
    }
    return actual !== null && typeof actual === "object" && matches(record(actual), condition);
  });
}

function project(row: Row, select?: Row): Row {
  if (!select) return { ...row };
  return Object.fromEntries(Object.entries(select).filter(([, chosen]) => chosen).map(([key, chosen]) => {
    const value = row[key];
    return [key, chosen === true || value == null ? value : project(record(value), record(chosen).select as Row)];
  }));
}

const reader = (rows: () => Row[]) => async (query: Query = {}) => {
  const found = rows().find((row) => matches(row, query.where));
  return found ? project(found, query.select) : null;
};
const database = {
  course: { findFirst: reader(() => [course]) },
  lesson: { findFirst: reader(() => [{ id: "lesson-a", institutionId: "institution-a", courseId: course.id, course }]) },
  assignment: { findFirst: reader(() => [assignment]) },
  submission: { findFirst: reader(() => [submission]) },
  submissionRevision: { findFirst: reader(() => revisions), count: async ({ where }: Query) => revisions.filter((row) => matches(row, where)).length },
  storageAsset: {
    findFirst: reader(() => assets),
    findUnique: reader(() => assets),
    create: async ({ data, select }: Query) => {
      writes.push("asset.create");
      const row = { id: "asset-created", confirmedAt: null, announcementId: null, ...data };
      assets.push(row);
      return project(row, select);
    },
    update: async ({ where, data, select }: Query) => {
      writes.push("asset.update");
      const row = assets.find((item) => matches(item, where));
      assert.ok(row, "update must target an existing fixture");
      Object.assign(row, data);
      return project(row, select);
    },
    delete: async ({ where }: Query) => {
      writes.push("asset.delete");
      const row = assets.find((item) => matches(item, where));
      assert.ok(row, "delete must target an existing fixture");
      assets = assets.filter((item) => item !== row);
      return row;
    },
    updateMany: async ({ where, data }: Query) => {
      beforeMutation?.(); beforeMutation = undefined;
      const found = assets.filter((row) => matches(row, where));
      if (found.length) writes.push("asset.update");
      for (const row of found) Object.assign(row, data);
      return { count: found.length };
    },
    deleteMany: async ({ where }: Query) => {
      beforeMutation?.(); beforeMutation = undefined;
      const found = assets.filter((row) => matches(row, where));
      if (found.length) writes.push("asset.delete");
      assets = assets.filter((row) => !found.includes(row));
      return { count: found.length };
    },
  },
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Network is forbidden in legacy asset handler tests"); };
after(() => { globalThis.fetch = originalFetch; });
const stubs = {
  "@/lib/auth": { auth: async () => user ? { user } : null },
  "@/lib/authorization": { getEffectiveCapabilities: async () => capabilities },
  "@/lib/db": { db: database },
  "@/lib/storage": {
    createPrivateAssetUpload: async (input: { institutionId: string; courseId: string; fileName: string }) => {
      storageCalls.push("prepare");
      return { bucket: "fixture-private", objectPath: `${input.institutionId}/${input.courseId}/fixture-${input.fileName}`,
        signedUrl: "https://storage.example.invalid/fixture-upload" };
    },
    inspectPrivateAsset: async () => {
      storageCalls.push("inspect");
      return { size: mismatched ? 99 : assets[0].sizeBytes, contentType: assets[0].mimeType, etag: "fixture-etag" };
    },
    removePrivateAsset: async (bucket: string, objectPath: string) => {
      assert.equal(assets.some((row) => row.bucket === bucket && row.objectPath === objectPath), false, "claim row before bytes");
      storageCalls.push("remove"); providerBytes = null;
    },
    createPrivateAssetUrl: async () => { storageCalls.push("read"); return "https://storage.example.invalid/fixture-read"; },
  },
};
const creation: typeof import("@/app/api/assets/route") = loadWithStubs("src/app/api/assets/route.ts", stubs);
const assetRoutes: typeof import("@/app/api/assets/[assetId]/route") = loadWithStubs("src/app/api/assets/[assetId]/route.ts", stubs);

function as(role: EdukanaRole, institutionId = "institution-a") {
  user = { id: role === "STUDENT" ? "student-a" : "teacher-a", institutionId, role };
  capabilities = resolveEffectiveCapabilities(role);
}
beforeEach(() => {
  as("TEACHER");
  course = { id: "course-a", institutionId: "institution-a", teacherId: "teacher-a", isPublished: true,
    enrollments: [{ studentId: "student-a", status: "ACTIVE" }] };
  assignment = { id: "assignment-a", institutionId: "institution-a", courseId: course.id, course, isPublished: true,
    dueDate: null, allowLate: false };
  submission = { id: "submission-a", institutionId: "institution-a", studentId: "student-a", assignmentId: assignment.id,
    assignment, status: "SUBMITTED", score: null };
  assets = []; revisions = []; writes = []; storageCalls = []; beforeMutation = undefined; mismatched = false;
  providerBytes = Buffer.from("fictitious provider bytes");
});

function file(changes: Row = {}) {
  const row = { id: "asset-a", institutionId: "institution-a", uploaderId: user!.id, bucket: "fixture-private",
    objectPath: "institution-a/course-a/fixture.pdf", originalName: "fixture.pdf", mimeType: "application/pdf", sizeBytes: 32,
    courseId: "course-a", lessonId: "lesson-a", assignmentId: null, submissionId: null, announcementId: null,
    kind: "DOCUMENT", visibility: "COURSE", confirmedAt: null, ...changes };
  assets.push(row);
  return row;
}
function post(fields: Row = {}) {
  return creation.POST(new Request("https://app.example.invalid/api/assets", { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "fixture.pdf", type: "application/pdf", size: 32, kind: "DOCUMENT", courseId: "course-a", ...fields }) }));
}
function mutate(method: "PATCH" | "DELETE", id = "asset-a") {
  return assetRoutes[method](new Request(`https://app.example.invalid/api/assets/${id}`, { method }), { params: Promise.resolve({ assetId: id }) });
}
function untouched(before: Row[]) {
  assert.deepEqual(writes, [], "denied request must not write database state");
  assert.deepEqual(storageCalls, [], "denied request must not inspect, sign or remove provider bytes");
  assert.deepEqual(assets, before, "denied request must preserve existing asset metadata");
}

for (const state of ["GRADED", "closed", "open"] as const) {
  test(`legacy POST: student cannot bypass submission pipeline (${state})`, async () => {
    as("STUDENT");
    if (state === "GRADED") { submission.status = "GRADED"; submission.score = 95; }
    if (state === "closed") assignment.dueDate = new Date("2000-01-01T00:00:00Z");
    const response = await post({ submissionId: "submission-a" });
    assert.equal(response.status, 403);
    untouched([]);
  });
}
test("legacy POST: course manager cannot attach directly to another student's submission", async () => {
  const response = await post({ submissionId: "submission-a" });
  assert.equal(response.status, 403);
  untouched([]);
});

for (const method of ["PATCH", "DELETE"] as const) {
  for (const reference of ["current", "historical"] as const) {
    test(`legacy ${method}: preserves ${reference} submission evidence in old course folder`, async () => {
      as("STUDENT");
      file({ lessonId: null, submissionId: reference === "current" ? "submission-a" : null, visibility: "PRIVATE",
        confirmedAt: method === "DELETE" ? new Date("2026-10-01T00:00:00Z") : null });
      if (reference === "historical") revisions.push({ id: "revision-a", institutionId: "institution-a",
        submissionId: "submission-a", assetIds: ["asset-a"] });
      const before = structuredClone(assets);
      const response = await mutate(method);
      assert.equal(response.status, 409);
      untouched(before);
    });
  }
  for (const revoked of ["capability", "assignment"] as const) {
    test(`legacy ${method}: rechecks teacher ${revoked} before touching their course file`, async () => {
      file({ confirmedAt: method === "DELETE" ? new Date("2026-10-01T00:00:00Z") : null });
      if (revoked === "capability") capabilities = new Set([...capabilities].filter((item) => item !== "course.view"));
      else course.teacherId = "other-teacher";
      const before = structuredClone(assets);
      assert.equal((await mutate(method)).status, 403);
      untouched(before);
    });
  }
  test(`legacy ${method}: anonymous and foreign sessions leave the owner's file intact`, async () => {
    file();
    const before = structuredClone(assets);
    user = null;
    assert.equal((await mutate(method)).status, 401);
    as("TEACHER", "institution-b");
    assert.equal((await mutate(method)).status, 404);
    untouched(before);
  });
  test(`legacy ${method}: another uploader in the same institution cannot mutate this file`, async () => {
    file({ uploaderId: "other-teacher" });
    const before = structuredClone(assets);
    assert.equal((await mutate(method)).status, 404);
    untouched(before);
  });
  test(`legacy ${method}: own announcement draft still works without course capabilities`, async () => {
    capabilities = new Set(["announcement.publish"]);
    file({ objectPath: "institution-a/announcements/drafts/teacher-a/fixture.png", originalName: "fixture.png",
      mimeType: "image/png", sizeBytes: 24, kind: "IMAGE", courseId: null, lessonId: null,
      confirmedAt: method === "DELETE" ? new Date("2026-10-01T00:00:00Z") : null });
    assert.equal((await mutate(method)).status, method === "PATCH" ? 200 : 204);
    assert.deepEqual(writes, [method === "PATCH" ? "asset.update" : "asset.delete"]);
    assert.deepEqual(storageCalls, [method === "PATCH" ? "inspect" : "remove"]);
  });
  test(`legacy ${method}: announcement permission revoked prevents mutating a reserved draft`, async () => {
    capabilities = new Set();
    file({ objectPath: "institution-a/announcements/drafts/teacher-a/fixture.png", originalName: "fixture.png",
      mimeType: "image/png", sizeBytes: 24, kind: "IMAGE", courseId: null, lessonId: null });
    const before = structuredClone(assets);
    assert.equal((await mutate(method)).status, 403);
    untouched(before);
  });
  test(`legacy ${method}: publication or submission attachment wins before mutation without losing bytes`, async () => {
    for (const field of ["submissionId", "announcementId"]) {
      assets = []; writes = []; storageCalls = []; file();
      const expected = structuredClone(assets); expected[0][field] = "concurrent-reference";
      const bytes = Buffer.from(providerBytes!);
      beforeMutation = () => { assets[0][field] = "concurrent-reference"; };
      assert.equal((await mutate(method)).status, 409);
      assert.deepEqual(assets, expected); assert.deepEqual(writes, []);
      assert.deepEqual(providerBytes, bytes); assert.equal(storageCalls.includes("remove"), false);
    }
  });
}

test("legacy mutations cannot confirm or discard files owned by the modern upload pipeline", async () => {
  for (const method of ["PATCH", "DELETE"] as const) for (const folder of ["submissions/course-a/task/student-a", "avatars/teacher-a", "public/logo/institution-a", "public/course/course-a"]) {
    assets = []; file({ objectPath: `institution-a/${folder}/fixture.pdf` });
    const before = structuredClone(assets);
    assert.equal((await mutate(method)).status, 409); untouched(before);
  }
});
test("legacy mismatched upload removes only an unclaimed file; concurrent publication preserves bytes", async () => {
  mismatched = true; file();
  const bytes = Buffer.from(providerBytes!);
  beforeMutation = () => { assets[0].announcementId = "published-concurrently"; };
  assert.equal((await mutate("PATCH")).status, 409);
  assert.equal(assets[0].announcementId, "published-concurrently");
  assert.deepEqual(providerBytes, bytes); assert.deepEqual(writes, []); assert.deepEqual(storageCalls, ["inspect"]);
  assets[0].announcementId = null;
  assert.equal((await mutate("PATCH")).status, 409);
  assert.deepEqual(assets, []); assert.equal(providerBytes, null);
  assert.deepEqual(writes, ["asset.delete"]); assert.deepEqual(storageCalls, ["inspect", "inspect", "remove"]);
});

test("legacy lesson upload: current teacher can prepare, confirm and remove their lesson file", async () => {
  assert.equal((await post({ lessonId: "lesson-a" })).status, 201);
  assert.equal(assets[0].submissionId, null);
  assert.equal(assets[0].lessonId, "lesson-a");
  assert.equal((await mutate("PATCH", "asset-created")).status, 200);
  assert.ok(assets[0].confirmedAt instanceof Date);
  assert.equal((await mutate("DELETE", "asset-created")).status, 204);
  assert.deepEqual(assets, []);
  assert.deepEqual(writes, ["asset.create", "asset.update", "asset.delete"]);
  assert.deepEqual(storageCalls, ["prepare", "inspect", "remove"]);
});
test("legacy POST: anonymous, foreign and unassigned teacher never reserve a file", async () => {
  user = null;
  assert.equal((await post()).status, 401);
  as("TEACHER", "institution-b");
  assert.equal((await post()).status, 403);
  as("TEACHER");
  course.teacherId = "other-teacher";
  assert.equal((await post()).status, 403);
  untouched([]);
});
