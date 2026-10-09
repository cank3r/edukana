import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import {
  enrollGroup,
  enrollStudents,
  getStudentProgress,
  isFallingBehind,
  listCourseStudents,
  reinstateStudent,
  searchEnrollableStudents,
  withdrawStudent,
} from "@/server/courses/enrollment";
import { A, B, ensureSeed } from "./setup";

const S = ["ce_s1", "ce_s2", "ce_s3", "ce_s4"];
const [s1, s2, s3, s4] = S;
const GROUP = "ce_group";
const AUDITED = ["COURSE_STUDENTS_ENROLLED", "COURSE_GROUP_ENROLLED", "COURSE_STUDENT_WITHDRAWN", "COURSE_STUDENT_REINSTATED"];
const activeIn = (courseId: string) => db.enrollment.count({ where: { courseId, status: "ACTIVE" } });
const enrollmentOf = (studentId: string, courseId = A.courseId) => db.enrollment.findUniqueOrThrow({ where: { studentId_courseId: { studentId, courseId } } });

async function cleanup() {
  await db.auditLog.deleteMany({ where: { action: { in: AUDITED } } });
  await db.assignment.deleteMany({ where: { id: "ce_assignment" } });
  await db.courseSection.deleteMany({ where: { id: "ce_section" } });
  await db.enrollment.deleteMany({ where: { studentId: { in: S } } });
  await db.studentGroup.deleteMany({ where: { id: GROUP } });
  await db.user.deleteMany({ where: { id: { in: S } } });
  await db.course.updateMany({ where: { id: { in: [A.courseId, A.course2Id] } }, data: { maxStudents: null } });
  await db.enrollment.update({ where: { id: "a_enrollment" }, data: { status: "ACTIVE", withdrawnAt: null, withdrawReason: null } });
}

before(async () => {
  await ensureSeed();
  await cleanup();
  await db.user.createMany({
    data: S.map((id, index) => ({ id, institutionId: A.institutionId, name: `Prueba Inscrita ${index + 1}`, email: `${id}@a.test`, role: "STUDENT" as const, status: "ACTIVE" as const })),
  });
  await db.studentGroup.create({
    data: {
      id: GROUP,
      institutionId: A.institutionId,
      name: "Grupo de prueba de inscripción",
      startsOn: new Date("2026-01-01"),
      members: { create: [s1, s2, "a_suspended"].map((userId) => ({ institutionId: A.institutionId, userId })) },
    },
  });
});
after(async () => {
  await cleanup();
  await db.$disconnect();
});

test("inscribir varios: crea las inscripciones y repetirlo no duplica", async () => {
  assert.deepEqual(await enrollStudents(A.teacher, A.courseId, [s1, s2, s1]), { ok: true, enrolled: 2, reinstated: 0, already: 0, skipped: 0 });
  assert.equal(await activeIn(A.courseId), 3);
  assert.equal((await enrollmentOf(s1)).institutionId, A.institutionId);
  assert.equal(await db.auditLog.count({ where: { action: "COURSE_STUDENTS_ENROLLED", entityId: A.courseId } }), 1, "una fila por operación");

  assert.deepEqual(await enrollStudents(A.admin, A.courseId, [s1, s2, A.student.id]), { ok: true, enrolled: 0, reinstated: 0, already: 3, skipped: 0 });
  assert.equal(await db.enrollment.count({ where: { courseId: A.courseId } }), 3);
  assert.equal((await enrollStudents(A.teacher, A.courseId, [])).ok, false);

  const candidates = await searchEnrollableStudents(A.teacher, A.courseId, "Prueba Inscrita");
  assert.deepEqual(candidates?.students.map((student) => student.id), [s3, s4], "solo quienes no están en el curso");
});

