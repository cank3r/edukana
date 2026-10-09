import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { build } from "esbuild";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const fixture = {};
let examsPage;
// Only session, capabilities, database and framework boundaries are replaced; the student exam list renders for real.
const boundaries = {
  "@/lib/auth": "export const auth = async () => ({ user: fixture.user });",
  "@/lib/authorization": "export const getEffectiveCapabilities = async () => fixture.capabilities;",
  "@/lib/db": "export const db = new Proxy({}, { get: (_target, key) => fixture.db[key] });",
  "next/navigation": `export const notFound = () => { throw new Error("NOT_FOUND"); };
    export const redirect = () => { throw new Error("REDIRECT"); };`,
  "next/link": `import { createElement } from "react";
    export default function Link(props) { return createElement("a", props, props.children); }`,
  "@/server/assessment/exam-taking": "export const listStudentExams = async () => fixture.examData;",
};
before(async () => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL("../src/app/dashboard/aula/[courseId]/presentar/page.tsx", import.meta.url))],
    bundle: true, write: false, format: "cjs", platform: "node", packages: "external",
    plugins: [{ name: "exam-list-boundaries", setup(build) {
      build.onResolve({ filter: /.*/ }, args => Object.hasOwn(boundaries, args.path)
        ? { path: args.path, namespace: "exam-list-test" } : undefined);
      build.onLoad({ filter: /.*/, namespace: "exam-list-test" }, args => ({
        loader: "js", contents: boundaries[args.path], resolveDir: fileURLToPath(new URL("..", import.meta.url)),
      }));
    } }],
  });
  const compiledModule = { exports: {} };
  vm.runInNewContext(result.outputFiles[0].text, {
    module: compiledModule, exports: compiledModule.exports, require, fixture, console, Date,
  });
  examsPage = compiledModule.exports.default;
});

beforeEach(() => {
  fixture.user = { id: "student", role: "STUDENT", institutionId: "institution" };
  fixture.capabilities = new Set(["course.view", "course.participate"]);
  fixture.examData = { courseName: "Curso", timezone: "UTC", exams: [] };
  // Any direct database read from the list page fails the test: data comes only from listStudentExams.
  fixture.db = new Proxy({}, { get: (_target, key) => { throw new Error(`unexpected db.${String(key)}`); } });
});
const renderList = () => examsPage({ params: Promise.resolve({ courseId: "course" }) });
function exam(overrides = {}) {
  return {
    id: "exam", title: "Examen", opensAt: null, closesAt: null, durationMinutes: 10, maxAttempts: 2,
    questionCount: 1, availability: "open", attemptsUsed: 0, attemptsLeft: 2, best: null, pendingReview: false,
    hasOngoingAttempt: false, lastFinishedAttemptId: null, canStart: true, startBlock: null, ...overrides,
  };
}

test("the linked timed list leads to the real intro and preserves ongoing/retry/result navigation", async () => {
  for (const item of [exam(), exam({ hasOngoingAttempt: true, attemptsUsed: 1 }),
    exam({ attemptsUsed: 1, lastFinishedAttemptId: "finished", best: { score: 1, maxScore: 1 } })]) {
    fixture.examData.exams = [item];
    const html = renderToStaticMarkup(await renderList());
    assert.match(html, /href="\/dashboard\/aula\/course\/presentar\/exam"/);
    assert.match(html, item.hasOngoingAttempt ? /Continuar examen/ : /Presentar examen/);
    assert.match(html, /10 minutos/);
    if (item.lastFinishedAttemptId) assert.match(html, /\/presentar\/exam\/resultado/);
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
