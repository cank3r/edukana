import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { db } from "@/lib/db";
import { listPortalTasksForStudent } from "@/server/assessment/student-portal-tasks";
import { A, B, ensureSeed } from "./setup";

const now = new Date("2026-10-09T15:00:00Z");
const ids = (prefix: "a" | "b") => ({
  course: `it_pg_${prefix}_course`, enrollment: `it_pg_${prefix}_enrollment`,
  period: `it_pg_${prefix}_period`, category: `it_pg_${prefix}_category`,
  task: `it_pg_${prefix}_task`, item: `it_pg_${prefix}_item`,
});
const own = ids("a");
const foreign = ids("b");
const student = { id: A.student.id, institutionId: A.institutionId };
let seeded = false;

before(async () => {
  await ensureSeed();
  seeded = true;
  for (const [fixture, keys, periodId] of [[A, own, "a_period"], [B, foreign, "b_period"]] as const) {
    const base = { institutionId: fixture.institutionId, courseId: keys.course };
    await db.course.create({ data: {
      id: keys.course, institutionId: fixture.institutionId, periodId,
      teacherId: fixture.teacher.id, name: "Curso de privacidad del portal", isPublished: true,
    } });
    await db.enrollment.create({ data: {
      id: keys.enrollment, ...base, studentId: fixture.student.id, status: "ACTIVE",
    } });
    await db.gradingPeriod.create({ data: {
      id: keys.period, ...base, academicPeriodId: periodId, name: "Período del portal",
      startDate: now, endDate: new Date("2026-12-31"),
      categories: { create: { id: keys.category, ...base, name: "Tareas", weight: 100 } },
    } });
    await db.assignment.create({ data: { id: keys.task, ...base, title: "Tarea del portal", isPublished: true } });
    await db.gradeItem.create({ data: {
      id: keys.item, ...base, gradingPeriodId: keys.period, categoryId: keys.category,
      assignmentId: keys.task, title: "Nota del portal", isPublished: true,
    } });
  }
  await db.enrollment.create({ data: {
    id: "it_pg_second_enrollment", institutionId: A.institutionId, courseId: own.course,
    studentId: A.student2.id, status: "ACTIVE",
  } });
  await db.gradeEntry.create({ data: {
    institutionId: A.institutionId, gradeItemId: own.item, enrollmentId: "it_pg_second_enrollment",
    score: 99, feedback: "Comentario de otro estudiante", gradedById: A.teacher.id,
  } });
});

beforeEach(async () => {
  await db.course.update({ where: { id: own.course }, data: { isPublished: true } });
  await db.enrollment.update({ where: { id: own.enrollment }, data: { status: "ACTIVE" } });
  await db.assignment.update({ where: { id: own.task }, data: { isPublished: true } });
  await db.gradeItem.update({ where: { id: own.item }, data: {
    assignmentId: own.task, institutionId: A.institutionId, courseId: own.course, isPublished: true,
  } });
  const submission = {
    institutionId: A.institutionId, assignmentId: own.task, studentId: student.id,
    enrollmentId: own.enrollment, status: "GRADED" as const, score: 37, submittedAt: now,
  };
  await db.submission.upsert({
    where: { assignmentId_studentId: { assignmentId: own.task, studentId: student.id } },
    create: submission, update: submission,
  });
  const entry = {
    institutionId: A.institutionId, gradeItemId: own.item, enrollmentId: own.enrollment,
    score: 86, feedback: "Comentario vigente privado", isExcused: false, gradedById: A.teacher.id,
  };
  await db.gradeEntry.upsert({
    where: { gradeItemId_enrollmentId: { gradeItemId: own.item, enrollmentId: own.enrollment } },
    create: entry, update: entry,
  });
});

after(async () => {
  if (!seeded) return;
  const courseIds = [own.course, foreign.course];
  await db.gradeItem.deleteMany({ where: { id: { in: [own.item, foreign.item] } } });
  await db.assignment.deleteMany({ where: { courseId: { in: courseIds } } });
  await db.enrollment.deleteMany({ where: { courseId: { in: courseIds } } });
  await db.course.deleteMany({ where: { id: { in: courseIds } } });
  await db.$disconnect();
});

