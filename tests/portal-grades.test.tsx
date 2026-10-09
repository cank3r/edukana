import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, beforeEach, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { PrismaClient } from "@prisma/client";
import { PortalTasks } from "../src/app/dashboard/portal/PortalTasks";

const student = { id: "student", institutionId: "institution", role: "STUDENT" as const };
const now = new Date("2026-10-09T15:00:00Z");
const initialCourse = () => ({
  id: "course", institutionId: student.institutionId, isPublished: true, name: "Mi curso", code: "CURSO",
  teacher: { name: "Docente" }, institution: { timezone: "America/Santo_Domingo" },
});
const initialEnrollment = () => ({
  id: "enrollment", studentId: student.id, courseId: "course", status: "ACTIVE", finalGrade: 78,
});
const initialTask = () => ({ id: "task", title: "Tarea de prueba", dueDate: null, maxScore: 100, isPublished: true });
const initialSubmission = () => ({
  studentId: student.id, enrollmentId: "enrollment", status: "GRADED", score: 37, submittedAt: now,
});
const initialEntry = () => ({
  institutionId: student.institutionId, enrollmentId: "enrollment", score: 86 as number | null,
  feedback: "Comentario confidencial", isExcused: false,
});
let course = initialCourse();
let enrollment = initialEnrollment();
let task = initialTask();
let submissions = [initialSubmission()];
let entries = [initialEntry()];
let item: { institutionId: string; courseId: string; isPublished: boolean } | null;
let role = "STUDENT";
let permission = true;
let reads: string[] = [];

type CourseQuery = { where: {
  studentId: string; courseId: string; status: { in: string[] }; course: { institutionId: string; isPublished: boolean };
} };
type TaskQuery = {
  where: { courseId: string; isPublished: boolean }; take: number;
  select: {
    submissions: { where: { studentId: string; enrollmentId: string } };
    gradeItem: { select: { entries: { where: { institutionId: string; enrollmentId: string } } } };
  };
};
const fake = {
  roleCapabilityOverride: { findMany: async () => [
    { capability: "student.portal.view", enabled: permission },
  ] },
  enrollment: {
    findFirst: async ({ where }: CourseQuery) => {
      reads.push("course-access");
      assert.deepEqual(where.status, { in: ["ACTIVE", "COMPLETED"] });
      assert.equal(where.course.isPublished, true);
      return where.studentId === enrollment.studentId && where.courseId === course.id &&
        where.course.institutionId === course.institutionId && course.isPublished && where.status.in.includes(enrollment.status)
        ? { ...enrollment, course: structuredClone(course) } : null;
    },
    findMany: async (query: { where: { studentId: string; course: { institutionId: string } }; include: object }) => {
      reads.push("portal-courses");
      assert.deepEqual(query.where, { studentId: student.id, course: { institutionId: student.institutionId } });
      // The actual page may not request raw assignment/submission data alongside its M2 cards.
      assert.deepEqual(query.include, { course: { include: { teacher: { select: { name: true } } } } });
      return [{ ...enrollment, course: structuredClone(course) }];
    },
  },
  assignment: { findMany: async ({ where, select, take }: TaskQuery) => {
    reads.push("tasks");
    assert.equal(where.isPublished, true);
    assert.equal(take, 5);
    assert.deepEqual(select.submissions.where, { studentId: student.id, enrollmentId: enrollment.id });
    const entryWhere = select.gradeItem.select.entries.where;
    assert.deepEqual(entryWhere, { institutionId: student.institutionId, enrollmentId: enrollment.id });
    if (where.courseId !== course.id || !task.isPublished) return [];
    const { isPublished: _published, ...fields } = task;
    void _published;
    return [{
      ...fields,
      submissions: submissions.filter((row) => row.studentId === select.submissions.where.studentId &&
        row.enrollmentId === select.submissions.where.enrollmentId),
      gradeItem: item && { ...item, entries: entries.filter((row) => row.institutionId === entryWhere.institutionId &&
        row.enrollmentId === entryWhere.enrollmentId) },
    }];
  } },
  paymentConcept: { findMany: async () => { reads.push("payments"); return []; } },
};
const prismaGlobal = globalThis as unknown as { prisma?: PrismaClient };
const originalPrisma = prismaGlobal.prisma;
prismaGlobal.prisma = fake as unknown as PrismaClient;
let restoreAuth = () => {};
let listPortalTasks: typeof import("../src/server/assessment/student-portal-tasks").listPortalTasksForStudent;
let PortalPage: typeof import("../src/app/dashboard/portal/page").default;
before(async () => {
  // Substitute only the session boundary; the page, capability checks, reader and policy are production code.
  const require = createRequire(import.meta.url);
  const authPath = require.resolve("../src/lib/auth");
  const originalAuth = require.cache[authPath];
  restoreAuth = () => {
    if (originalAuth) require.cache[authPath] = originalAuth;
    else delete require.cache[authPath];
  };
  require.cache[authPath] = { id: authPath, filename: authPath, loaded: true,
    exports: { auth: async () => ({ user: { ...student, role } }) } } as NodeModule;
  ({ listPortalTasksForStudent: listPortalTasks } = await import("../src/server/assessment/student-portal-tasks"));
  ({ default: PortalPage } = await import("../src/app/dashboard/portal/page"));
});
after(() => {
  restoreAuth();
  if (originalPrisma) prismaGlobal.prisma = originalPrisma;
  else delete prismaGlobal.prisma;
});
beforeEach(() => {
  course = initialCourse(); enrollment = initialEnrollment(); task = initialTask();
  submissions = [initialSubmission()]; entries = [initialEntry()];
  item = { institutionId: student.institutionId, courseId: course.id, isPublished: true };
  role = "STUDENT"; permission = true; reads = [];
});
const read = () => listPortalTasks(student, course.id);
const renderTasks = async () => renderToStaticMarkup(<PortalTasks data={await read()} />);

