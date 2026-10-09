import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { getCommunityAnnouncementWhere } from "@/lib/announcement-data";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { courseWhereForScope, resolveCourseReadScope, resolveCourseWriteScope } from "@/lib/course-scope";
import { db } from "@/lib/db";
import type { EdukanaRole } from "@/types/next-auth";
import { A, B, ensureSeed } from "./setup";

before(ensureSeed);
after(async () => {
  await db.roleCapabilityOverride.deleteMany({ where: { id: "it_override_a_teacher" } });
  await db.$disconnect();
});

async function readableCourseIds(actor: { id: string; institutionId: string; role: EdukanaRole }) {
  const capabilities = await getEffectiveCapabilities(actor.institutionId, actor.role);
  const where = courseWhereForScope(actor.institutionId, resolveCourseReadScope(actor, capabilities));
  if (!where) return [];
  return (await db.course.findMany({ where, select: { id: true }, orderBy: { id: "asc" } })).map((course) => course.id);
}

test("la semilla crea dos instituciones con la misma forma", async () => {
  const counts = await db.user.groupBy({ by: ["institutionId"], _count: true, orderBy: { institutionId: "asc" } });
  assert.deepEqual(counts.map((row) => [row.institutionId, row._count]), [[A.institutionId, 8], [B.institutionId, 8]]);
});

test("docente: solo lee sus cursos de su institución", async () => {
  assert.deepEqual(await readableCourseIds(A.teacher), [A.courseId]);
  assert.deepEqual(await readableCourseIds(B.teacher), [B.courseId]);
});

test("estudiante: solo lee cursos con matrícula; sin matrícula no lee ninguno", async () => {
  assert.deepEqual(await readableCourseIds(A.student), [A.courseId]);
  assert.deepEqual(await readableCourseIds(A.student2), []);
});

test("tutor: nunca obtiene alcance directo de cursos", async () => {
  assert.deepEqual(await readableCourseIds(A.parent), []);
});

test("administración: lee todos los cursos de su institución y ninguno de la otra", async () => {
  assert.deepEqual(await readableCourseIds(A.admin), [A.courseId, A.course2Id]);
  assert.deepEqual(await readableCourseIds(B.admin), [B.courseId, B.course2Id]);
});

test("ID de otra institución: el alcance propio no encuentra el curso ajeno", async () => {
  const capabilities = await getEffectiveCapabilities(A.admin.institutionId, A.admin.role);
  const where = courseWhereForScope(A.institutionId, resolveCourseReadScope(A.admin, capabilities));
  assert.ok(where);
  assert.equal(await db.course.findFirst({ where: { id: B.courseId, ...where }, select: { id: true } }), null);
});

test("ID de otro usuario: un docente no obtiene alcance de escritura sobre el curso de un colega", async () => {
  const capabilities = await getEffectiveCapabilities(A.teacher.institutionId, A.teacher.role);
  const where = courseWhereForScope(A.institutionId, resolveCourseWriteScope(A.teacher, capabilities));
  assert.ok(where);
  assert.equal(await db.course.findFirst({ where: { id: A.course2Id, ...where }, select: { id: true } }), null);
  assert.ok(await db.course.findFirst({ where: { id: A.courseId, ...where }, select: { id: true } }));
});

test("sin permiso: retirar course.manage a docentes de A les quita escritura y no afecta a B", async () => {
  await db.roleCapabilityOverride.create({
    data: {
      id: "it_override_a_teacher",
      institutionId: A.institutionId,
      role: "TEACHER",
      capability: "course.manage",
      enabled: false,
      updatedById: A.admin.id,
    },
  });
  const inA = await getEffectiveCapabilities(A.institutionId, "TEACHER");
  const inB = await getEffectiveCapabilities(B.institutionId, "TEACHER");
  assert.equal(inA.has("course.manage"), false);
  assert.equal(inB.has("course.manage"), true);
  assert.equal(courseWhereForScope(A.institutionId, resolveCourseWriteScope(A.teacher, inA)), null);
});

test("avisos: el estudiante ve el aviso de su curso y nunca el de la otra institución", async () => {
  const where = await getCommunityAnnouncementWhere(A.student, { canManage: false, canPublish: false });
  const visible = (await db.announcement.findMany({ where, select: { id: true } })).map((item) => item.id);
  assert.deepEqual(visible, [A.announcementId]);
});

test("avisos: un estudiante sin matrícula no recibe el aviso dirigido al curso", async () => {
  const where = await getCommunityAnnouncementWhere(A.student2, { canManage: false, canPublish: false });
  assert.equal(await db.announcement.count({ where }), 0);
});

test("avisos: el tutor lo recibe por su vínculo activo y deja de recibirlo al revocarlo", async () => {
  const whereWhileActive = await getCommunityAnnouncementWhere(A.parent, { canManage: false, canPublish: false });
  assert.equal(await db.announcement.count({ where: whereWhileActive }), 1);
  await db.guardianship.update({ where: { id: A.guardianshipId }, data: { status: "REVOKED", revokedAt: new Date() } });
  try {
    const afterRevoke = await getCommunityAnnouncementWhere(A.parent, { canManage: false, canPublish: false });
    assert.equal(await db.announcement.count({ where: afterRevoke }), 0);
  } finally {
    await db.guardianship.update({ where: { id: A.guardianshipId }, data: { status: "ACTIVE", revokedAt: null } });
  }
});
