import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { getStudentCourses, getStudentHome, safeJoinUrl } from "@/server/student-home";
import { getTeacherHome } from "@/server/teacher-home";
import { A, B, ensureSeed } from "./setup";

const P = "sth_";
const now = new Date();
const minutes = (count: number) => new Date(now.getTime() + count * 60_000);
const days = (count: number) => minutes(count * 24 * 60);

async function cleanUp() {
  const mine = { startsWith: P };
  await db.examAttempt.deleteMany({ where: { id: mine } });
  await db.exam.deleteMany({ where: { id: mine } });
  await db.questionBankItem.deleteMany({ where: { id: mine } });
  await db.liveClass.deleteMany({ where: { id: mine } });
  await db.assignment.deleteMany({ where: { id: mine } });
  await db.courseSection.deleteMany({ where: { id: mine } });
  await db.enrollment.deleteMany({ where: { id: mine } });
  await db.course.deleteMany({ where: { id: mine } });
}

before(async () => {
  await ensureSeed();
  await cleanUp();
  const iid = A.institutionId;
  const course = (id: string, teacherId: string, extra: object) => ({ id: P + id, institutionId: iid, periodId: "a_period", teacherId, name: `Curso ${id}`, code: `STH-${id}`, ...extra });
  await db.course.createMany({
    data: [
      course("arch", A.teacher.id, { archivedAt: now }),
      course("draft", A.teacher.id, { isPublished: false }),
      course("done", A.teacher2.id, {}),
    ],
  });
  await db.enrollment.createMany({
    data: [
      { id: P + "enr_arch", institutionId: iid, studentId: A.student.id, courseId: P + "arch" },
      { id: P + "enr_draft", institutionId: iid, studentId: A.student.id, courseId: P + "draft" },
      { id: P + "enr_done", institutionId: iid, studentId: A.student.id, courseId: P + "done", status: "COMPLETED", finalGrade: 88, progressPercent: 100 },
      { id: P + "enr_s2", institutionId: iid, studentId: A.student2.id, courseId: A.course2Id },
    ],
  });

  await db.courseSection.createMany({
    data: [
      { id: P + "sec", institutionId: iid, courseId: A.courseId, title: "Unidad 1", order: 900, isPublished: true },
      { id: P + "sec_hidden", institutionId: iid, courseId: A.courseId, title: "Unidad oculta", order: 899, isPublished: false },
      { id: P + "sec_arch", institutionId: iid, courseId: P + "arch", title: "Unidad archivada", order: 0, isPublished: true },
    ],
  });
  const lesson = (id: string, sectionId: string, courseId: string, order: number, isPublished: boolean) => ({ id: P + id, institutionId: iid, courseId, sectionId: P + sectionId, title: `Lección ${id}`, order, isPublished });
  await db.lesson.createMany({
    data: [
      lesson("l_hidden_sec", "sec_hidden", A.courseId, 0, true),
      lesson("l1", "sec", A.courseId, 0, true),
      lesson("l2", "sec", A.courseId, 1, false),
      lesson("l3", "sec", A.courseId, 2, true),
      lesson("l_arch", "sec_arch", P + "arch", 0, true),
    ],
  });
  await db.lessonProgress.create({ data: { institutionId: iid, enrollmentId: "a_enrollment", lessonId: P + "l1", completed: true, completedAt: now } });

  const task = (id: string, courseId: string, extra: object) => ({ id: P + id, institutionId: iid, courseId, title: `Tarea ${id}`, isPublished: true, dueDate: days(2), ...extra });
  await db.assignment.createMany({
    data: [
      task("t_future", A.courseId, {}),
      task("t_overdue", A.courseId, { dueDate: days(-1) }),
      task("t_done", A.courseId, {}),
      task("t_hidden", A.courseId, { isPublished: false }),
      task("t_nodate", A.courseId, { dueDate: null }),
      task("t_other", A.course2Id, {}),
      task("t_arch", P + "arch", {}),
    ],
  });
  await db.submission.createMany({
    data: [
      { id: P + "s_done", institutionId: iid, assignmentId: P + "t_done", studentId: A.student.id, enrollmentId: "a_enrollment", status: "SUBMITTED" },
      { id: P + "s_arch", institutionId: iid, assignmentId: P + "t_arch", studentId: A.student.id, enrollmentId: P + "enr_arch", status: "SUBMITTED" },
      { id: P + "s_other", institutionId: iid, assignmentId: P + "t_other", studentId: A.student2.id, enrollmentId: P + "enr_s2", status: "SUBMITTED" },
    ],
  });

  const live = (id: string, institutionId: string, courseId: string, createdById: string, startsAt: Date, joinUrl = "https://meet.example.com/sala") => ({ id: P + id, institutionId, courseId, createdById, title: `Clase ${id}`, startsAt, durationMinutes: 60, joinUrl });
  await db.liveClass.createMany({
    data: [
      live("c_now", iid, A.courseId, A.teacher.id, minutes(-20)),
      live("c_soon", iid, A.courseId, A.teacher.id, minutes(10)),
      live("c_http", iid, A.courseId, A.teacher.id, minutes(12), "http://meet.example.com/sala"),
      live("c_later", iid, A.courseId, A.teacher.id, days(3)),
      live("c_far", iid, A.courseId, A.teacher.id, days(10)),
      live("c_ended", iid, A.courseId, A.teacher.id, minutes(-180)),
      live("c_other", iid, A.course2Id, A.teacher2.id, minutes(30)),
      live("c_arch", iid, P + "arch", A.teacher.id, minutes(30)),
      live("c_b", B.institutionId, B.courseId, B.teacher.id, minutes(30)),
    ],
  });

  await db.questionBankItem.create({ data: { id: P + "q", institutionId: iid, courseId: A.courseId, type: "TRUE_FALSE", prompt: "¿Sí?", answerKey: "true" } });
  await db.exam.createMany({
    data: [
      { id: P + "x_open", institutionId: iid, courseId: A.courseId, title: "Examen abierto", isPublished: true, closesAt: days(5), maxAttempts: 1 },
      { id: P + "x_closed", institutionId: iid, courseId: A.courseId, title: "Examen cerrado", isPublished: true, closesAt: days(-1) },
      { id: P + "x_hidden", institutionId: iid, courseId: A.courseId, title: "Examen sin publicar", isPublished: false },
    ],
  });
  await db.examQuestion.createMany({
    data: ["x_open", "x_closed", "x_hidden"].map((examId) => ({ institutionId: iid, examId: P + examId, bankItemId: P + "q", order: 0, points: 1 })),
  });
});