test("actual portal page redacts a hidden linked grade instead of showing stale Submission.score", async () => {
  item!.isPublished = false;
  const html = renderToStaticMarkup(await PortalPage());
  assert.ok(html.includes("Tarea de prueba"));
  assert.ok(html.includes("Entregada"));
  for (const value of ["Nota:", "37 de", "86 de", "Comentario confidencial", "Exonerada"]) assert.ok(!html.includes(value));
  assert.ok(html.includes("Calificación final:"));
  assert.ok(html.includes("78"));
  assert.ok(html.includes("Estado de cuenta"));
  assert.deepEqual(reads.sort(), ["course-access", "payments", "portal-courses", "tasks"].sort());
});

test("portal reader and rendered page use corrected linked grades, including zero", async () => {
  for (const score of [86, 0]) {
    entries[0].score = score;
    const result = await read();
    assert.equal(result?.assignments[0].score, score);
    assert.ok(!JSON.stringify(result).includes("Comentario confidencial"));
    const html = renderToStaticMarkup(await PortalPage());
    assert.ok(html.includes(`Nota: ${score} de 100`));
    assert.ok(!html.includes("37 de"));
  }
});

test("published manual grades and exemptions appear without a Submission and contain no exempt score", async () => {
  submissions = [];
  assert.equal((await read())?.assignments[0].score, 86);
  assert.ok((await renderTasks()).includes("Nota: 86 de 100"));
  entries[0].isExcused = true;
  const result = await read();
  assert.equal(result?.assignments[0].score, null);
  assert.equal(result?.assignments[0].isExcused, true);
  const html = await renderTasks();
  assert.ok(html.includes("Exonerada"));
  for (const value of ["Nota:", "86", "Comentario confidencial"]) assert.ok(!html.includes(value));
  item!.isPublished = false;
  assert.equal((await read())?.assignments[0].isExcused, false);
  assert.ok(!(await renderTasks()).includes("Exonerada"));
});

test("a missing, cleared, other-student or other-institution entry never falls back to a Submission grade", async () => {
  const entryCases = [[], [{ ...initialEntry(), score: null }],
    [{ ...initialEntry(), enrollmentId: "other-enrollment", score: 99 }],
    [{ ...initialEntry(), institutionId: "other-institution", score: 98 }]];
  for (const candidate of entryCases) {
    entries = candidate;
    assert.equal((await read())?.assignments[0].score, null);
    assert.ok(!(await renderTasks()).includes("Nota:"));
  }
});

test("a malformed linked item fails closed without stale fallback", async () => {
  for (const candidate of [{ ...item!, institutionId: "foreign" }, { ...item!, courseId: "other-course" }]) {
    item = candidate;
    assert.equal((await read())?.assignments[0].score, null);
    assert.equal((await read())?.assignments[0].isExcused, false);
  }
});

test("unlinked grades require own graded submission; drafts and another student's work stay private", async () => {
  item = null;
  assert.equal((await read())?.assignments[0].score, 37);
  submissions[0].score = 0;
  assert.equal((await read())?.assignments[0].score, 0);
  for (const candidate of [
    { ...initialSubmission(), status: "DRAFT" }, { ...initialSubmission(), status: "SUBMITTED" },
    { ...initialSubmission(), studentId: "other-student" }, { ...initialSubmission(), enrollmentId: "other-enrollment" },
  ]) {
    submissions = [candidate];
    assert.equal((await read())?.assignments[0].score, null);
  }
});

test("task reader preserves tenant, enrollment, course publication and task publication gates", async () => {
  for (const status of ["ACTIVE", "COMPLETED"]) {
    enrollment.status = status;
    assert.equal((await read())?.assignments.length, 1);
  }
  for (const status of ["DROPPED", "FAILED"]) {
    enrollment.status = status; reads = [];
    assert.equal(await read(), null);
    assert.deepEqual(reads, ["course-access"]);
  }
  enrollment = initialEnrollment();
  assert.equal(await listPortalTasks({ ...student, id: "other-student" }, course.id), null);
  assert.equal(await listPortalTasks({ ...student, institutionId: "foreign" }, course.id), null);
  course.isPublished = false;
  assert.equal(await read(), null);
  course.isPublished = true; task.isPublished = false;
  assert.deepEqual((await read())?.assignments, []);
});

test("the actual portal retains both STUDENT role and capability checks before reading data", async () => {
  for (const otherRole of ["TEACHER", "ADMIN", "PARENT"]) {
    role = otherRole;
    await assert.rejects(PortalPage(), /NEXT_REDIRECT/);
    assert.deepEqual(reads, []);
  }
  role = "STUDENT"; permission = false;
  await assert.rejects(PortalPage(), /NEXT_REDIRECT/);
  assert.deepEqual(reads, []);
});

test("rendered task links use existing routes and remain keyboard/touch reachable with long titles", async () => {
  task.title = "UnaTareaConUnTítuloMuyLargo".repeat(10);
  const html = await renderTasks();
  assert.ok(html.includes('href="/dashboard/aula/course/tareas/task"'));
  assert.ok(html.includes('href="/dashboard/aula/course/tareas"'));
  assert.ok(html.includes("Ver tareas"));
  assert.ok(html.includes("min-h-11"));
  assert.ok(html.includes("wrap-anywhere"));
  assert.ok(html.includes("focus-visible:outline"));
  assert.ok(!html.includes('tabindex="-1"'));
  assert.ok(!html.includes("overflow-x-auto"));
});