test("cupo: si no caben todos no inscribe a nadie, y dos operaciones simultáneas no lo superan", async () => {
  await db.course.update({ where: { id: A.courseId }, data: { maxStudents: 4 } });
  const tooMany = await enrollStudents(A.teacher, A.courseId, [s3, s4]);
  assert.equal(tooMany.ok, false);
  assert.match(tooMany.ok ? "" : tooMany.message, /solo queda 1 cupo/);
  assert.equal(await activeIn(A.courseId), 3);

  const results = await Promise.all([enrollStudents(A.teacher, A.courseId, [s3]), enrollStudents(A.admin, A.courseId, [s4])]);
  assert.equal(results.filter((result) => result.ok).length, 1, "solo una de las dos entra");
  assert.equal(await activeIn(A.courseId), 4);
  assert.equal(await db.enrollment.count({ where: { courseId: A.courseId } }), 4);
});

test("retirar conserva entregas y avance; reincorporar restaura", async () => {
  const enrollment = await enrollmentOf(s1);
  await db.courseSection.create({
    data: {
      id: "ce_section",
      institutionId: A.institutionId,
      courseId: A.courseId,
      title: "Capítulo de prueba",
      order: 900,
      isPublished: true,
      lessons: { create: { id: "ce_lesson", institutionId: A.institutionId, courseId: A.courseId, title: "Lección de prueba", order: 0, isPublished: true } },
    },
  });
  await db.lessonProgress.create({ data: { institutionId: A.institutionId, enrollmentId: enrollment.id, lessonId: "ce_lesson", completed: true, completedAt: new Date() } });
  await db.assignment.create({
    data: {
      id: "ce_assignment",
      institutionId: A.institutionId,
      courseId: A.courseId,
      title: "Tarea de prueba",
      isPublished: true,
      submissions: { create: { institutionId: A.institutionId, studentId: s1, enrollmentId: enrollment.id, content: "Mi entrega", status: "GRADED", score: 90 } },
    },
  });

  const list = await listCourseStudents(A.teacher, A.courseId);
  assert.ok(list);
  assert.equal(list.publishedLessons, 1);
  assert.equal(list.publishedAssignments, 1);
  assert.equal(list.activeCount, 4);
  const row = list.students.find((student) => student.studentId === s1);
  assert.ok(row);
  assert.deepEqual([row.progressPercent, row.lessonsCompleted, row.assignmentsSubmitted, row.fallingBehind], [100, 1, 1, false]);
  assert.ok(row.lastActivityAt);
  const idle = list.students.find((student) => student.studentId === s2);
  assert.deepEqual([idle?.progressPercent, idle?.lastActivityAt, idle?.fallingBehind], [0, null, true], "avance menor que la mitad del promedio");

  assert.equal((await withdrawStudent(A.teacher, A.courseId, enrollment.id, "   ")).ok, false, "el motivo es obligatorio");
  assert.deepEqual(await withdrawStudent(A.teacher, A.courseId, enrollment.id, " Cambio de horario "), { ok: true });
  const dropped = await enrollmentOf(s1);
  assert.equal(dropped.status, "DROPPED");
  assert.equal(dropped.withdrawReason, "Cambio de horario");
  assert.ok(dropped.withdrawnAt);
  assert.equal(await db.submission.count({ where: { enrollmentId: enrollment.id } }), 1);
  assert.equal(await db.lessonProgress.count({ where: { enrollmentId: enrollment.id } }), 1);
  assert.equal(await activeIn(A.courseId), 3, "el retiro libera el cupo");
  const afterDrop = await listCourseStudents(A.teacher, A.courseId);
  assert.equal(afterDrop?.withdrawn[0]?.withdrawReason, "Cambio de horario");
  assert.ok(!afterDrop?.students.some((student) => student.studentId === s1));

  const detail = await getStudentProgress(A.teacher, A.courseId, enrollment.id);
  assert.ok(detail);
  assert.equal(detail.enrollment.status, "DROPPED");
  assert.equal(detail.chapters[0].lessons[0].completed, true);
  assert.ok(detail.chapters[0].lessons[0].completedAt);
  assert.deepEqual([detail.assignments[0].status, detail.assignments[0].score], ["GRADED", 90]);

  // Volver a inscribirlo lo reincorpora con la misma inscripción y su historial.
  assert.deepEqual(await enrollStudents(A.teacher, A.courseId, [s1]), { ok: true, enrolled: 0, reinstated: 1, already: 0, skipped: 0 });
  const back = await enrollmentOf(s1);
  assert.deepEqual([back.id, back.status, back.withdrawnAt, back.withdrawReason], [enrollment.id, "ACTIVE", null, null]);
  assert.equal(await db.submission.count({ where: { enrollmentId: enrollment.id } }), 1);

  // «Reincorporar» hace lo mismo, y respeta el cupo.
  await withdrawStudent(A.admin, A.courseId, enrollment.id, "Viaje");
  assert.deepEqual(await reinstateStudent(A.teacher, A.courseId, enrollment.id), { ok: true });
  assert.equal((await enrollmentOf(s1)).status, "ACTIVE");
  await withdrawStudent(A.admin, A.courseId, enrollment.id, "Viaje");
  const missing = (await db.enrollment.count({ where: { courseId: A.courseId, studentId: s3 } })) ? s4 : s3;
  assert.equal((await enrollStudents(A.teacher, A.courseId, [missing])).ok, true);
  const full = await reinstateStudent(A.teacher, A.courseId, enrollment.id);
  assert.equal(full.ok, false);
  assert.match(full.ok ? "" : full.message, /lleno/);
  assert.equal((await enrollmentOf(s1)).status, "DROPPED");
  assert.equal(await db.auditLog.count({ where: { action: "COURSE_STUDENT_WITHDRAWN", entityId: enrollment.id } }), 3);
  assert.equal(await db.auditLog.count({ where: { action: "COURSE_STUDENT_REINSTATED", entityId: enrollment.id } }), 1);
});