const read = () => listPortalTasksForStudent(student, own.course);
const entryKey = { gradeItemId_enrollmentId: { gradeItemId: own.item, enrollmentId: own.enrollment } };

test("portal: hidden linked grades suppress stale submission scores and exemption state", async () => {
  await db.gradeItem.update({ where: { id: own.item }, data: { isPublished: false } });
  for (const isExcused of [false, true]) {
    await db.gradeEntry.update({ where: entryKey, data: { isExcused } });
    const result = await read();
    assert.equal(result?.assignments[0].score, null);
    assert.equal(result?.assignments[0].isExcused, false);
    assert.equal(JSON.stringify(result).includes("Comentario"), false);
  }
});

test("portal: linked correction and zero come from the exact enrollment's entry", async () => {
  for (const score of [86, 0]) {
    await db.gradeEntry.update({ where: entryKey, data: { score } });
    const result = await read();
    assert.equal(result?.assignments[0].score, score);
    assert.equal(JSON.stringify(result).includes("Comentario"), false);
  }
  assert.equal((await db.submission.findUniqueOrThrow({
    where: { assignmentId_studentId: { assignmentId: own.task, studentId: student.id } },
  })).score, 37);
  const other = await listPortalTasksForStudent({ id: A.student2.id, institutionId: A.institutionId }, own.course);
  assert.equal(other?.assignments[0].score, 99);
});

test("portal: published manual grades and exemptions do not require a submission", async () => {
  await db.submission.deleteMany({ where: { assignmentId: own.task, studentId: student.id } });
  assert.equal((await read())?.assignments[0].score, 86);
  await db.gradeEntry.update({ where: entryKey, data: { isExcused: true } });
  const result = await read();
  assert.equal(result?.assignments[0].isExcused, true);
  assert.equal(result?.assignments[0].score, null);
  assert.equal(JSON.stringify(result).includes("Comentario"), false);
});

test("portal: cleared, foreign-institution and missing entries cannot use a stale submission", async () => {
  await db.gradeEntry.update({ where: entryKey, data: { score: null } });
  assert.equal((await read())?.assignments[0].score, null);
  await db.gradeEntry.update({ where: entryKey, data: { institutionId: B.institutionId, score: 98 } });
  assert.equal((await read())?.assignments[0].score, null);
  await db.gradeEntry.delete({ where: entryKey });
  assert.equal((await read())?.assignments[0].score, null);
});

test("portal: unlinked zero is visible, but an ungraded or draft submission score is private", async () => {
  await db.gradeItem.update({ where: { id: own.item }, data: { assignmentId: null } });
  await db.submission.updateMany({ where: { assignmentId: own.task, studentId: student.id }, data: { score: 0 } });
  assert.equal((await read())?.assignments[0].score, 0);
  for (const status of ["SUBMITTED", "DRAFT"] as const) {
    await db.submission.updateMany({ where: { assignmentId: own.task, studentId: student.id }, data: { status } });
    assert.equal((await read())?.assignments[0].score, null);
  }
});

test("portal: student, tenant, publication and enrollment gates do not expand task access", async () => {
  assert.equal(await listPortalTasksForStudent(student, foreign.course), null);
  assert.equal(await listPortalTasksForStudent({ ...student, institutionId: B.institutionId }, own.course), null);
  assert.equal(await listPortalTasksForStudent({ ...student, id: A.parent.id }, own.course), null);
  for (const status of ["COMPLETED", "DROPPED", "FAILED"] as const) {
    await db.enrollment.update({ where: { id: own.enrollment }, data: { status } });
    assert.equal((await read()) !== null, status === "COMPLETED");
  }
  await db.enrollment.update({ where: { id: own.enrollment }, data: { status: "ACTIVE" } });
  await db.course.update({ where: { id: own.course }, data: { isPublished: false } });
  assert.equal(await read(), null);
  await db.course.update({ where: { id: own.course }, data: { isPublished: true } });
  await db.assignment.update({ where: { id: own.task }, data: { isPublished: false } });
  assert.deepEqual((await read())?.assignments, []);
});
