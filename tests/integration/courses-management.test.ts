import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { resolveEffectiveCapabilities } from "@/lib/capabilities";
import type { CourseScope } from "@/lib/course-scope";
import {
  archiveCourse,
  courseListWhere,
  createCourse,
  restoreCourse,
  setCoursePublished,
  updateCourse,
  type CourseActor,
} from "@/server/courses/course";
import { A, B, ensureSeed } from "./setup";

const all: CourseScope = { kind: "all" };
const teacherScope = (teacherId: string): CourseScope => ({ kind: "teacher", teacherId });
const asActor = (value: { id: string; institutionId: string; role: CourseActor["role"] }): CourseActor => ({
  ...value,
  capabilities: resolveEffectiveCapabilities(value.role),
});
const input = (over: Record<string, string> = {}) => ({
  name: "Curso limpio M2",
  description: "Recorrido de prueba",
  teacherId: A.teacher.id,
  periodId: "a_period",
  code: "",
  maxStudents: "",
  ...over,
});
const auditActions = ["COURSE_CREATED", "COURSE_UPDATED", "COURSE_PUBLISHED", "COURSE_UNPUBLISHED", "COURSE_ARCHIVED", "COURSE_RESTORED"];
let snapshotB = "";

before(async () => {
  await ensureSeed();
  snapshotB = JSON.stringify(await db.course.findMany({ where: { institutionId: B.institutionId }, orderBy: { id: "asc" } }));
});

after(async () => {
  await db.enrollment.deleteMany({ where: { id: "clean_enrollment", institutionId: A.institutionId } });
  await db.course.deleteMany({ where: { institutionId: A.institutionId, name: { startsWith: "Curso limpio M2" } } });
  await db.auditLog.deleteMany({ where: { institutionId: A.institutionId, action: { in: auditActions } } });
  await db.$disconnect();
});

test("administración crea un borrador tenant-safe y docente no puede crear", async () => {
  const admin = asActor(A.admin);
  const created = await createCourse(admin, all, input({ code: "clean-101", maxStudents: "24" }));
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const course = await db.course.findUniqueOrThrow({ where: { id: created.courseId } });
  assert.equal(course.institutionId, A.institutionId);
  assert.equal(course.isPublished, false);
  assert.equal(course.archivedAt, null);
  assert.equal(course.code, "CLEAN-101");
  assert.equal(course.maxStudents, 24);

  const teacherCreated = await createCourse(asActor(A.teacher), teacherScope(A.teacher.id), input({ name: "Curso limpio M2 docente" }));
  assert.equal(teacherCreated.ok, false);
});

test("docente edita solo su curso y no puede publicar ni archivar", async () => {
  const admin = asActor(A.admin);
  const created = await createCourse(admin, all, input({ name: "Curso limpio M2 editable" }));
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const teacher = asActor(A.teacher);
  const edited = await updateCourse(teacher, teacherScope(A.teacher.id), created.courseId, input({ name: "Curso limpio M2 editado" }));
  assert.equal(edited.ok, true);
  assert.equal((await setCoursePublished(teacher, teacherScope(A.teacher.id), created.courseId, true)).ok, false);
  assert.equal((await archiveCourse(teacher, teacherScope(A.teacher.id), created.courseId)).ok, false);
  assert.equal((await updateCourse(asActor(B.admin), all, created.courseId, { ...input(), teacherId: B.teacher.id, periodId: "b_period" })).ok, false);
});

test("publicar controla visibilidad y restaurar siempre vuelve a borrador", async () => {
  const admin = asActor(A.admin);
  const created = await createCourse(admin, all, input({ name: "Curso limpio M2 estados" }));
  assert.equal(created.ok, true);
  if (!created.ok) return;
  await db.enrollment.create({
    data: { id: "clean_enrollment", institutionId: A.institutionId, studentId: A.student2.id, courseId: created.courseId },
  });

  const visible = async () => db.course.count({
    where: { id: created.courseId, ...courseListWhere(A.institutionId, { kind: "student", studentId: A.student2.id })! },
  });
  assert.equal(await visible(), 0);
  assert.equal((await setCoursePublished(admin, all, created.courseId, true)).ok, true);
  assert.equal(await visible(), 1);
  assert.equal((await archiveCourse(admin, all, created.courseId)).ok, true);
  assert.equal(await visible(), 0);
  assert.equal((await updateCourse(admin, all, created.courseId, input({ name: "Curso limpio M2 no debe cambiar" }))).ok, false);
  assert.equal((await restoreCourse(admin, all, created.courseId)).ok, true);

  const restored = await db.course.findUniqueOrThrow({ where: { id: created.courseId } });
  assert.equal(restored.archivedAt, null);
  assert.equal(restored.isPublished, false);
  assert.equal(await visible(), 0);
  await db.enrollment.delete({ where: { id: "clean_enrollment" } });
});

test("ningún curso de la institución B cambia", async () => {
  const afterB = JSON.stringify(await db.course.findMany({ where: { institutionId: B.institutionId }, orderBy: { id: "asc" } }));
  assert.equal(afterB, snapshotB);
  assert.equal(await db.auditLog.count({ where: { institutionId: B.institutionId, action: { in: auditActions } } }), 0);
});