test("aislamiento: estudiantes, cursos e inscripciones de otra institución se rechazan", async () => {
  await db.course.update({ where: { id: A.courseId }, data: { maxStudents: null } });
  assert.equal((await enrollStudents(A.admin, A.courseId, [B.student.id])).ok, false);
  assert.equal((await enrollStudents(A.admin, A.courseId, [s1, B.student.id])).ok, false, "un id ajeno invalida toda la operación");
  assert.equal((await enrollmentOf(s1)).status, "DROPPED");
  assert.equal(await db.enrollment.count({ where: { courseId: A.courseId, studentId: B.student.id } }), 0);
  assert.equal((await enrollStudents(A.admin, A.courseId, ["a_suspended"])).ok, false, "un estudiante suspendido no se inscribe");
  assert.equal((await enrollStudents(A.admin, A.courseId, [A.teacher.id])).ok, false, "solo estudiantes");

  assert.equal((await enrollStudents(A.admin, B.courseId, [s2])).ok, false);
  assert.equal(await db.enrollment.count({ where: { courseId: B.courseId } }), 1);
  assert.equal((await withdrawStudent(A.admin, A.courseId, "b_enrollment", "x")).ok, false);
  assert.equal((await withdrawStudent(A.admin, B.courseId, "b_enrollment", "x")).ok, false);
  assert.equal((await db.enrollment.findUniqueOrThrow({ where: { id: "b_enrollment" } })).status, "ACTIVE");
  assert.equal(await listCourseStudents(A.admin, B.courseId), null);
  assert.equal(await getStudentProgress(A.admin, A.courseId, "b_enrollment"), null);
  assert.equal((await enrollGroup(B.admin, B.courseId, GROUP)).ok, false, "un grupo de otra institución no existe aquí");
});

