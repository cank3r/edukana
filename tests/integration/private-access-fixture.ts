import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { db } from "@/lib/db";
import { resolveEffectiveCapabilities } from "@/lib/capabilities";
import { resolveLocalStorageObject } from "@/lib/local-storage";
import { PUT } from "@/app/api/local-storage/route";
import type { EdukanaRole } from "@/types/next-auth";

export const pdf = new TextEncoder().encode("%PDF-1.4\nSynthetic private access proof\n%%EOF\n");
const expectedUrl = "postgresql://fixture:fixture@127.0.0.1:5432/edukana_private_access_proof?connection_limit=8";
let activeRoot = "";

function guardTarget() {
  assert.equal(process.env.EDUKANA_PRIVATE_ACCESS_PROOF === "ISOLATED_POSTGRES_ONLY", true, "Explicit isolated mode required");
  for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
    // Compare booleans so an assertion failure cannot print a supplied connection string.
    assert.equal(process.env[key] === expectedUrl, true, `${key}: only the exact synthetic loopback fixture is accepted`);
  }
  assert.equal(process.env.APP_URL === "http://127.0.0.1:3179", true, "Unexpected fixture application URL");
  for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "LOCAL_STORAGE_ROOT", "LOCAL_STORAGE_SECRET"]) {
    assert.equal(process.env[key] === undefined, true, `${key}: inherited storage configuration refused`);
  }
}

function actor(prefix: string, institutionId: string, name: string, role: EdukanaRole) {
  return { id: `${prefix}${name}`, institutionId, role, capabilities: resolveEffectiveCapabilities(role) };
}

function side(prefix: string) {
  const institutionId = `${prefix}institution`;
  return {
    institutionId, periodId: `${prefix}period`, courseId: `${prefix}course`, otherCourseId: `${prefix}other_course`,
    admin: actor(prefix, institutionId, "admin", "ADMIN"),
    teacher: actor(prefix, institutionId, "teacher", "TEACHER"),
    otherTeacher: actor(prefix, institutionId, "other_teacher", "TEACHER"),
    student: actor(prefix, institutionId, "student", "STUDENT"),
    otherStudent: actor(prefix, institutionId, "other_student", "STUDENT"),
    parent: actor(prefix, institutionId, "parent", "PARENT"),
  };
}

export type PrivateAccessSide = ReturnType<typeof side>;
export type PrivateAccessActor = ReturnType<typeof actor>;

async function createSide(item: PrivateAccessSide) {
  const users = [item.admin, item.teacher, item.otherTeacher, item.student, item.otherStudent, item.parent];
  await db.institution.create({ data: {
    id: item.institutionId, slug: item.institutionId, name: "Synthetic private access institution",
    users: { create: users.map(({ id, role }) => ({ id, role, name: `Synthetic ${role}`, email: `${id}@example.invalid` })) },
    academicPeriods: { create: {
      id: item.periodId, name: "Synthetic period", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"),
    } },
  } });
  for (const id of [item.courseId, item.otherCourseId]) {
    await db.course.create({ data: {
      id, institutionId: item.institutionId, periodId: item.periodId,
      teacherId: item.teacher.id, name: "Synthetic course", isPublished: true,
    } });
  }
  await db.enrollment.createMany({ data: [
    { institutionId: item.institutionId, studentId: item.student.id, courseId: item.courseId, status: "ACTIVE" },
    { institutionId: item.institutionId, studentId: item.otherStudent.id, courseId: item.otherCourseId, status: "COMPLETED" },
  ] });
}

export async function createPrivateAccessFixture() {
  guardTarget();
  const [target] = await db.$queryRaw<Array<{ name: string; user: string; address: string; port: number }>>`
    SELECT current_database() AS name, current_user AS "user", host(inet_server_addr()) AS address,
      inet_server_port() AS port`;
  assert.deepEqual(target, { name: "edukana_private_access_proof", user: "fixture", address: "127.0.0.1", port: 5432 });
  const prefix = `private_access_${randomUUID()}_`;
  const a = side(`${prefix}a_`);
  const b = side(`${prefix}b_`);
  const storageRoot = await mkdtemp(join(tmpdir(), "edukana-private-access-proof-"));
  activeRoot = storageRoot;
  process.env.LOCAL_STORAGE_ROOT = storageRoot;
  process.env.LOCAL_STORAGE_SECRET = "synthetic-private-access-proof-secret-never-real";
  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    try {
      const where = { institutionId: { in: [a.institutionId, b.institutionId] } };
      await db.guardianship.deleteMany({ where });
      await db.roleCapabilityOverride.deleteMany({ where });
      await db.submissionRevision.deleteMany({ where });
      await db.institution.deleteMany({ where: { id: { in: [a.institutionId, b.institutionId] } } });
    } finally {
      try {
        assert.ok(resolve(storageRoot).startsWith(`${resolve(tmpdir())}${sep}edukana-private-access-proof-`));
        await rm(storageRoot, { recursive: true, force: true });
      } finally {
        activeRoot = "";
        delete process.env.LOCAL_STORAGE_ROOT;
        delete process.env.LOCAL_STORAGE_SECRET;
        await db.$disconnect();
      }
    }
  }
  try {
    await createSide(a);
    await createSide(b);
    return { db, a, b, storageRoot, pdf, close };
  } catch (error) {
    await close();
    throw error;
  }
}

export async function putBytes(uploadUrl: string, bytes = pdf, contentType = "application/pdf") {
  assert.ok(activeRoot, "An isolated fixture must be active before Storage writes");
  const url = new URL(uploadUrl);
  assert.equal(url.origin === "http://127.0.0.1:3179" && url.pathname === "/api/local-storage", true);
  const response = await PUT(new Request(uploadUrl, {
    method: "PUT", headers: { "content-type": contentType }, body: new Uint8Array(bytes),
  }));
  assert.equal(response.status, 201, "Real local signed upload must succeed");
}

export async function assertAssetBytes(asset: { objectPath: string }, bytes = pdf) {
  assert.ok(activeRoot, "An isolated fixture must be active before Storage reads");
  const actual = await readFile(resolveLocalStorageObject(activeRoot, asset.objectPath));
  assert.deepEqual(new Uint8Array(actual), bytes);
}