after(async () => {
  await cleanUp();
  await db.$disconnect();
});

test("enlace de clase: solo https", () => {
  assert.equal(safeJoinUrl("https://meet.example.com/sala"), "https://meet.example.com/sala");
  assert.equal(safeJoinUrl("http://meet.example.com/sala"), null);
  assert.equal(safeJoinUrl("javascript:alert(1)"), null);
  assert.equal(safeJoinUrl("no es un enlace"), null);
  assert.equal(safeJoinUrl(""), null);
});

test("inicio del estudiante: ve su siguiente lección, sus pendientes y sus clases", async () => {
  const home = await getStudentHome(A.student, now);
  assert.equal(home.notEnrolled, false);
  assert.deepEqual(home.continueLesson, {
    courseId: A.courseId,
    courseName: "course A",
    lessonId: P + "l3",
    lessonTitle: "Lección l3",
    href: `/dashboard/aula/${A.courseId}/leccion/${P}l3`,
  });

  assert.deepEqual(home.pending.map((item) => item.id), [P + "t_overdue", P + "t_future", P + "x_open"]);
  assert.deepEqual(home.pending.map((item) => item.overdue), [true, false, false]);
  assert.equal(home.pending[0].href, `/dashboard/aula/${A.courseId}/tareas/${P}t_overdue`);
  assert.equal(home.pending[2].href, `/dashboard/aula/${A.courseId}/presentar/${P}x_open`);
  assert.equal(home.pending[2].retry, false);

  assert.deepEqual(home.liveClasses.map((item) => item.id), [P + "c_now", P + "c_soon", P + "c_http", P + "c_later"]);
  assert.deepEqual(home.liveClasses.map((item) => item.canJoin), [true, true, false, false]);
  assert.equal(home.liveClasses[2].joinUrl, null, "un enlace que no es https no se ofrece");
  assert.match(home.liveClasses[1].when, /^(Hoy|Mañana), /);
});

test("inicio del estudiante: no aparece nada de otra institución, de cursos sin matrícula, archivados o sin publicar", async () => {
  const home = await getStudentHome(A.student, now);
  assert.deepEqual(home.courses.map((course) => course.courseId), [A.courseId]);
  const everything = JSON.stringify(home);
  for (const hidden of ["c_b", "c_other", "c_arch", "t_other", "t_arch", "l_arch", "arch", "draft", B.courseId, A.course2Id]) {
    assert.ok(!everything.includes(`"${hidden.startsWith("a_") || hidden.startsWith("b_") ? hidden : P + hidden}"`), `${hidden} no debe aparecer`);
  }

  const other = await getStudentHome(B.student, now);
  assert.deepEqual(other.liveClasses.map((item) => item.id), [P + "c_b"]);
  assert.deepEqual(other.courses.map((course) => course.courseId), [B.courseId]);
  assert.equal(other.pending.length, 0);
  assert.equal(other.continueLesson, null);

  // Un id de otra institución en la sesión no abre nada: la matrícula no pertenece a esa institución.
  const crossed = await getStudentHome({ id: A.student.id, institutionId: B.institutionId }, now);
  assert.equal(crossed.notEnrolled, true);
  assert.deepEqual(crossed.courses, []);
});