test("permiso: un docente ajeno al curso, un estudiante o un tutor no pueden gestionar sus inscritos", async () => {
  const enrollment = await enrollmentOf(s2);
  for (const actor of [A.teacher2, A.student, A.parent]) {
    assert.equal((await enrollStudents(actor, A.courseId, [s1])).ok, false);
    assert.equal((await enrollGroup(actor, A.courseId, GROUP)).ok, false);
    assert.equal((await withdrawStudent(actor, A.courseId, enrollment.id, "x")).ok, false);
    assert.equal((await reinstateStudent(actor, A.courseId, (await enrollmentOf(s1)).id)).ok, false);
    assert.equal(await listCourseStudents(actor, A.courseId), null);
    assert.equal(await searchEnrollableStudents(actor, A.courseId, ""), null);
    assert.equal(await getStudentProgress(actor, A.courseId, enrollment.id), null);
  }
  assert.equal((await enrollmentOf(s2)).status, "ACTIVE");
  assert.equal((await enrollmentOf(s1)).status, "DROPPED");
  // El coordinador gestiona cualquier curso de su institución; el docente, el suyo.
  assert.ok(await listCourseStudents(A.coordinator, A.courseId));
  assert.ok(await listCourseStudents(A.teacher2, A.course2Id));
});

test("inscribir un grupo completo: entran sus estudiantes activos, es idempotente y respeta el cupo", async () => {
  await db.course.update({ where: { id: A.course2Id }, data: { maxStudents: 1 } });
  const noRoom = await enrollGroup(A.teacher2, A.course2Id, GROUP);
  assert.equal(noRoom.ok, false);
  assert.match(noRoom.ok ? "" : noRoom.message, /solo queda 1 cupo/);
  assert.equal(await db.enrollment.count({ where: { courseId: A.course2Id } }), 0);

  await db.course.update({ where: { id: A.course2Id }, data: { maxStudents: null } });
  assert.deepEqual(await enrollGroup(A.teacher2, A.course2Id, GROUP), { ok: true, enrolled: 2, reinstated: 0, already: 0, skipped: 1 });
  assert.deepEqual(await enrollGroup(A.admin, A.course2Id, GROUP), { ok: true, enrolled: 0, reinstated: 0, already: 2, skipped: 1 });
  const enrolled = await db.enrollment.findMany({ where: { courseId: A.course2Id }, orderBy: { studentId: "asc" } });
  assert.deepEqual(enrolled.map((entry) => [entry.studentId, entry.status]), [[s1, "ACTIVE"], [s2, "ACTIVE"]]);
  assert.equal(await db.auditLog.count({ where: { action: "COURSE_GROUP_ENROLLED", entityId: A.course2Id } }), 1);
  assert.equal((await enrollGroup(A.admin, A.course2Id, "no-existe")).ok, false);
});

test("se está quedando atrás: menos de la mitad del promedio con 3 o más inscritos, o 14 días sin actividad", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  const recent = new Date("2026-10-18T12:00:00Z");
  const old = new Date("2026-10-01T12:00:00Z");
  const course = { activeCount: 3, averageProgress: 60 };
  assert.equal(isFallingBehind({ progressPercent: 29, lastActivityAt: recent, enrolledAt: old }, course, now), true);
  assert.equal(isFallingBehind({ progressPercent: 30, lastActivityAt: recent, enrolledAt: old }, course, now), false);
  assert.equal(isFallingBehind({ progressPercent: 0, lastActivityAt: recent, enrolledAt: old }, { activeCount: 2, averageProgress: 60 }, now), false);
  assert.equal(isFallingBehind({ progressPercent: 90, lastActivityAt: old, enrolledAt: old }, course, now), true);
  assert.equal(isFallingBehind({ progressPercent: 90, lastActivityAt: null, enrolledAt: recent }, course, now), false, "recién inscrito");
  assert.equal(isFallingBehind({ progressPercent: 90, lastActivityAt: null, enrolledAt: old }, course, now), true);
});
