import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import type { TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { resolveLocalStorageObject } from "@/lib/local-storage";
import type { UploadActor } from "@/server/courses/uploads";
import { createPrivateAccessFixture, putBytes } from "./private-access-fixture";

type Fixture = Awaited<ReturnType<typeof createPrivateAccessFixture>>;
type Method = "GET" | "PATCH" | "DELETE";
type Association = { announcementId: string } | { submissionId: string };
let currentUser: UploadActor | null = null;
const { loadWithStubs } = createRequire(import.meta.url)("../helpers/load-with-stubs.cjs");
// The session boundary alone is replaced. Prisma, authorization and storage remain real.
const stubs = { "@/lib/auth": { auth: async () => currentUser ? { user: currentUser } : null } };
const creation: typeof import("@/app/api/assets/route") = loadWithStubs("src/app/api/assets/route.ts", stubs);
const routes: typeof import("@/app/api/assets/[assetId]/route") = loadWithStubs("src/app/api/assets/[assetId]/route.ts", stubs);

export function legacyHarness(f: Fixture) {
  const as = (actor: UploadActor | null) => { currentUser = actor; };
  const request = (method: Method, assetId: string) => routes[method](
    new Request(`http://127.0.0.1:3179/api/assets/${assetId}`, { method }),
    { params: Promise.resolve({ assetId }) },
  );
  const post = (fields: Record<string, unknown> = {}) => creation.POST(new Request("http://127.0.0.1:3179/api/assets", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "synthetic-proof.pdf", type: "application/pdf", size: f.pdf.length, kind: "DOCUMENT",
      courseId: f.a.courseId, ...fields,
    }),
  }));
  async function upload(options: { confirmed?: boolean; lessonId?: string; declaredSize?: number } = {}) {
    as(f.a.teacher);
    const response = await post({ lessonId: options.lessonId, size: options.declaredSize ?? f.pdf.length });
    assert.equal(response.status, 201, "Real legacy reservation must succeed");
    const body = await response.json() as { assetId: string; uploadUrl: string };
    assert.equal(new URL(body.uploadUrl).pathname, "/api/local-storage");
    await putBytes(body.uploadUrl, f.pdf, "application/pdf");
    if (options.confirmed) assert.equal((await request("PATCH", body.assetId)).status, 200);
    const row = await f.db.storageAsset.findUniqueOrThrow({ where: { id: body.assetId } });
    return { id: row.id, path: resolveLocalStorageObject(f.storageRoot, row.objectPath), row };
  }
  async function preserved(file: Awaited<ReturnType<typeof upload>>) {
    assert.deepEqual(await f.db.storageAsset.findUniqueOrThrow({ where: { id: file.id } }), file.row);
    assert.deepEqual(new Uint8Array(await readFile(file.path)), f.pdf);
  }
  async function absent(file: Awaited<ReturnType<typeof upload>>) {
    assert.equal(await f.db.storageAsset.count({ where: { id: file.id } }), 0);
    await assert.rejects(stat(file.path), { code: "ENOENT" });
    await assert.rejects(stat(`${file.path}.meta.json`), { code: "ENOENT" });
  }
  async function submission() {
    const assignment = await f.db.assignment.create({ data: {
      institutionId: f.a.institutionId, courseId: f.a.courseId, title: `Synthetic ${randomUUID()}`, isPublished: true,
    } });
    const enrollment = await f.db.enrollment.findFirstOrThrow({ where: {
      institutionId: f.a.institutionId, courseId: f.a.courseId, studentId: f.a.student.id, status: "ACTIVE",
    } });
    return f.db.submission.create({ data: {
      institutionId: f.a.institutionId, assignmentId: assignment.id, studentId: f.a.student.id,
      enrollmentId: enrollment.id, content: "Synthetic original answer", status: "SUBMITTED",
    } });
  }
  function hold(id: string, association?: Association) {
    let release!: () => void;
    const released = new Promise<void>((done) => { release = done; });
    let acquired!: (pid: number) => void;
    let failed!: (error: unknown) => void;
    const ready = new Promise<number>((done, fail) => { acquired = done; failed = fail; });
    const finished = f.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM storage_assets WHERE id = ${id} FOR UPDATE`;
      assert.equal(rows.length, 1);
      // Fixture association only: this does not pretend to execute the announcement publication UI/action.
      if (association) await tx.storageAsset.update({ where: { id }, data: association });
      const [row] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      acquired(row.pid);
      await released;
    }, { timeout: 20_000 });
    void finished.catch(failed);
    return { ready, release, finished };
  }
  async function blockedBy(blocker: number, command: "DELETE" | "UPDATE") {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const rows = await f.db.$queryRaw<Array<{ pid: number }>>`
        SELECT pid FROM pg_stat_activity
        WHERE ${blocker} = ANY(pg_blocking_pids(pid)) AND position('storage_assets' IN query) > 0
          AND ltrim(query) LIKE ${`${command}%`}`;
      if (rows.length === 1) return rows[0].pid;
      await delay(15);
    }
    throw new Error(`No observed PostgreSQL ${command} wait behind backend ${blocker}`);
  }
  async function queued(file: Awaited<ReturnType<typeof upload>>, method: "PATCH" | "DELETE", t: TestContext,
    association?: Association) {
    const held = hold(file.id, association);
    const pending: Array<Promise<Response>> = [];
    try {
      const holder = await held.ready;
      pending.push(request(method, file.id));
      void pending[0].catch(() => {});
      const command = method === "PATCH" ? "UPDATE" : "DELETE";
      const first = await blockedBy(holder, command);
      assert.notEqual(first, holder);
      if (!association) {
        pending.push(request(method, file.id));
        void pending[1].catch(() => {});
        const second = await blockedBy(first, command);
        assert.notEqual(first, second, "Requests must use distinct PostgreSQL backends");
      }
      assert.deepEqual(new Uint8Array(await readFile(file.path)), f.pdf, "Waiting requests must preserve bytes");
      t.diagnostic(association ? `Observed fixture association -> legacy ${method} lock wait`
        : `Observed holder -> first ${method} -> repeated ${method} lock chain`);
    } finally {
      held.release();
      await Promise.allSettled([held.finished, ...pending]);
    }
    await held.finished;
    return Promise.all(pending);
  }
  return { as, request, post, upload, preserved, absent, submission, queued };
}
