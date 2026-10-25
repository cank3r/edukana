import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import type { CourseScope } from "@/lib/course-scope";
import { archiveCourse, courseListWhere, createCourse, deleteCourseIfEmpty, restoreCourse, setCoursePublished, updateCourse } from "@/server/courses/course";
import { A, B, ensureSeed } from "./setup";

const ALL: CourseScope = { kind: "all" };
const teacherScope = (teacherId: string): CourseScope => ({ kind: "teacher", teacherId });
const studentScope = (studentId: string): CourseScope => ({ kind: "student", studentId });
const AUDITED = ["COURSE_CREATED", "COURSE_UPDATED", "COURSE_PUBLISHED", "COURSE_UNPUBLISHED", "COURSE_ARCHIVED", "COURSE_RESTORED", "COURSE_DELETED"];
const input = (over: Record<string, string> = {}) => ({ name: "Curso de prueba M2", description: "Descripción", teacherId: A.teacher.id, periodId: "a_period", code: "", maxStudents: "", ...over });

let snapshotB = "";
const snapshotOfB = async () => JSON.stringify(await db.course.findMany({ where: { institutionId: B.institutionId }, orderBy: { id: "asc" } }));
const visibleToStudent = async (studentId: string, institutionId: string) =>
  (await db.course.findMany({ where: courseListWhere(institutionId, studentScope(studentId))!, select: { id: true } })).map((course) => course.id);

before(async () => {
  await ensureSeed();
  snapshotB = await snapshotOfB();
});
after(async () => {
  await db.course.deleteMany({ where: { name: { startsWith: "Curso de prueba M2" } } });
  await db.course.updateMany({ where: { id: { in: [A.courseId, A.course2Id] } }, data: { isPublished: true, archivedAt: null } });
  await db.auditLog.deleteMany({ where: { action: { in: AUDITED } } });
  await db.$disconnect();
});

