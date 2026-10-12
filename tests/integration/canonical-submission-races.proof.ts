import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { after, before, test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { db } from "@/lib/db";
import { resolveEffectiveCapabilities } from "@/lib/capabilities";
import { resolveLocalStorageObject } from "@/lib/local-storage";
import { PUT as store } from "@/app/api/local-storage/route";
import { submitAssignmentWithFiles } from "@/server/courses/submission-files";
import { confirmUpload, discardUpload, prepareUpload } from "@/server/courses/uploads";

// A dedicated, deliberately red diagnostic. Do not run against the UI journey or shared CI DB.
const prefix = `canonical_persistence_${randomUUID()}_`;
const institutionId = `${prefix}institution`;
const teacherId = `${prefix}teacher`;
const studentId = `${prefix}student`;
const courseId = `${prefix}course`;
const student = {
  id: studentId, institutionId, role: "STUDENT" as const,
  capabilities: resolveEffectiveCapabilities("STUDENT"),
};
const pdf = new TextEncoder().encode("%PDF-1.4\nSynthetic persistence proof\n%%EOF\n");
let storageRoot = "";
let fixturesCreated = false;

function guardTarget() {
  const requireValue = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
  requireValue(process.env.CANONICAL_SUBMISSION_RACE_PROOF === "ISOLATED_POSTGRES_ONLY", "Explicit isolated proof mode required");
  for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
    let url: URL;
    try { url = new URL(process.env[key] ?? ""); } catch { throw new Error(`${key}: invalid fixture URL`); }
    requireValue(url.protocol === "postgresql:", `${key}: unexpected protocol`);
    requireValue(url.hostname === "127.0.0.1", `${key}: nonlocal target refused`);
    requireValue(url.port === "5432", `${key}: unexpected port`);
    requireValue(url.pathname === "/edukana_persistence_proof", `${key}: unexpected database`);
    requireValue(url.username === "fixture" && url.password === "fixture", `${key}: synthetic fixture identity required`);
    requireValue(url.searchParams.get("connection_limit") === "8", `${key}: require eight connections`);
    requireValue([...url.searchParams.keys()].join() === "connection_limit" && !url.hash, `${key}: unexpected parameters`);
  }
  requireValue(process.env.DATABASE_URL === process.env.DIRECT_URL, "Both connections must be the same fixture");
  requireValue(process.env.APP_URL === "http://127.0.0.1:3169", "Unexpected fixture application URL");
  requireValue(process.env.SUPABASE_URL === undefined, "External storage configuration refused");
  requireValue(process.env.SUPABASE_SERVICE_ROLE_KEY === undefined, "External storage configuration refused");
}

before(async () => {
  guardTarget();
  const [target] = await db.$queryRaw<Array<{ name: string; user: string; address: string; port: number }>>`
    SELECT current_database() AS name, current_user AS "user", host(inet_server_addr()) AS address,
      inet_server_port() AS port`;
  assert.deepEqual(target, { name: "edukana_persistence_proof", user: "fixture", address: "127.0.0.1", port: 5432 });
  storageRoot = await mkdtemp(join(tmpdir(), "edukana-persistence-proof-"));
  process.env.LOCAL_STORAGE_ROOT = storageRoot;
  process.env.LOCAL_STORAGE_SECRET = "synthetic-persistence-proof-secret-never-real";
  await db.institution.create({ data: {
    id: institutionId, name: "Synthetic persistence proof", slug: `${prefix}school`,
    users: { create: [
      { id: teacherId, name: "Synthetic Teacher", email: `${prefix}teacher@example.invalid`, role: "TEACHER" },
      { id: studentId, name: "Synthetic Student", email: `${prefix}student@example.invalid`, role: "STUDENT" },
    ] },
    academicPeriods: { create: {
      id: `${prefix}period`, name: "Synthetic period", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"),
    } },
  } });
  fixturesCreated = true;
  await db.course.create({ data: {
    id: courseId, institutionId, periodId: `${prefix}period`, teacherId, name: "Synthetic course", isPublished: true,
  } });
  await db.enrollment.create({ data: { institutionId, courseId, studentId, status: "ACTIVE" } });
});

after(async () => {
  try {
    if (fixturesCreated) await db.institution.delete({ where: { id: institutionId } });
    if (storageRoot) {
      assert.ok(resolve(storageRoot).startsWith(`${resolve(tmpdir())}${sep}edukana-persistence-proof-`));
      await rm(storageRoot, { recursive: true, force: true });
    }
  } finally { await db.$disconnect(); }
});

async function fixture(name: string) {
  const assignmentId = `${prefix}${name}`;
  await db.assignment.create({ data: { id: assignmentId, institutionId, courseId, title: name, isPublished: true } });
  const prepared = await prepareUpload(student, {
    purpose: "submission", assignmentId, name: "proof.pdf", type: "application/pdf", size: pdf.length,
  });
  assert.ok(prepared.ok, "Production reservation must succeed");
  const uploaded = await store(new Request(prepared.uploadUrl, {
    method: "PUT", headers: { "content-type": "application/pdf" }, body: new Uint8Array(pdf),
  }));
  assert.equal(uploaded.status, 201);
  assert.ok((await confirmUpload(student, prepared.assetId)).ok);
  const asset = await db.storageAsset.findUniqueOrThrow({ where: { id: prepared.assetId } });
  return { assignmentId, assetId: asset.id, path: resolveLocalStorageObject(storageRoot, asset.objectPath) };
}

