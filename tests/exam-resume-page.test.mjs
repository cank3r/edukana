import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { build } from "esbuild";
import { renderToStaticMarkup } from "react-dom/server";

// Exercise the real server page. Only reader/auth/client-component boundaries are mocked.
const require = createRequire(import.meta.url);
let page;
let resultPage;
const fixture = {};
before(async () => {
  for (const isResult of [false, true]) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(`../src/app/dashboard/aula/[courseId]/presentar/[examId]/${isResult ? "resultado/" : ""}page.tsx`, import.meta.url))],
    bundle: true, write: false, format: "cjs", platform: "node", packages: "external",
    plugins: [{ name: "exam-page-boundaries", setup(build) {
      build.onResolve({ filter: /^next\/link$|^@\/server\/assessment\/exam-taking$|^(?:\.\.\/){1,2}shared$|^\.\/ExamRunner$/ },
        args => ({ path: args.path, namespace: "exam-page-test" }));
      build.onLoad({ filter: /.*/, namespace: "exam-page-test" }, args => ({
        loader: "js", resolveDir: fileURLToPath(new URL("..", import.meta.url)),
        contents: args.path === "@/server/assessment/exam-taking"
          ? `export const getExamIntro = async () => fixture.intro;
             export const getAttemptResult = async () => null;
             export const getOngoingAttempt = async () => { fixture.ongoingReads++; return fixture.ongoing; };`
          : args.path.endsWith("/shared")
            ? `import { createElement } from "react";
               export const currentStudent = async () => ({ id: "student", institutionId: "institution" });
               export const dateTime = () => "fecha", timeLimit = () => "10 minutos", points = value => value;
               export const secondaryLink = "secondary", primaryLink = "primary";
               export const NothingHere = props => createElement("p", null, props.message);`
            : args.path === "./ExamRunner"
              ? `import { createElement } from "react";
                 export const ExamRunner = props => createElement("section", { "data-runner": props.attemptId }, props.title);
                 export const StartExam = () => createElement("button", null, "Iniciar examen");`
              : `import { createElement } from "react";
                 export default function Link(props) { return createElement("a", { href: props.href }, props.children); }`,
      }));
    } }],
  });
  const compiledModule = { exports: {} };
  vm.runInNewContext(result.outputFiles[0].text, { module: compiledModule, exports: compiledModule.exports, require, fixture });
  if (isResult) resultPage = compiledModule.exports.default;
  else page = compiledModule.exports.default;
  }
});

beforeEach(() => {
  fixture.intro = {
    id: "exam", title: "Exam", courseId: "course", courseName: "Course", instructions: null, timezone: "UTC",
    opensAt: null, closesAt: null, durationMinutes: 10, maxAttempts: 2, questionCount: 1,
    attemptsLeft: 1, canStart: false, startBlock: null, hasOngoingAttempt: true,
    hasUnsubmittedExpiredAttempt: false, lastFinishedAttemptId: null,
  };
  fixture.ongoing = {
    attemptId: "attempt", expiresAt: new Date("2026-10-09T12:10:00Z"), serverNow: new Date("2026-10-09T12:02:00Z"),
    questions: [{ bankItemId: "question", type: "SHORT_ANSWER", prompt: "Question", points: 1, options: null }],
  };
  fixture.ongoingReads = 0;
});

const render = () => page({ params: Promise.resolve({ courseId: "course", examId: "exam" }) });

test("hidden resumption shows the existing runner even though starting is disabled", async () => {
  const element = await render();
  assert.equal(element.props.attemptId, "attempt");
  assert.equal(element.props.remainingMs, 480_000);
  assert.equal(element.props.questions[0].id, "question");
  const html = renderToStaticMarkup(element);
  assert.match(html, /data-runner="attempt"/);
  assert.doesNotMatch(html, /Iniciar examen|Ver mi resultado/);
});

test("expiry or enrollment change between reads gives an honest fallback without a new start", async () => {
  fixture.ongoing = null;
  for (const canStart of [false, true]) {
    fixture.intro.canStart = canStart;
    const html = renderToStaticMarkup(await render());
    assert.match(html, /No pudimos retomar tu intento/);
    assert.match(html, /terminado el tiempo|matrícula/);
    assert.doesNotMatch(html, /Iniciar examen|Ver mi resultado|data-runner/);
  }
});

test("an unavailable hidden or expired intro reveals no exam content", async () => {
  fixture.intro = null;
  const html = renderToStaticMarkup(await render());
  assert.match(html, /no está disponible para ti/);
  assert.match(html, /intento vigente/);
  assert.doesNotMatch(html, /Iniciar examen|Ver mi resultado|data-runner/);
  assert.equal(fixture.ongoingReads, 0);
});

test("completed enrollment keeps its published read-only explanation and skips the runner", async () => {
  fixture.intro.startBlock = "course_finished";
  const html = renderToStaticMarkup(await render());
  assert.match(html, /Ya terminaste este curso/);
  assert.doesNotMatch(html, /Iniciar examen|data-runner/);
  assert.equal(fixture.ongoingReads, 0);
});

const renderResult = () => resultPage({
  params: Promise.resolve({ courseId: "course", examId: "exam" }),
  searchParams: Promise.resolve({ intento: "attempt" }),
});

test("hidden ongoing result page offers continuation without promising a visible grade", async () => {
  const element = await renderResult();
  assert.equal(element.props.label, "Continuar examen");
  assert.match(renderToStaticMarkup(element), /cuando esté disponible/);
  assert.doesNotMatch(renderToStaticMarkup(element), /aquí verás tu resultado|Obtuviste|Correcta/);
});

test("hidden submitted result page explains unavailability without claiming submission failed", async () => {
  fixture.intro = null;
  const html = renderToStaticMarkup(await renderResult());
  assert.match(html, /resultado de este examen no está disponible/);
  assert.match(html, /confirmar tu entrega/);
  assert.doesNotMatch(html, /no hay un envío confirmado|sin puntos|Obtuviste|Correcta/);
});