test("inicio del estudiante: sin matrícula ve el estado vacío; el examen sin intentos deja de estar pendiente", async () => {
  const empty = await getStudentHome(A.student2, now);
  assert.deepEqual(empty.courses.map((course) => course.courseId), [A.course2Id]);
  const nobody = await getStudentHome({ id: A.parent.id, institutionId: A.institutionId }, now);
  assert.equal(nobody.notEnrolled, true);
  assert.equal(nobody.continueLesson, null);

  await db.examAttempt.create({ data: { id: P + "att", institutionId: A.institutionId, examId: P + "x_open", enrollmentId: "a_enrollment", studentId: A.student.id, attemptNumber: 1, status: "GRADED", score: 1, maxScore: 1, submittedAt: now } });
  const home = await getStudentHome(A.student, now);
  assert.ok(!home.pending.some((item) => item.id === P + "x_open"));
  await db.exam.update({ where: { id: P + "x_open" }, data: { maxAttempts: 2 } });
  const again = (await getStudentHome(A.student, now)).pending.find((item) => item.id === P + "x_open");
  assert.equal(again?.retry, true, "con intentos disponibles vuelve a aparecer");
});

test("mis cursos: lista activos y completados con su nota final, sin archivados ni sin publicar", async () => {
  const courses = await getStudentCourses(A.student);
  assert.deepEqual(courses.map((course) => [course.courseId, course.completed, course.finalGrade]), [
    [A.courseId, false, null],
    [P + "done", true, 88],
  ]);
});

test("inicio del docente: ve solo sus cursos, sus entregas por calificar y sus clases", async () => {
  const home = await getTeacherHome(A.teacher, now);
  assert.deepEqual(home.courses.map((course) => course.courseId).sort(), [A.courseId, P + "draft"].sort());
  const own = home.courses.find((course) => course.courseId === A.courseId);
  assert.equal(own?.students, await db.enrollment.count({ where: { courseId: A.courseId, status: { in: ["ACTIVE", "COMPLETED"] } } }));
  assert.equal(home.courses.find((course) => course.courseId === P + "draft")?.isPublished, false);
  assert.deepEqual(home.toGrade.map((course) => [course.courseId, course.toGrade]), [[A.courseId, 1]]);
  assert.equal(home.toGradeTotal, 1);
  assert.deepEqual(home.liveClasses.map((item) => item.id), [P + "c_now", P + "c_soon", P + "c_http", P + "c_later"]);

  const second = await getTeacherHome(A.teacher2, now);
  assert.deepEqual(second.courses.map((course) => course.courseId).sort(), [A.course2Id, P + "done"].sort());
  assert.deepEqual(second.toGrade.map((course) => [course.courseId, course.toGrade]), [[A.course2Id, 1]]);
  assert.equal(second.courses.find((course) => course.courseId === P + "done")?.students, 1, "quien completó el curso sigue contando como estudiante");
  assert.deepEqual(second.liveClasses.map((item) => item.id), [P + "c_other"]);

  const otherInstitution = await getTeacherHome(B.teacher, now);
  assert.deepEqual(otherInstitution.courses.map((course) => course.courseId), [B.courseId]);
  assert.equal(otherInstitution.toGradeTotal, 0);
  assert.deepEqual(otherInstitution.liveClasses.map((item) => item.id), [P + "c_b"]);

  const crossed = await getTeacherHome({ id: A.teacher.id, institutionId: B.institutionId }, now);
  assert.deepEqual(crossed.courses, []);
});

test("inicio del docente: cuenta los exámenes con respuestas cortas por revisar", async () => {
  assert.deepEqual((await getTeacherHome(A.teacher, now)).toReview, []);
  await db.examAttempt.create({
    data: { id: P + "att_review", institutionId: A.institutionId, examId: P + "x_closed", enrollmentId: "a_enrollment", studentId: A.student.id, attemptNumber: 1, status: "SUBMITTED", submittedAt: now },
  });
  try {
    const home = await getTeacherHome(A.teacher, now);
    assert.deepEqual(home.toReview, [{ courseId: A.courseId, courseName: "course A", examId: P + "x_closed", examTitle: "Examen cerrado", attempts: 1 }]);
    assert.deepEqual((await getTeacherHome(A.teacher2, now)).toReview, [], "otro docente no lo ve");
    assert.deepEqual((await getTeacherHome(B.teacher, now)).toReview, [], "otra institución no lo ve");
  } finally {
    await db.examAttempt.delete({ where: { id: P + "att_review" } });
  }
});
