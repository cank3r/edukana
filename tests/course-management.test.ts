import assert from "node:assert/strict";
import test from "node:test";
import { resolveEffectiveCapabilities, type Capability } from "../src/lib/capabilities";
import type { CourseScope } from "../src/lib/course-scope";
import { canOperateCourse, courseListWhere, courseStatusLabel, type CourseActor } from "../src/server/courses/course";

const actor = (role: CourseActor["role"], id = role.toLowerCase(), capabilities = resolveEffectiveCapabilities(role)): CourseActor => ({
  id,
  institutionId: "institution-a",
  role,
  capabilities,
});
const all: CourseScope = { kind: "all" };
const teacher: CourseScope = { kind: "teacher", teacherId: "teacher-a" };

test("administración y coordinación separan crear, editar, publicar y archivar", () => {
  for (const role of ["SUPER_ADMIN", "ADMIN", "COORDINATOR"] as const) {
    const current = actor(role);
    assert.equal(canOperateCourse(current, all, "create"), true);
    assert.equal(canOperateCourse(current, all, "edit"), true);
    assert.equal(canOperateCourse(current, all, "publish"), true);
    assert.equal(canOperateCourse(current, all, "archive"), true);
  }
});

test("docente solo edita su curso y nunca publica, archiva ni crea", () => {
  const current = actor("TEACHER", "teacher-a");
  assert.equal(canOperateCourse(current, teacher, "edit"), true);
  assert.equal(canOperateCourse(current, { kind: "teacher", teacherId: "teacher-b" }, "edit"), false);
  assert.equal(canOperateCourse(current, teacher, "create"), false);
  assert.equal(canOperateCourse(current, teacher, "publish"), false);
  assert.equal(canOperateCourse(current, teacher, "archive"), false);

  const forged = actor("TEACHER", "teacher-a", new Set<Capability>(["course.create", "course.edit", "course.publish", "course.archive"]));
  assert.equal(canOperateCourse(forged, all, "create"), false);
  assert.equal(canOperateCourse(forged, all, "publish"), false);
  assert.equal(canOperateCourse(forged, all, "archive"), false);
});

test("estudiante y tutor no obtienen operaciones de escritura", () => {
  for (const role of ["STUDENT", "PARENT"] as const) {
    const current = actor(role);
    for (const operation of ["create", "edit", "publish", "archive"] as const) {
      assert.equal(canOperateCourse(current, all, operation), false);
    }
  }
});

test("lista estudiantil exige institución, matrícula, publicación y curso activo", () => {
  assert.deepEqual(courseListWhere("institution-a", { kind: "student", studentId: "student-a" }), {
    institutionId: "institution-a",
    enrollments: { some: { studentId: "student-a", status: { in: ["ACTIVE", "COMPLETED"] } } },
    isPublished: true,
    archivedAt: null,
  });
});

test("personal separa cursos activos y archivados", () => {
  assert.deepEqual(courseListWhere("institution-a", all), { institutionId: "institution-a", archivedAt: null });
  assert.deepEqual(courseListWhere("institution-a", all, { archived: true }), {
    institutionId: "institution-a",
    archivedAt: { not: null },
  });
});

test("etiqueta de estado prioriza archivado sobre publicación", () => {
  assert.equal(courseStatusLabel({ isPublished: true, archivedAt: new Date("2026-10-09T00:00:00Z") }), "Archivado");
  assert.equal(courseStatusLabel({ isPublished: true, archivedAt: null }), "Publicado");
  assert.equal(courseStatusLabel({ isPublished: false, archivedAt: null }), "Borrador");
});
