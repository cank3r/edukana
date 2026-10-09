import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import type { GradebookActor } from "../src/server/assessment/gradebook";

// Only replaces Next's marker. No integration setup or database client is started.
createRequire(import.meta.url)("./integration/stub-server-only.cjs");

const teacher: GradebookActor = { id: "teacher-a", institutionId: "institution-a", role: "TEACHER" };
const item = {
  id: "item-a", institutionId: teacher.institutionId, courseId: "course-a", title: "Exposición",
  assignmentId: null as string | null, examId: null as string | null, maxScore: 10, isPublished: false,
};
type Entry = { id: string; score: number | null; isExcused: boolean; revisions: string[] };
type Where = { id?: string; institutionId?: string; course?: { institutionId?: string; teacherId?: string } };

let currentItem: typeof item | null;
let entries: Entry[];
let locked: boolean;
let afterLock: (() => void) | undefined;
let deletes: number;

function reset(initialEntries: Entry[] = []) {
  currentItem = { ...item };
  entries = structuredClone(initialEntries);
  locked = false;
  afterLock = undefined;
  deletes = 0;
}

function matches(where: Where) {
  return currentItem && where.id === currentItem.id && where.institutionId === currentItem.institutionId
    && (!where.course || (where.course.institutionId === currentItem.institutionId
      && (!where.course.teacherId || where.course.teacherId === teacher.id)));
}

const fakeDb = {
  roleCapabilityOverride: { findMany: async () => [] },
  gradeItem: {
    findFirst: async ({ where }: { where: Where }) => matches(where) ? { ...currentItem } : null,
    deleteMany: async ({ where }: { where: Where }) => {
      if (!matches(where)) return { count: 0 };
      deletes++;
      currentItem = null;
      // Model the real cascade so the old implementation demonstrates the data loss.
      entries = [];
      return { count: 1 };
    },
  },
  gradeEntry: {
    findFirst: async ({ where }: { where: { gradeItemId: string } }) => {
      assert.equal(locked, true, "retention must be checked after the item is locked");
      assert.deepEqual(where, { gradeItemId: item.id }, "include every entry, including legacy rows and exemptions");
      return entries[0] ?? null;
    },
  },
  $queryRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
    assert.match(sql.join("?"), /FROM "grade_items"[\s\S]*FOR UPDATE/);
    assert.deepEqual(values, [item.id, teacher.institutionId, item.courseId]);
    locked = true;
    afterLock?.();
    return currentItem ? [{ ...currentItem }] : [];
  },
  $transaction: async <T>(run: (tx: unknown) => Promise<T>, options: { isolationLevel: string }) => {
    assert.equal(options.isolationLevel, "ReadCommitted");
    try { return await run(fakeDb); } finally { locked = false; }
  },
};

// Install a fail-closed in-memory client before importing any server module.
// Unimplemented operations throw rather than reaching DATABASE_URL.
(globalThis as unknown as { prisma: PrismaClient }).prisma = new Proxy(fakeDb, {
  get(target, key) {
    assert.ok(key in target, `Unexpected database operation: ${String(key)}`);
    return Reflect.get(target, key);
  },
}) as unknown as PrismaClient;

test("manual item deletion retains academic evidence without a database", async (t) => {
  const { deleteManualItem } = await import("../src/server/assessment/gradebook");

  for (const entry of [
    { id: "graded", score: 9, isExcused: false, revisions: [] },
    { id: "corrected", score: 9, isExcused: false, revisions: ["7 → 9: error al sumar"] },
    { id: "excused", score: null, isExcused: true, revisions: [] },
    { id: "history-only", score: null, isExcused: false, revisions: ["legacy revision"] },
  ]) {
    await t.test(`preserves ${entry.id} and its history`, async () => {
      reset([entry]);
      const result = await deleteManualItem(teacher, item.id);
      assert.equal(result.ok, false);
      assert.match(result.message, /notas|exoneraciones|historial/);
      assert.deepEqual(currentItem, item);
      assert.deepEqual(entries, [entry]);
      assert.equal(deletes, 0);
    });
  }

  await t.test("deletes an empty manual item and reports its real impact", async () => {
    reset();
    assert.deepEqual(await deleteManualItem(teacher, item.id), { ok: true, message: "Se borró «Exposición»." });
    assert.equal(currentItem, null);
    assert.equal(deletes, 1);
  });

  await t.test("rejects foreign institutions, other teachers and student/parent roles", async () => {
    reset();
    const outsiders: GradebookActor[] = [
      { ...teacher, institutionId: "institution-b" }, { ...teacher, id: "teacher-b" },
      { ...teacher, role: "STUDENT" }, { ...teacher, role: "PARENT" },
    ];
    for (const outsider of outsiders) assert.equal((await deleteManualItem(outsider, item.id)).ok, false);
    assert.equal((await deleteManualItem(teacher, "missing")).ok, false);
    assert.deepEqual(currentItem, item);
    assert.equal(deletes, 0);
  });

  for (const source of ["assignmentId", "examId"] as const) {
    await t.test(`rejects items linked through ${source}`, async () => {
      reset();
      currentItem![source] = "linked";
      assert.equal((await deleteManualItem(teacher, item.id)).ok, false);
      assert.equal(deletes, 0);
    });
  }

  await t.test("rechecks entries committed while waiting for the item lock", async () => {
    reset();
    const entry = { id: "concurrent", score: 7, isExcused: false, revisions: [] };
    afterLock = () => { entries.push(entry); };
    assert.equal((await deleteManualItem(teacher, item.id)).ok, false);
    assert.deepEqual(entries, [entry]);
    assert.deepEqual(currentItem, item);
    assert.equal(deletes, 0);
  });

  await t.test("rechecks the source after waiting for the item lock", async () => {
    reset();
    afterLock = () => { currentItem!.assignmentId = "concurrently-linked"; };
    assert.equal((await deleteManualItem(teacher, item.id)).ok, false);
    assert.equal(deletes, 0);
  });

  await t.test("does not claim success if the item disappeared before locking", async () => {
    reset();
    afterLock = () => { currentItem = null; };
    assert.equal((await deleteManualItem(teacher, item.id)).ok, false);
    assert.equal(deletes, 0);
  });
});