test("crear: nace como borrador en la institución de quien actúa, con auditoría", async () => {
  const result = await createCourse(A.admin, ALL, input({ code: "m2-101", maxStudents: "25" }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const course = await db.course.findUniqueOrThrow({ where: { id: result.courseId } });
  assert.equal(course.institutionId, A.institutionId);
  assert.equal(course.isPublished, false);
  assert.equal(course.archivedAt, null);
  assert.equal(course.code, "M2-101");
  assert.equal(course.maxStudents, 25);
  assert.equal(course.teacherId, A.teacher.id);
  assert.equal(await db.auditLog.count({ where: { action: "COURSE_CREATED", entityId: course.id, institutionId: A.institutionId } }), 1);
});

test("crear: sin código ni cupo también funciona y valida el nombre", async () => {
  const ok = await createCourse(A.admin, ALL, input({ name: "Curso de prueba M2 sin código" }));
  assert.equal(ok.ok, true);
  if (ok.ok) {
    const course = await db.course.findUniqueOrThrow({ where: { id: ok.courseId } });
    assert.equal(course.code, null);
    assert.equal(course.maxStudents, null);
  }
  assert.equal((await createCourse(A.admin, ALL, input({ name: "x" }))).ok, false);
  assert.equal((await createCourse(A.admin, ALL, input({ maxStudents: "0" }))).ok, false);
  const duplicated = await createCourse(A.admin, ALL, input({ code: "M2-101" }));
  assert.equal(duplicated.ok, false);
  if (!duplicated.ok) assert.match(duplicated.message, /código/);
});

test("crear: se rechaza un docente o un período de otra institución, y a quien no es docente", async () => {
  const total = await db.course.count();
  assert.equal((await createCourse(A.admin, ALL, input({ teacherId: B.teacher.id }))).ok, false);
  assert.equal((await createCourse(A.admin, ALL, input({ periodId: "b_period" }))).ok, false);
  assert.equal((await createCourse(A.admin, ALL, input({ teacherId: A.student.id }))).ok, false);
  assert.equal((await createCourse(A.student, studentScope(A.student.id), input())).ok, false);
  assert.equal((await createCourse(A.student, { kind: "none" }, input())).ok, false);
  assert.equal(await db.course.count(), total);
});

test("crear: un docente crea cursos propios aunque pida otro docente", async () => {
  const result = await createCourse(A.teacher2, teacherScope(A.teacher2.id), input({ name: "Curso de prueba M2 del docente 2", teacherId: A.teacher.id }));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal((await db.course.findUniqueOrThrow({ where: { id: result.courseId } })).teacherId, A.teacher2.id);
});

test("editar: corrige los datos en A; no alcanza cursos de B ni de otro docente", async () => {
  const created = await createCourse(A.admin, ALL, input({ name: "Curso de prueba M2 para editar" }));
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const edited = await updateCourse(A.admin, ALL, created.courseId, input({ name: "Curso de prueba M2 editado", teacherId: A.teacher2.id, code: "m2-edit", maxStudents: "40" }));
  assert.equal(edited.ok, true);
  const course = await db.course.findUniqueOrThrow({ where: { id: created.courseId } });
  assert.equal(course.name, "Curso de prueba M2 editado");
  assert.equal(course.teacherId, A.teacher2.id);
  assert.equal(course.code, "M2-EDIT");
  assert.equal(course.maxStudents, 40);
  assert.equal(await db.auditLog.count({ where: { action: "COURSE_UPDATED", entityId: course.id } }), 1);

  assert.equal((await updateCourse(A.admin, ALL, created.courseId, input({ teacherId: B.teacher.id }))).ok, false);
  assert.equal((await updateCourse(A.admin, ALL, B.courseId, input())).ok, false);
  assert.equal((await updateCourse(B.admin, ALL, created.courseId, { ...input(), teacherId: B.teacher.id, periodId: "b_period" })).ok, false);
  // El curso ahora es del docente 2: el docente 1 ya no lo gestiona.
  assert.equal((await updateCourse(A.teacher, teacherScope(A.teacher.id), created.courseId, input())).ok, false);
  assert.equal((await db.course.findUniqueOrThrow({ where: { id: created.courseId } })).name, "Curso de prueba M2 editado");
});

test("publicar y pasar a borrador: el estudiante inscrito solo ve el curso publicado", async () => {
  assert.ok((await visibleToStudent(A.student.id, A.institutionId)).includes(A.courseId));
  assert.equal((await setCoursePublished(A.teacher, teacherScope(A.teacher.id), A.courseId, false)).ok, true);
  assert.ok(!(await visibleToStudent(A.student.id, A.institutionId)).includes(A.courseId));
  assert.equal((await setCoursePublished(A.teacher, teacherScope(A.teacher.id), A.courseId, true)).ok, true);
  assert.ok((await visibleToStudent(A.student.id, A.institutionId)).includes(A.courseId));
  // Otro docente y otra institución no pueden.
  assert.equal((await setCoursePublished(A.teacher2, teacherScope(A.teacher2.id), A.courseId, false)).ok, false);
  assert.equal((await setCoursePublished(B.admin, ALL, A.courseId, false)).ok, false);
  assert.equal((await db.course.findUniqueOrThrow({ where: { id: A.courseId } })).isPublished, true);
});

test("archivar oculta el curso al estudiante y a la lista de activos; restaurar lo devuelve", async () => {
  const staff = async (archived: boolean) => (await db.course.findMany({ where: courseListWhere(A.institutionId, ALL, { archived })!, select: { id: true } })).map((course) => course.id);
  assert.equal((await archiveCourse(A.admin, ALL, A.courseId)).ok, true);
  assert.ok(!(await visibleToStudent(A.student.id, A.institutionId)).includes(A.courseId));
  assert.ok(!(await staff(false)).includes(A.courseId));
  assert.ok((await staff(true)).includes(A.courseId));
  // No se borró nada.
  assert.equal(await db.enrollment.count({ where: { id: "a_enrollment" } }), 1);

  assert.equal((await restoreCourse(A.admin, ALL, A.courseId)).ok, true);
  assert.ok((await visibleToStudent(A.student.id, A.institutionId)).includes(A.courseId));
  assert.ok((await staff(false)).includes(A.courseId));
  assert.equal(await db.auditLog.count({ where: { action: { in: ["COURSE_ARCHIVED", "COURSE_RESTORED"] }, entityId: A.courseId } }), 2);

  assert.equal((await archiveCourse(A.admin, ALL, B.courseId)).ok, false);
  assert.equal((await db.course.findUniqueOrThrow({ where: { id: B.courseId } })).archivedAt, null);
});

test("borrar: se rechaza con inscripciones y explica que se archive; un curso vacío sí se borra", async () => {
  const rejected = await deleteCourseIfEmpty(A.admin, ALL, A.courseId);
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.match(rejected.message, /Archívalo/);
  assert.equal(await db.course.count({ where: { id: A.courseId } }), 1);

  const created = await createCourse(A.admin, ALL, input({ name: "Curso de prueba M2 para borrar" }));
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal((await deleteCourseIfEmpty(B.admin, ALL, created.courseId)).ok, false);
  assert.equal((await deleteCourseIfEmpty(A.teacher2, teacherScope(A.teacher2.id), created.courseId)).ok, false);
  assert.equal(await db.course.count({ where: { id: created.courseId } }), 1);
  assert.equal((await deleteCourseIfEmpty(A.admin, ALL, created.courseId)).ok, true);
  assert.equal(await db.course.count({ where: { id: created.courseId } }), 0);
  assert.equal(await db.auditLog.count({ where: { action: "COURSE_DELETED", entityId: created.courseId, institutionId: A.institutionId } }), 1);
});

test("nada de la institución B cambió", async () => {
  assert.equal(await snapshotOfB(), snapshotB);
  assert.equal(await db.auditLog.count({ where: { action: { in: AUDITED }, institutionId: B.institutionId } }), 0);
});
