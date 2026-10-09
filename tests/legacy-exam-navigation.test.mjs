import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { build } from "esbuild";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const fixture = {};
let coursePage;
let examsPage;
let forms;
const actionNames = ["createAssignment", "createCourse", "createExam", "createGradebook", "createLesson", "createQuestion",
  "createSection", "enrollStudent", "issueCertificate", "markLessonComplete", "reviewExamAttempt", "reviewSubmission",
  "saveAttendance", "saveScheduleSlot", "setEnrollmentCompletion", "submitAssignment", "submitExam", "togglePublication"];
const boundaries = {
  "@/lib/auth": "export const auth = async () => ({ user: fixture.user });",
  "@/lib/authorization": "export const getEffectiveCapabilities = async () => fixture.capabilities;",
  "@/lib/db": "export const db = new Proxy({}, { get: (_target, key) => fixture.db[key] });",
  "next/navigation": `export const notFound = () => { throw new Error("NOT_FOUND"); };
    export const redirect = () => { throw new Error("REDIRECT"); };`,
  "next/link": `import { createElement } from "react";
    export default function Link(props) { return createElement("a", props, props.children); }`,
  "@/components/dashboard/CourseTabs": "export default function Tabs() { return null; }",
  "@/app/dashboard/academico/actions": actionNames.map(name => `export const ${name} = async () => {
    fixture.actionCalls++; return { ok: false, message: "" }; };`).join("\n"),
  "@/server/assessment/exam-taking": "export const listStudentExams = async () => fixture.examData;",
};
before(async () => {
  for (const [name, path] of [
    ["course", "src/app/dashboard/aula/[courseId]/page.tsx"],
    ["list", "src/app/dashboard/aula/[courseId]/presentar/page.tsx"],
    ["forms", "src/components/dashboard/AcademicForms.tsx"],
  ]) {
    const result = await build({
      entryPoints: [fileURLToPath(new URL(`../${path}`, import.meta.url))],
      bundle: true, write: false, format: "cjs", platform: "node", packages: "external",
      plugins: [{ name: "legacy-exam-navigation-boundaries", setup(build) {
        build.onResolve({ filter: /.*/ }, args => Object.hasOwn(boundaries, args.path)
          ? { path: args.path, namespace: "legacy-exam-page-test" } : undefined);
        build.onLoad({ filter: /.*/, namespace: "legacy-exam-page-test" }, args => ({
          loader: "js", contents: boundaries[args.path], resolveDir: fileURLToPath(new URL("..", import.meta.url)),
        }));
      } }],
    });
    const compiledModule = { exports: {} };
    vm.runInNewContext(result.outputFiles[0].text, {
      module: compiledModule, exports: compiledModule.exports, require, fixture, console, Date,
    });
    if (name === "course") coursePage = compiledModule.exports.default;
    else if (name === "list") examsPage = compiledModule.exports.default;
    else forms = compiledModule.exports;
  }
});

beforeEach(() => {
  fixture.user = { id: "student", role: "STUDENT", institutionId: "institution" };
  fixture.capabilities = new Set(["course.view", "course.participate"]);
  fixture.enrollmentStatus = "ACTIVE";
  fixture.queries = [];
  fixture.actionCalls = 0;
  fixture.examData = { courseName: "Curso", timezone: "UTC", exams: [] };
  fixture.db = { course: { findFirst: async args => {
    fixture.queries.push(args);
    const where = args.where;
    if (where.id !== "course" || where.institutionId !== "institution") return null;
    if (where.enrollments && (where.enrollments.some.studentId !== "student" ||
      !where.enrollments.some.status.in.includes(fixture.enrollmentStatus))) return null;
    if (!args.include) return { teacherId: "teacher" };
    return {
      id: "course", code: "CUR", name: "Curso", teacherId: "teacher", description: "Descripción",
      teacher: { name: "Docente" }, period: { name: "Período", startDate: new Date(), endDate: new Date() },
      sections: [], attendanceSessions: [], gradingPeriods: [], assignments: [], questionBank: [],
      exams: args.include.exams.where.id?.in?.length === 0 ? [] : [{
        id: "exam", title: "Examen", instructions: "Preguntas privadas", maxAttempts: 1, durationMinutes: 10,
        questions: [{ points: 1, bankItem: { id: "question", prompt: "Pregunta secreta", type: "SHORT_ANSWER" } }],
        attempts: [],
      }],
      enrollments: [{ id: "enrollment", studentId: "student", student: { id: "student", name: "Estudiante" },
        status: fixture.enrollmentStatus, progressPercent: 10, certificates: [] }],
      scheduleSlots: [], assets: [], completionThreshold: 100,
    };
  } } };
});
const renderCourse = () => coursePage({ params: Promise.resolve({ courseId: "course" }) });
const renderList = () => examsPage({ params: Promise.resolve({ courseId: "course" }) });
function exam(overrides = {}) {
  return {
    id: "exam", title: "Examen", opensAt: null, closesAt: null, durationMinutes: 10, maxAttempts: 2,
    questionCount: 1, availability: "open", attemptsUsed: 0, attemptsLeft: 2, best: null, pendingReview: false,
    hasOngoingAttempt: false, lastFinishedAttemptId: null, canStart: true, startBlock: null, ...overrides,
  };
}

