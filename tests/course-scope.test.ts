import assert from "node:assert/strict";
import test from "node:test";
import type { Capability } from "../src/lib/capabilities";
import { canManageCourse, courseWhereForParticipation, courseWhereForScope, resolveCourseReadScope, resolveCourseWriteScope } from "../src/lib/course-scope";

const caps = (...values: Capability[]) => new Set(values);

test("COORDINATOR requiere course.view.all para ampliar su alcance", () => {
  assert.deepEqual(resolveCourseReadScope({ id: "coord-1", role: "COORDINATOR" }, caps("course.view")), { kind: "none" });
  assert.deepEqual(resolveCourseReadScope({ id: "coord-1", role: "COORDINATOR" }, caps("course.view", "course.view.all")), { kind: "all" });
  assert.deepEqual(resolveCourseWriteScope({ id: "coord-1", role: "COORDINATOR" }, caps("course.manage")), { kind: "none" });
  assert.deepEqual(resolveCourseWriteScope({ id: "coord-1", role: "COORDINATOR" }, caps("course.view", "course.manage", "course.view.all")), { kind: "all" });
});

test("TEACHER puede leer todos al recibir view.all pero solo gestiona sus cursos", () => {
  const own = resolveCourseReadScope({ id: "teacher-1", role: "TEACHER" }, caps("course.view"));
  const all = resolveCourseReadScope({ id: "teacher-1", role: "TEACHER" }, caps("course.view", "course.view.all"));
  const write = resolveCourseWriteScope({ id: "teacher-1", role: "TEACHER" }, caps("course.view", "course.manage", "course.view.all"));
  assert.deepEqual(own, { kind: "teacher", teacherId: "teacher-1" });
  assert.deepEqual(all, { kind: "all" });
  assert.deepEqual(write, { kind: "teacher", teacherId: "teacher-1" });
  assert.equal(canManageCourse(write, "teacher-1"), true);
  assert.equal(canManageCourse(write, "teacher-2"), false);
});

test("STUDENT siempre queda limitado a sus matrículas y PARENT queda denegado", () => {
  const student = resolveCourseReadScope({ id: "student-1", role: "STUDENT" }, caps("course.view", "course.view.all"));
  assert.deepEqual(student, { kind: "student", studentId: "student-1" });
  assert.deepEqual(resolveCourseWriteScope({ id: "student-1", role: "STUDENT" }, caps("course.manage", "course.view.all")), { kind: "none" });
  assert.deepEqual(resolveCourseReadScope({ id: "parent-1", role: "PARENT" }, caps("course.view", "course.view.all")), { kind: "none" });
});

test("todos los filtros reutilizables fijan institutionId", () => {
  assert.deepEqual(courseWhereForScope("tenant-a", { kind: "all" }), { institutionId: "tenant-a" });
  assert.deepEqual(courseWhereForScope("tenant-b", { kind: "teacher", teacherId: "teacher-1" }), { institutionId: "tenant-b", teacherId: "teacher-1" });
  assert.deepEqual(courseWhereForScope("tenant-a", { kind: "student", studentId: "student-1" }), {
    institutionId: "tenant-a",
    enrollments: { some: { studentId: "student-1", status: { in: ["ACTIVE", "COMPLETED"] } } },
  });
  assert.equal(courseWhereForScope("tenant-a", { kind: "none" }), null);
});



test("la participación exige STUDENT activo y no se deriva de permisos de lectura", () => {
  assert.deepEqual(courseWhereForParticipation("tenant-a", { id: "student-1", role: "STUDENT" }, caps("course.participate")), {
    institutionId: "tenant-a",
    enrollments: { some: { studentId: "student-1", status: "ACTIVE" } },
  });
  assert.equal(courseWhereForParticipation("tenant-a", { id: "admin-1", role: "ADMIN" }, caps("course.participate")), null);
  assert.equal(courseWhereForParticipation("tenant-a", { id: "student-1", role: "STUDENT" }, caps("course.view", "course.view.all")), null);
});
