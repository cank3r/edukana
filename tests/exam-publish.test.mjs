import assert from "node:assert/strict";
import { before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { MessageChannel } from "node:worker_threads";
import { build } from "esbuild";
// Run with jsdom installed separately (no database or app server needed):
// npm install --prefix /tmp/edukana-ui-dom --ignore-scripts jsdom@27.4.0
// EXAM_TEST_JSDOM_PATH=/tmp/edukana-ui-dom/node_modules/jsdom/lib/api.js node --test tests/exam-publish.test.mjs
const { JSDOM } = await import(process.env.EXAM_TEST_JSDOM_PATH || "jsdom");

// Exercise the real client component, including React's action state. Only the
// server-action/router boundary is replaced; no Next server or database is used.
let bundle;
before(async () => {
  const result = await build({
    stdin: {
      contents: `
        import { act, createElement } from "react";
        import { createRoot } from "react-dom/client";
        import { PublishExam } from "./src/app/dashboard/aula/[courseId]/examenes/ExamTools";
        const root = createRoot(document.getElementById("root"));
        const fixture = window.examFixture = {
          props: { examId: "exam-1", published: false, blocker: null, attemptCount: 2 },
          requests: [], refreshes: 0, resolve: null, act,
          render(props = {}) {
            Object.assign(fixture.props, props);
            root.render(createElement(PublishExam, fixture.props));
          },
          complete(result) { fixture.resolve(result); },
          async submit(form) {
            const request = Object.fromEntries(form);
            fixture.requests.push(request);
            const result = await new Promise(resolve => { fixture.resolve = resolve; });
            if (result.ok) fixture.props.published = request.publish === "true";
            return result;
          },
        };
        window.IS_REACT_ACT_ENVIRONMENT = true;
      `,
      resolveDir: fileURLToPath(new URL("..", import.meta.url)),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{
      name: "isolated-exam-boundaries",
      setup(build) {
        build.onResolve({ filter: /^next\/(navigation|link)$|^@\/server\/actions\/exam-admin$/ }, args => ({
          path: args.path, namespace: "exam-test",
        }));
        build.onLoad({ filter: /.*/, namespace: "exam-test" }, args => ({
          contents: args.path === "next/navigation"
            ? `const router = { refresh() { window.examFixture.refreshes++; window.examFixture.render(); } };
               export function useRouter() { return router; }`
            : args.path === "next/link"
              ? "export default function Link() { return null; }"
              : `export const setExamPublishedAction = (_state, form) => window.examFixture.submit(form);
                 export const deleteExamAction = null, saveExamAction = null, reviewExamAttemptAction = null;`,
          loader: "js",
        }));
      },
    }],
  });
  bundle = result.outputFiles[0].text;
});

async function openExam(t, props = {}) {
  const dom = new JSDOM('<main id="root"></main>', { runScripts: "dangerously" });
  const channels = [];
  dom.window.MessageChannel = class extends MessageChannel {
    constructor() { super(); channels.push(this); }
  };
  t.after(() => {
    for (const channel of channels) { channel.port1.close(); channel.port2.close(); }
    dom.window.close();
  });
  dom.window.eval(bundle);
  const fixture = dom.window.examFixture;
  await fixture.act(async () => { fixture.render(props); });
  const document = dom.window.document;
  return { document, fixture };
}

function button(ui, text) {
  const result = [...ui.document.querySelectorAll("button")].find(button => button.textContent === text);
  assert.ok(result, `Debe mostrarse el botón «${text}»`);
  return result;
}

async function click(ui, text) {
  await ui.fixture.act(async () => { button(ui, text).click(); });
}

async function complete(ui, ok, message) {
  await ui.fixture.act(async () => { ui.fixture.complete({ ok, message }); });
}

function requests(ui) {
  // Copy values from jsdom's realm before comparing with Node's objects.
  return JSON.parse(JSON.stringify(ui.fixture.requests));
}

function notice(ui, role) {
  return ui.document.querySelector(`[role="${role}"]`)?.textContent;
}

test("permite publicar, ocultar y volver a publicar sin recargar manualmente", async t => {
  const ui = await openExam(t);
  for (const publish of [true, false, true]) {
    await click(ui, publish ? "Publicar examen" : "Ocultar examen");
    assert.equal(notice(ui, "status"), undefined);
    await click(ui, publish ? "Sí, publicar" : "Sí, ocultar");
    assert.equal(button(ui, "Guardando…").disabled, true);
    assert.equal(button(ui, "Cancelar").disabled, true);
    const pendingRequests = requests(ui).length;
    await click(ui, "Guardando…");
    await click(ui, "Cancelar");
    assert.equal(requests(ui).length, pendingRequests);
    assert.ok(ui.document.querySelector("form"));
    await complete(ui, true, publish ? "Examen publicado." : "Examen oculto.");
    assert.equal(notice(ui, "status"), publish ? "Examen publicado." : "Examen oculto.");
    assert.ok(button(ui, publish ? "Ocultar examen" : "Publicar examen"));
    assert.equal(ui.document.querySelector("form"), null);
  }
  assert.deepEqual(requests(ui), [
    { examId: "exam-1", publish: "true" },
    { examId: "exam-1", publish: "false" },
    { examId: "exam-1", publish: "true" },
  ]);
  assert.equal(ui.fixture.refreshes, 3);
});

test("cancelar no envía cambios y permite abrir de nuevo la confirmación", async t => {
  const ui = await openExam(t);
  await click(ui, "Publicar examen");
  await click(ui, "Cancelar");
  assert.equal(ui.document.querySelector("form"), null);
  assert.deepEqual(requests(ui), []);
  await click(ui, "Publicar examen");
  assert.ok(button(ui, "Sí, publicar"));
});

test("un error conserva la confirmación y permite reintentar", async t => {
  const ui = await openExam(t);
  await click(ui, "Publicar examen");
  await click(ui, "Sí, publicar");
  await complete(ui, false, "No se pudo completar. Intenta de nuevo.");
  assert.equal(notice(ui, "alert"), "No se pudo completar. Intenta de nuevo.");
  assert.equal(button(ui, "Sí, publicar").disabled, false);
  assert.equal(ui.fixture.refreshes, 0);
  await click(ui, "Sí, publicar");
  await complete(ui, true, "Examen publicado.");
  assert.ok(button(ui, "Ocultar examen"));
  assert.equal(requests(ui).length, 2);
});

test("cancelar después de un error limpia el mensaje al volver a abrir", async t => {
  const ui = await openExam(t, { published: true });
  await click(ui, "Ocultar examen");
  await click(ui, "Sí, ocultar");
  await complete(ui, false, "Tu sesión terminó. Vuelve a iniciar sesión.");
  assert.ok(notice(ui, "alert"));
  await click(ui, "Cancelar");
  await click(ui, "Ocultar examen");
  assert.equal(notice(ui, "alert"), undefined);
  assert.equal(button(ui, "Sí, ocultar").disabled, false);
  assert.equal(requests(ui).length, 1);
});

test("un bloqueo impide publicar pero no impide ocultar un examen publicado", async t => {
  const blocker = "Agrega al menos una pregunta antes de publicar.";
  const ui = await openExam(t, { blocker });
  assert.equal(ui.document.querySelector("p").textContent, blocker);
  assert.equal(ui.document.querySelectorAll("button").length, 0);
  await ui.fixture.act(async () => { ui.fixture.render({ published: true }); });
  await click(ui, "Ocultar examen");
  assert.ok(button(ui, "Sí, ocultar"));
});