test("the real course page routes students to the timed list without reading or rendering old questions", async () => {
  const html = renderToStaticMarkup(await renderCourse());
  assert.match(html, /href="\/dashboard\/aula\/course\/presentar"/);
  assert.match(html, /Ver mis exámenes/);
  assert.doesNotMatch(html, /Pregunta secreta|Preguntas privadas|question_question|Enviar examen/);
  assert.equal(fixture.queries[1].include.exams.where.id.in.length, 0);
  assert.equal(fixture.actionCalls, 0, "navigation never starts or submits an attempt");
});

test("the actual legacy form is a keyboard link with a 44px target, no inputs or submission", () => {
  const html = renderToStaticMarkup(forms.ExamAttemptForm({ courseId: "course" }));
  assert.match(html, /<a[^>]+href="\/dashboard\/aula\/course\/presentar"/);
  assert.match(html, /min-h-11/);
  assert.match(html, /focus-visible:outline/);
  assert.doesNotMatch(html, /<form|<input|<textarea|<button|min-w-\[/);
  assert.equal(fixture.actionCalls, 0);
});

test("completed course retains result navigation and read-only notice without starting anything", async () => {
  fixture.enrollmentStatus = "COMPLETED";
  const html = renderToStaticMarkup(await renderCourse());
  assert.match(html, /Curso completado/);
  assert.match(html, /Ver mis exámenes/);
  assert.doesNotMatch(html, /Iniciar examen|Enviar examen|Pregunta secreta/);
});

test("course scope rejects another tenant, withdrawn enrollment and missing course permission", async () => {
  fixture.user.institutionId = "foreign";
  await assert.rejects(renderCourse, /NOT_FOUND/);
  fixture.user.institutionId = "institution";
  fixture.enrollmentStatus = "DROPPED";
  await assert.rejects(renderCourse, /NOT_FOUND/);
  fixture.enrollmentStatus = "ACTIVE";
  fixture.capabilities.clear();
  await assert.rejects(renderCourse, /NOT_FOUND/);
});

test("the linked timed list leads to the real intro and preserves ongoing/retry/result navigation", async () => {
  for (const item of [exam(), exam({ hasOngoingAttempt: true, attemptsUsed: 1 }),
    exam({ attemptsUsed: 1, lastFinishedAttemptId: "finished", best: { score: 1, maxScore: 1 } })]) {
    fixture.examData.exams = [item];
    const html = renderToStaticMarkup(await renderList());
    assert.match(html, /href="\/dashboard\/aula\/course\/presentar\/exam"/);
    assert.match(html, item.hasOngoingAttempt ? /Continuar examen/ : /Presentar examen/);
    assert.match(html, /10 minutos/);
    if (item.lastFinishedAttemptId) assert.match(html, /\/presentar\/exam\/resultado/);
    assert.equal(fixture.actionCalls, 0);
  }
});

test("blocked starts expose details and history only, including exhausted and completed courses", async () => {
  for (const startBlock of ["not_open_yet", "closed", "no_attempts_left", "course_finished", "no_questions"]) {
    fixture.examData.exams = [exam({ canStart: false, startBlock, lastFinishedAttemptId: "finished" })];
    const html = renderToStaticMarkup(await renderList());
    assert.match(html, /Ver detalles/);
    assert.match(html, /Ver mi resultado/);
    assert.doesNotMatch(html, /Presentar examen|Continuar examen|Iniciar examen|Enviar examen/);
  }
});

test("empty, foreign and non-student timed lists do not offer new attempts", async () => {
  assert.match(renderToStaticMarkup(await renderList()), /todavía no ha publicado/);
  fixture.examData = null;
  assert.match(renderToStaticMarkup(await renderList()), /No encontramos este curso/);
  for (const role of ["TEACHER", "ADMIN", "COORDINATOR", "PARENT"]) {
    fixture.user.role = role;
    const html = renderToStaticMarkup(await renderList());
    assert.match(html, /Esta página es para que los estudiantes/);
    assert.doesNotMatch(html, /Iniciar examen|Presentar examen|Enviar examen/);
  }
});