function holdAsset(id: string) {
  let release!: () => void;
  const released = new Promise<void>((done) => { release = done; });
  let acquired!: (pid: number) => void;
  let rejected!: (error: unknown) => void;
  const ready = new Promise<number>((done, fail) => { acquired = done; rejected = fail; });
  const finished = db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM storage_assets WHERE id = ${id} FOR UPDATE`;
    const [row] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
    acquired(row.pid);
    await released;
  }, { timeout: 15_000 });
  void finished.catch(rejected);
  return { ready, release, finished };
}

async function blockedBy(blocker: number, command: "DELETE" | "UPDATE") {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const rows = await db.$queryRaw<Array<{ pid: number }>>`
      SELECT pid FROM pg_stat_activity
      WHERE ${blocker} = ANY(pg_blocking_pids(pid)) AND position('storage_assets' IN query) > 0
        AND ltrim(query) LIKE ${`${command}%`}`;
    if (rows.length === 1) return rows[0].pid;
    await delay(15);
  }
  throw new Error(`No observed PostgreSQL ${command} wait on storage_assets behind backend ${blocker}`);
}

async function race(item: Awaited<ReturnType<typeof fixture>>, first: "discard" | "submit", t: TestContext) {
  const held = holdAsset(item.assetId);
  const submit = () => submitAssignmentWithFiles(student, { assignmentId: item.assignmentId, assetIds: [item.assetId] });
  const discard = () => discardUpload(student, item.assetId);
  let firstResult: ReturnType<typeof submit> | ReturnType<typeof discard> | undefined;
  let secondResult: ReturnType<typeof submit> | ReturnType<typeof discard> | undefined;
  try {
    const holder = await held.ready;
    firstResult = first === "discard" ? discard() : submit();
    void firstResult.catch(() => {});
    const firstPid = await blockedBy(holder, first === "discard" ? "DELETE" : "UPDATE");
    secondResult = first === "discard" ? submit() : discard();
    void secondResult.catch(() => {});
    const secondPid = await blockedBy(firstPid, first === "discard" ? "UPDATE" : "DELETE");
    assert.notEqual(firstPid, secondPid, "Production callers must use distinct PostgreSQL backends");
    t.diagnostic(`Observed lock chain: holder -> ${first} -> ${first === "discard" ? "submit" : "discard"}`);
  } finally {
    held.release();
    await Promise.allSettled([held.finished, firstResult, secondResult]);
  }
  assert.ok(firstResult && secondResult);
  const [firstValue, secondValue] = await Promise.all([firstResult, secondResult]);
  const [submission, asset] = await Promise.all([
    db.submission.findUnique({
      where: { assignmentId_studentId: { assignmentId: item.assignmentId, studentId } }, include: { assets: true },
    }),
    db.storageAsset.findUnique({ where: { id: item.assetId } }),
  ]);
  const blobExists = await stat(item.path).then(() => true, (error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return false;
    throw error;
  });
  t.diagnostic(JSON.stringify({
    first, firstSuccess: firstValue.ok, secondSuccess: secondValue.ok,
    submissionStatus: submission?.status ?? null, content: submission?.content ?? null,
    attachedFiles: submission?.assets.length ?? 0, assetExists: Boolean(asset), blobExists,
  }));
  return { firstValue, secondValue, submission, asset, blobExists };
}

test("control: submitted file persists and a subsequent discard is denied", async () => {
  const item = await fixture("sequential_control");
  assert.ok((await submitAssignmentWithFiles(student, { assignmentId: item.assignmentId, assetIds: [item.assetId] })).ok);
  assert.equal((await discardUpload(student, item.assetId)).ok, false);
  const asset = await db.storageAsset.findUniqueOrThrow({ where: { id: item.assetId } });
  assert.ok(asset.submissionId);
  assert.deepEqual(new Uint8Array(await readFile(item.path)), pdf);
});

test("discard first: submission must not report success after its only file disappeared", async (t) => {
  const result = await race(await fixture("discard_first"), "discard", t);
  assert.ok(result.firstValue.ok, "The pending discard wins this order");
  assert.equal(result.secondValue.ok, false, "A submission with zero surviving files must be rejected");
  assert.equal(result.submission, null, "A rejected file-only submission must roll back");
});

test("submission first: stale discard must preserve the now-delivered file and bytes", async (t) => {
  const item = await fixture("submit_first");
  const result = await race(item, "submit", t);
  assert.ok(result.firstValue.ok, "Submission wins this order");
  assert.equal(result.secondValue.ok, false, "A stale pending-file authorization cannot delete delivered evidence");
  assert.equal(result.submission?.assets.length, 1);
  assert.ok(result.asset?.submissionId);
  assert.equal(result.blobExists, true);
  assert.deepEqual(new Uint8Array(await readFile(item.path)), pdf);
});
