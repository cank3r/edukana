import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import type { SubmitWithFiles } from "../src/app/dashboard/aula/[courseId]/tareas/[assignmentId]/SubmissionFiles";

// The real page and component render under strict, named session/service stubs. No database or authentication is executed.
const { renderScenario } = createRequire(import.meta.url)("./ui/assignment-guide-server.cjs") as {
  renderScenario(name: string): Promise<{
    html: string; props: ComponentProps<typeof SubmitWithFiles>[]; keys: (string | null)[]; calls: string[];
    scenario: { assignment: { title: string; instructions: string }; submission: { content: string; link: string } | null };
  }>;
};
test("student page connects its actual task context once and keys the existing form by assignment", async () => {
  const page = await renderScenario("new");
  assert.equal(page.props.length, 1); assert.deepEqual(page.keys, ["assignment-fixture"]);
  const props = page.props[0];
  assert.equal(props.assignmentId, "assignment-fixture"); assert.equal(props.canSubmit, true);
  assert.deepEqual(props.guideContext, { title: page.scenario.assignment.title, instructions: page.scenario.assignment.instructions });
  assert.equal(props.assignmentHref, "/dashboard/aula/course-fixture/tareas/assignment-fixture");
  assert.equal(props.content, ""); assert.equal(props.link, ""); assert.equal(props.resubmitting, false);
  assert.deepEqual(props.currentFiles, []); assert.deepEqual(props.pendingFiles, []);
  assert.equal(page.html.split(`>${page.scenario.assignment.instructions}<`).length - 1, 1);
  assert.equal((page.html.match(/<form\b/g) ?? []).length, 1);
  assert.match(page.html, /<ol[^>]*aria-label="Pasos para entregar tu tarea"/);
  assert.equal((page.html.match(/aria-current="step"/g) ?? []).length, 1);
  const steps = page.html.match(/<ol[^>]*aria-label="Pasos para entregar tu tarea"[^>]*>([\s\S]*?)<\/ol>/)?.[1] ?? "";
  assert.equal((steps.match(/<button[^>]*type="button"/g) ?? []).length, 3);
  assert.match(steps, /<button[^>]*aria-current="step"/); assert.doesNotMatch(steps, /Completado/);
  for (const label of ["Prepara tu respuesta", "Revisa tu respuesta", "Entrega tu tarea", "Lo que pide tu docente"]) {
    assert.ok(page.html.includes(label));
  }
  assert.doesNotMatch(page.html, /Ver guía paso a paso|Salir de la guía|Repetir guía/);
  assert.deepEqual(page.calls, ["auth", "capabilities", "student", "studentFiles"]);
});
test("current submission provides the saved summary and retains its original content, link and files", async () => {
  const page = await renderScenario("current"); const props = page.props[0];
  assert.equal(props.content, page.scenario.submission!.content); assert.equal(props.link, ""); assert.equal(props.resubmitting, true);
  assert.equal(props.currentFiles[0].id, "current-fixture");
  const summary = renderToStaticMarkup(props.savedSummary);
  assert.match(summary, /16 de octubre de 2026/); assert.match(summary, /cambiado 1 vez/);
});
for (const name of ["linked", "graded", "closed"]) {
  test(`${name}: page retains the same component boundary and supplies read-only content`, async () => {
    const page = await renderScenario(name); assert.equal(page.props.length, 1);
    assert.equal(page.props[0].canSubmit, false); assert.deepEqual(page.keys, ["assignment-fixture"]);
    assert.ok(page.props[0].readOnlyContent);
    assert.match(page.html, /<textarea[^>]*readonly/i);
    assert.match(page.html, /<input[^>]*type="file"[^>]*disabled/i);
    if (name === "graded") assert.match(page.html, /Tu nota/);
    if (name === "linked") assert.match(page.html, /https:\/\/example.test\/trabajo-guardado/);
  });
}
test("pending attachments remain separate from the saved submission", async () => {
  const page = await renderScenario("pending"); const props = page.props[0];
  assert.deepEqual(props.currentFiles, []); assert.equal(props.pendingFiles[0].id, "pending-fixture");
  assert.equal(props.resubmitting, false);
});
for (const name of ["forbidden", "missing", "wrong-course"]) {
  test(`${name}: original access and course boundary refuses the fixture data`, async () => {
    await assert.rejects(renderScenario(name), /FIXTURE_NOT_FOUND/);
  });
}
test("missing session preserves the login redirect", async () => {
  await assert.rejects(renderScenario("anonymous"), /FIXTURE_REDIRECT:\/login/);
});
test("teacher branch stays outside the student guide", async () => {
  const page = await renderScenario("teacher");
  assert.deepEqual(page.props, []); assert.deepEqual(page.keys, []);
  assert.match(page.html, /Instrucciones/); assert.doesNotMatch(page.html, /Ver guía paso a paso/);
  assert.deepEqual(page.calls, ["auth", "capabilities", "roster"]);
});
