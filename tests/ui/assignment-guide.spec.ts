import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type {} from "./assignment-guide-fixture";

const baseline = process.env.ASSIGNMENT_GUIDE_BASELINE === "1";
const origin = "http://127.0.0.1:3171";
const answer = "Mi planta tiene hojas verdes. Necesita agua y luz para crecer.";
const link = "https://example.test/mi-trabajo";
let errors: string[], rejected: string[];
test.beforeEach(async ({ page }) => {
  errors = []; rejected = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin || request.method() !== "GET" || url.pathname.startsWith("/api/")) {
      rejected.push(`${request.method()} ${url.href}`); await route.abort();
    } else await route.continue();
  });
});
test.afterEach(async ({ page }) => {
  expect(rejected).toEqual([]); expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.assignmentFixture?.forbidden ?? [])).toEqual([]);
  await expect(page.locator("[data-hydration-error]")).toHaveCount(0);
});
async function open(page: Page, scene = "new", percent = 100) {
  await page.goto(`/?scene=${scene}${baseline ? "&revision=baseline" : ""}`);
  await expect(page.locator("[data-assignment-boundary]")).toHaveAttribute("data-hydrated", "true");
  await page.evaluate(async size => {
    document.documentElement.style.fontSize = `${size}%`; await document.fonts.ready;
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined)));
  }, percent);
}
const response = (page: Page) => page.locator('textarea[name="content"]');
const urlField = (page: Page) => page.locator('input[name="link"]');
const reviewButton = (page: Page) => page.getByRole("button", { name: baseline ? "Entregar tarea" : "Revisar respuesta", exact: true });
const review = (page: Page) => page.getByRole(baseline ? "alertdialog" : "region", {
  name: baseline ? "Confirmar entrega" : "Confirmación de la entrega", exact: true,
});
const confirmation = (page: Page) => baseline ? review(page) : page.getByRole("region", { name: "Confirmación de la entrega", exact: true });
const confirm = (page: Page, updating = false) => confirmation(page).getByRole("button", {
  name: baseline ? "Sí, entregar" : updating ? "Actualizar entrega" : "Entregar tarea", exact: true,
});
async function draft(page: Page, withLink = true) {
  await response(page).fill(answer); if (withLink) await urlField(page).fill(link);
}
async function inReview(page: Page) { await reviewButton(page).click(); await expect(review(page)).toBeVisible(); }
async function inConfirmation(page: Page) { await expect(confirmation(page)).toBeVisible(); }
const steps = (page: Page) => page.getByRole("list", { name: "Pasos para entregar tu tarea", exact: true });
const step = (page: Page, index: number) => steps(page).locator(":scope > li").nth(index - 1).getByRole("button");
async function completed(page: Page, indexes: number[]) {
  for (const index of [1, 2]) {
    const row = steps(page).locator(":scope > li").nth(index - 1);
    await expect(row.getByText("Completado", { exact: true })).toHaveCount(indexes.includes(index) ? 1 : 0);
    if (indexes.includes(index)) await expect(row.locator('svg[aria-hidden="true"]')).toHaveCount(1);
  }
}
async function navigationLocked(page: Page) { for (const index of [1, 2]) await expect(step(page, index)).toBeDisabled(); }
async function progress(page: Page, active: number) {
  const list = steps(page);
  const rows = list.locator(":scope > li"); await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Prepara tu respuesta"); await expect(rows.nth(1)).toContainText("Revisa y entrega");
  await expect(list.locator('[aria-current="step"]')).toHaveCount(1);
  await expect(step(page, active)).toHaveAttribute("aria-current", "step");
  await expect(rows.nth(1)).not.toContainText(/Entregada|Completad/);
  const now = list.getByText("Ahora", { exact: true }); await expect(now).toHaveCount(1);
  expect(await now.evaluate(element => {
    const range = document.createRange(); range.selectNodeContents(element); return range.getClientRects().length;
  })).toBe(1);
}
const sentHeading = (page: Page) => page.getByRole("heading", { name: "Tarea entregada", exact: true });
async function finished(page: Page) {
  await expect(sentHeading(page)).toBeVisible(); await expect(steps(page)).toHaveCount(0);
  await expect(page.locator('textarea:visible,input[name="link"]:visible,button[type="submit"]:visible')).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Volver a mis tareas", exact: true }))
    .toHaveAttribute("href", "/dashboard/aula/course-fixture/tareas");
  await expect(page.getByRole("link", { name: "Ver mi entrega", exact: true })).toHaveCount(0);
}
async function editSaved(page: Page) {
  await finished(page); await page.getByRole("button", { name: "Editar entrega", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edita tu entrega", exact: true })).toBeFocused();
  await expect(response(page)).toBeVisible(); await progress(page, 1);
}
async function recover(page: Page) {
  const count = await page.evaluate(() => window.assignmentFixture.calls.length);
  await page.getByRole("button", { name: "Volver a mi respuesta", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^(Prepara tu respuesta|Edita tu entrega)$/ })).toBeFocused();
  await expect(response(page)).toBeVisible(); expect(await page.evaluate(() => window.assignmentFixture.calls.length)).toBe(count);
}
async function layout(page: Page) {
  const measured = await page.evaluate(() => window.assignmentFixture.measureLayout());
  expect.soft(measured.scrollWidth).toBeLessThanOrEqual(measured.viewport); expect.soft(measured.clipped).toEqual([]);
  for (const target of measured.targets) {
    expect.soft(target.height, String(target.label)).toBeGreaterThanOrEqual(44);
    expect.soft(target.width, String(target.label)).toBeGreaterThanOrEqual(44);
  }
  return measured;
}
async function focusedWithin(page: Page, selector: string) {
  expect(await page.evaluate(query => document.activeElement !== document.body
    && Boolean(document.activeElement?.closest(query)), selector)).toBe(true);
}
const pdf = (name: string) => ({ name, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\nfixture-only\n%%EOF") });
async function capture(page: Page, info: TestInfo, name: string) {
  const directory = path.resolve(info.project.outputDir, "../deliverables"); await mkdir(directory, { recursive: true });
  const filename = `${baseline ? "before" : "after"}-${page.viewportSize()!.width}-${name}`;
  await page.screenshot({ path: path.join(directory, `${filename}-viewport.png`) });
  await page.screenshot({ path: path.join(directory, `${filename}-full.png`), fullPage: true });
}

test("regression: rejection preserves text, link and ready attachments", async ({ page }, info) => {
  const percent = page.viewportSize()!.width === 320 ? 200 : 100;
  await open(page, "pending", percent); await draft(page); await page.evaluate(() => { window.assignmentFixture.mode = "false"; });
  await inReview(page); await inConfirmation(page); await confirm(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "No pudimos confirmar" })).toBeVisible();
  await capture(page, info, `regression-text${percent}-rejection`); await layout(page);
  if (!baseline) { await expect(response(page)).toBeHidden(); await recover(page); }
  await expect(response(page)).toHaveValue(answer); await expect(urlField(page)).toHaveValue(link);
  await expect(page.getByRole("list", { name: "Archivos listos para entregar" })).toContainText("Observación de la planta");
  expect(await page.evaluate(() => window.assignmentFixture.calls)).toEqual([[
    ["assignmentId", "assignment-fixture"], ["assetIds", "pending-fixture"], ["content", answer], ["link", link],
  ]]);
  await info.attach("rejected-payload", { body: JSON.stringify(await page.evaluate(() => window.assignmentFixture.calls)), contentType: "application/json" });
});
test("regression: keyboard review and return retain meaningful focus", async ({ page }) => {
  await open(page); await draft(page); await reviewButton(page).focus(); await page.keyboard.press("Enter");
  await expect(review(page)).toBeVisible(); await focusedWithin(page, baseline ? '[role="alertdialog"]' : '[aria-label="Confirmación de la entrega"]');
  await page.keyboard.press("Escape"); await expect(reviewButton(page)).toBeFocused(); await expect(response(page)).toHaveValue(answer);
});
for (const percent of [100, 200]) test(`regression: text ${percent}% reflows the real page and included files`, async ({ page }, info) => {
  await open(page, "pending", percent); await draft(page);
  const directory = path.resolve(info.project.outputDir, "../deliverables"); await mkdir(directory, { recursive: true });
  const prefix = `${baseline ? "before" : "after"}-${page.viewportSize()!.width}-text${percent}`;
  await page.screenshot({ path: path.join(directory, `${prefix}-editor-viewport.png`) });
  await page.screenshot({ path: path.join(directory, `${prefix}-editor-full.png`), fullPage: true });
  const editor = await layout(page); await inReview(page); const reviewed = await layout(page);
  await page.screenshot({ path: path.join(directory, `${prefix}-review-full.png`), fullPage: true });
  await info.attach("layout", { body: JSON.stringify({ editor, reviewed }, null, 2), contentType: "application/json" });
});

test.describe("two-step delivery with a durable finished state", () => {
  test.skip(baseline, "Public 21b6b71 source remains available for the original behavior regressions.");
  for (const percent of [100, 200]) test(`two-step flow at text ${percent}% reviews once and finishes without restarting`, async ({ page }, info) => {
    await open(page, "long", percent); await progress(page, 1); await completed(page, []);
    await expect(page.getByRole("button", { name: /Ver guía|Salir de la guía|Repetir guía/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Lo que pide tu docente", exact: true })).toBeVisible();
    await expect(page.locator("form")).toHaveCount(1);
    expect(await page.getByRole("heading", { name: "Lo que pide tu docente", exact: true }).evaluate(heading =>
      Boolean(heading.compareDocumentPosition(document.querySelector('textarea[name="content"]')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    if (page.viewportSize()!.width === 1280) expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
    await capture(page, info, `text${percent}-intro`); await draft(page);
    await response(page).evaluate(element => { element.dataset.originalControl = "true"; });
    await capture(page, info, `text${percent}-preparation`); await layout(page);
    await inReview(page); await progress(page, 2); await completed(page, [1]);
    await expect(review(page)).toContainText(answer); await expect(review(page)).toContainText(link);
    await expect(review(page).locator("dl")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Continuar a entrega", exact: true })).toHaveCount(0);
    await expect(page.getByRole("alertdialog")).toHaveCount(0); await expect(response(page)).toBeHidden();
    await page.getByRole("button", { name: "Corregir respuesta", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Prepara tu respuesta", exact: true })).toBeFocused(); await progress(page, 1);
    await expect(response(page)).toHaveAttribute("data-original-control", "true"); await expect(response(page)).toHaveValue(answer);
    await expect(urlField(page)).toHaveValue(link); expect(await page.evaluate(() => window.assignmentFixture.calls)).toEqual([]);
    await inReview(page); await capture(page, info, `text${percent}-confirmation`); await layout(page);
    expect(await confirm(page).evaluate(button => Boolean(button.compareDocumentPosition(
      button.closest('section[aria-label="Confirmación de la entrega"]')!.querySelector("dl")!) & Node.DOCUMENT_POSITION_PRECEDING))).toBe(true);
    await page.evaluate(() => { window.assignmentFixture.mode = "hold"; }); await confirm(page).click();
    await progress(page, 2); await navigationLocked(page); await completed(page, [1]);
    await expect(confirmation(page).locator('button[type="submit"]')).toBeDisabled();
    await expect(confirmation(page).getByRole("heading", { name: "Entregando tu tarea", exact: true })).toBeInViewport();
    await expect(confirmation(page).getByRole("status")).toBeInViewport(); await expect(sentHeading(page)).toHaveCount(0);
    await capture(page, info, `text${percent}-pending`); await layout(page);
    expect(await page.evaluate(() => window.assignmentFixture.calls.length)).toBe(1);
    await page.evaluate(() => window.assignmentFixture.releaseSubmit({ ok: false, message: "No pudimos confirmar la entrega simulada." }));
    await expect(page.getByRole("alert")).toBeVisible(); await focusedWithin(page, '[role="alert"]');
    await progress(page, 2); await completed(page, [1]);
    await expect(page.getByRole("alert")).toContainText("Tu respuesta y tus archivos se conservan aquí.");
    await expect(response(page)).toBeHidden(); await expect(response(page)).toHaveValue(answer);
    await expect(sentHeading(page)).toHaveCount(0);
    const checkSaved = page.getByRole("link", { name: "Comprobar mi entrega en otra pestaña", exact: true });
    await expect(checkSaved).toHaveAttribute("href", "/dashboard/aula/course-fixture/tareas/assignment-fixture");
    await expect(checkSaved).toHaveAttribute("target", "_blank");
    await capture(page, info, `text${percent}-rejection`); await layout(page);
    await checkSaved.click(); expect(await page.evaluate(() => window.assignmentFixture.navigation)).toEqual([
      "/dashboard/aula/course-fixture/tareas/assignment-fixture",
    ]);
    await page.locator("form").evaluate((form: HTMLFormElement) => { form.requestSubmit(); form.requestSubmit(); });
    await expect(page.getByRole("alert")).toBeVisible(); expect(await page.evaluate(() => window.assignmentFixture.calls.length)).toBe(1);
    await recover(page); await progress(page, 1); await expect(response(page)).toHaveAttribute("data-original-control", "true");
    await expect(response(page)).toHaveValue(answer); await expect(urlField(page)).toHaveValue(link);
    await inReview(page); await confirm(page).click();
    await expect.poll(() => page.evaluate(() => window.assignmentFixture.calls.length)).toBe(2);
    await page.evaluate(() => window.assignmentFixture.releaseSubmit({ ok: true, message: "Tarea entregada. Tu docente podrá revisarla." }));
    await expect(sentHeading(page)).toBeFocused(); await finished(page);
    await expect(page.getByText("Tarea entregada. Tu docente podrá revisarla.", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tu respuesta enviada", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Entrega confirmada" })).toContainText(answer);
    await expect(page.getByRole("button", { name: /Ver guía|Salir de la guía|Repetir guía|Corregir respuesta/ })).toHaveCount(0);
    const calls = await page.evaluate(() => window.assignmentFixture.calls); expect(calls).toHaveLength(2); expect(calls[1]).toEqual(calls[0]);
    await capture(page, info, `text${percent}-success`); await layout(page);
    await page.locator("form").evaluate((form: HTMLFormElement) => form.requestSubmit());
    expect(await page.evaluate(() => window.assignmentFixture.calls.length)).toBe(2);
    await page.getByRole("link", { name: "Volver a mis tareas", exact: true }).click();
    expect(await page.evaluate(() => window.assignmentFixture.navigation)).toEqual([
      "/dashboard/aula/course-fixture/tareas/assignment-fixture", "/dashboard/aula/course-fixture/tareas",
    ]);
    await info.attach("confirmed-action", { body: JSON.stringify(calls), contentType: "application/json" });
    if (page.viewportSize()!.width === 1280) expect(await page.evaluate(() => document.getAnimations()
      .filter(animation => animation.playState === "running").length)).toBe(0);
  });
  test("saved submission survives reload and changes only through explicit edit and confirmation", async ({ page }, info) => {
    await open(page, "current"); await finished(page);
    await expect(page.getByRole("region", { name: "Entrega confirmada" })).toContainText("Mi planta tiene hojas verdes y necesita agua y luz.");
    await expect(page.getByRole("link", { name: "Descargar Observación anterior.pdf" })).toHaveAttribute("href", "/api/assets/current-fixture");
    await page.reload(); await expect(page.locator("[data-assignment-boundary]")).toHaveAttribute("data-hydrated", "true");
    await finished(page); expect(await page.evaluate(() => window.assignmentFixture.calls)).toEqual([]);
    await editSaved(page); await response(page).fill("Una modificación que se cancela.");
    await page.getByRole("button", { name: "Cancelar edición", exact: true }).click();
    await finished(page); await expect(sentHeading(page)).toBeFocused();
    await expect(page.getByRole("region", { name: "Entrega confirmada" })).not.toContainText("Una modificación que se cancela.");
    expect(await page.evaluate(() => window.assignmentFixture.calls)).toEqual([]);
    await editSaved(page); await expect(response(page)).toHaveValue("Mi planta tiene hojas verdes y necesita agua y luz.");
    await draft(page, false); await inReview(page);
    await expect(confirmation(page)).toContainText("Esta versión reemplaza la anterior.");
    expect(await page.evaluate(() => window.assignmentFixture.calls)).toEqual([]);
    await confirm(page, true).click(); await finished(page);
    await expect(page.getByRole("region", { name: "Entrega confirmada" })).toContainText(answer);
    expect(await page.evaluate(() => window.assignmentFixture.calls)).toHaveLength(1);
    await capture(page, info, "saved-submission-explicit-update");
  });
  test("@single cancelled editing keeps uploaded files and never restores a discarded pending file", async ({ page }) => {
    await open(page, "current"); await editSaved(page);
    await page.evaluate(() => window.assignmentFixture.updateProps({ pendingFiles: [{ id: "pending-fixture",
      name: "Pendiente para descartar.pdf", sizeBytes: 24012, url: "/api/assets/pending-fixture" }],
    }));
    await page.locator('input[type="file"]').setInputFiles(pdf("Conservar al reabrir.pdf"));
    const ready = page.getByRole("list", { name: "Archivos listos para entregar" });
    await expect(ready).toContainText("Conservar al reabrir.pdf");
    await page.getByRole("button", { name: "Quitar Pendiente para descartar.pdf", exact: true }).click();
    await expect(ready).not.toContainText("Pendiente para descartar.pdf");
    await page.getByRole("button", { name: "Cancelar edición", exact: true }).click(); await finished(page);
    await expect(page.getByRole("region", { name: "Entrega confirmada" })).not.toContainText("Conservar al reabrir.pdf");
    expect(await page.evaluate(() => window.assignmentFixture.calls)).toEqual([]);
    await editSaved(page); await expect(ready).toContainText("Conservar al reabrir.pdf");
    await expect(ready).not.toContainText("Pendiente para descartar.pdf");
    expect(await page.evaluate(() => window.assignmentFixture.requests.filter(item => item.method === "DELETE")))
      .toEqual([{ method: "DELETE", path: "/api/uploads/pending-fixture" }]);
    await inReview(page); await expect(confirmation(page)).not.toContainText("Pendiente para descartar.pdf");
    await confirm(page, true).click(); await finished(page);
    expect(await page.evaluate(() => window.assignmentFixture.calls[0].filter(([key]) => key === "assetIds")))
      .toEqual([["assetIds", "current-fixture"], ["assetIds", "uploaded-fixture-1"]]);
  });
  test("a rejected promise keeps the draft, focuses uncertainty and never retries automatically", async ({ page }) => {
    await open(page); await draft(page); await page.evaluate(() => { window.assignmentFixture.mode = "throw"; });
    await inReview(page); await inConfirmation(page); await confirm(page).click(); await expect(response(page)).toHaveValue(answer); await expect(urlField(page)).toHaveValue(link);
    await expect(page.getByRole("alert")).toBeVisible(); await focusedWithin(page, '[role="alert"]');
    await expect(sentHeading(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.assignmentFixture.calls.length)).toBe(1);
    await expect(page.getByRole("alert").locator("a")).toHaveAttribute("href", "/dashboard/aula/course-fixture/tareas/assignment-fixture");
    await expect(response(page)).toBeHidden(); await recover(page); await expect(response(page)).toHaveValue(answer);
  });
  test("real upload client retains a verified file after a later upload failure and excludes the failed file", async ({ page }) => {
    await open(page); await draft(page, false); await page.evaluate(() => { window.assignmentFixture.failedUploadName = "fallo.pdf"; });
    await page.locator('input[type="file"]').setInputFiles([pdf("planta.pdf"), pdf("fallo.pdf")]);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("list", { name: "Archivos listos para entregar" })).toContainText("planta.pdf");
    await expect(page.getByRole("list", { name: "Archivos listos para entregar" })).not.toContainText("fallo.pdf");
    await inReview(page); await inConfirmation(page); await confirm(page).click(); await expect(sentHeading(page)).toBeVisible();
    expect(await page.evaluate(() => window.assignmentFixture.calls[0].filter(([key]) => key === "assetIds")))
      .toEqual([["assetIds", "uploaded-fixture-1"]]);
    expect(await page.evaluate(() => window.assignmentFixture.requests.map(item => item.method)))
      .toEqual(["POST", "PUT", "PATCH", "POST", "PUT", "DELETE"]);
  });
  test("upload and removal promises lock review; failed removal keeps the attachment", async ({ page }) => {
    await open(page); await draft(page, false); await page.evaluate(() => { window.assignmentFixture.holdUpload = true; });
    await page.locator('input[type="file"]').setInputFiles(pdf("planta.pdf")); await expect(reviewButton(page)).toBeDisabled();
    await navigationLocked(page);
    expect(await page.evaluate(() => window.assignmentFixture.calls)).toEqual([]);
    await page.evaluate(() => window.assignmentFixture.releaseUpload());
    const remove = page.getByRole("button", { name: "Quitar planta.pdf", exact: true }); await expect(remove).toBeEnabled();
    await page.evaluate(() => { window.assignmentFixture.removeMode = "hold"; }); await remove.click();
    await expect(reviewButton(page)).toBeDisabled(); await expect(page.locator('input[type="file"]')).toBeDisabled();
    await navigationLocked(page);
    await page.evaluate(() => window.assignmentFixture.releaseRemove(false)); await expect(remove).toBeEnabled();
    await expect(page.getByRole("alert")).toContainText("No se pudo quitar");
    await inReview(page); await expect(review(page)).toContainText("planta.pdf");
  });
  test("resubmission excludes unchecked historical files and uses the existing update payload", async ({ page }, info) => {
    const percent = page.viewportSize()!.width === 320 ? 200 : 100;
    await open(page, "current", percent); await editSaved(page); await page.getByRole("checkbox", { name: /Incluir.*Observación anterior/ }).uncheck();
    await response(page).fill(answer); await inReview(page);
    await expect(review(page)).toContainText("Archivos incluidos (0)");
    await expect(review(page)).toContainText("Quedan en la entrega anterior");
    await expect(review(page)).toContainText("Observación anterior.pdf");
    await page.evaluate(() => { window.assignmentFixture.mode = "false"; }); await inConfirmation(page); await confirm(page, true).click();
    await expect(page.getByRole("alert")).toContainText("Puede aparecer tu entrega anterior aunque este intento no se haya guardado.");
    await expect(page.getByRole("link", { name: "Comprobar mi entrega en otra pestaña", exact: true }))
      .toHaveAttribute("href", "/dashboard/aula/course-fixture/tareas/assignment-fixture");
    await capture(page, info, `text${percent}-resubmission-rejection`); await layout(page);
    const sent = await page.evaluate(() => window.assignmentFixture.calls);
    expect(sent).toEqual([[["assignmentId", "assignment-fixture"], ["content", answer], ["link", ""]]]);
    await recover(page); await expect(response(page)).toHaveValue(answer);
    await expect(page.getByRole("checkbox", { name: /Incluir.*Observación anterior/ })).not.toBeChecked();
    await page.evaluate(() => { window.assignmentFixture.mode = "ok"; }); await inReview(page); await inConfirmation(page); await confirm(page, true).click();
    await expect(sentHeading(page)).toBeVisible();
    expect(await page.evaluate(() => window.assignmentFixture.calls)).toEqual([sent[0], sent[0]]);
    await expect(page.getByText("Entrega actualizada. Tu docente podrá revisarla.", { exact: true })).toBeVisible();
  });
  test("a permission change while the action waits retains its result without restarting the component", async ({ page }) => {
    await open(page); await draft(page, false); await page.evaluate(() => { window.assignmentFixture.mode = "hold"; });
    await inReview(page); await inConfirmation(page); await confirm(page).click();
    await page.evaluate(() => window.assignmentFixture.updateProps({ canSubmit: false }));
    await page.evaluate(() => window.assignmentFixture.releaseSubmit({ ok: true, message: "Tarea entregada. Tu docente podrá revisarla." }));
    await expect(sentHeading(page)).toBeVisible();
    expect(await page.evaluate(() => window.assignmentFixture.calls.length)).toBe(1);
  });
  test("switching the assignment key resets its draft; closing the same assignment preserves unsent work", async ({ page }) => {
    await open(page); await draft(page, false); await page.evaluate(() => window.assignmentFixture.updateProps({ canSubmit: false }));
    await page.getByText("Borrador conservado en esta pantalla", { exact: true }).click();
    await expect(page.locator("details[open]").getByText(answer, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.assignmentFixture.calls)).toEqual([]);
    await page.evaluate(() => window.assignmentFixture.updateProps({ canSubmit: true, assignmentId: "assignment-next-fixture" }));
    await expect(response(page)).toHaveValue("");
  });
  test("@single double submit, repeated Enter and a closed review never create another action", async ({ page }) => {
    await open(page); await draft(page, false); await inReview(page);
    await page.evaluate(() => { window.assignmentFixture.mode = "hold"; });
    await inConfirmation(page); await confirmation(page).locator('button[type="submit"]').evaluate((button: HTMLButtonElement) => {
      button.form!.requestSubmit(button); button.form!.requestSubmit(button);
    });
    await page.keyboard.press("Enter"); await page.keyboard.press("Enter");
    expect(await page.evaluate(() => window.assignmentFixture.calls.length)).toBe(1);
    await page.evaluate(() => window.assignmentFixture.releaseSubmit({ ok: true, message: "Confirmación simulada." }));
    await expect(sentHeading(page)).toBeFocused();
    await open(page); await draft(page, false); await inReview(page); await inConfirmation(page);
    await page.evaluate(() => window.assignmentFixture.updateProps({ canSubmit: false }));
    await expect(review(page)).toBeHidden(); await expect(confirmation(page)).toBeHidden();
    expect(await page.evaluate(() => window.assignmentFixture.calls)).toEqual([]);
  });
  test("@single empty and invalid HTTPS are blocked; link-only and file-only use the same action", async ({ page }) => {
    await open(page); await reviewButton(page).click(); await expect(page.getByRole("alert")).toBeVisible();
    await urlField(page).fill("http://example.test/insecure"); await reviewButton(page).click();
    await expect(review(page)).toHaveCount(0); expect(await urlField(page).evaluate((field: HTMLInputElement) => field.validity.valid)).toBe(false);
    expect(await page.evaluate(() => window.assignmentFixture.calls)).toEqual([]);
    for (const mode of ["link", "file"]) {
      await open(page); if (mode === "link") await urlField(page).fill(link);
      else await page.locator('input[type="file"]').setInputFiles(pdf("planta.pdf"));
      await inReview(page); await inConfirmation(page); await confirm(page).click(); await expect(sentHeading(page)).toBeVisible();
      const fields = await page.evaluate(() => window.assignmentFixture.calls[0]);
      expect(fields.find(([key]) => key === "content")?.[1]).toBe("");
      expect(fields.filter(([key]) => key === "assetIds")).toHaveLength(mode === "file" ? 1 : 0);
    }
  });
  test("@single permission closes in preparation, confirmation and rejection with visible focus and preserved draft", async ({ page }) => {
    for (const step of ["preparation", "confirmation", "rejection"]) {
      await open(page); await draft(page, false);
      if (step !== "preparation") await inReview(page);
      if (step === "confirmation") await inConfirmation(page);
      if (step === "rejection") {
        await page.evaluate(() => { window.assignmentFixture.mode = "false"; }); await inConfirmation(page); await confirm(page).click();
        await expect(page.getByRole("alert")).toBeVisible();
      }
      await page.evaluate(() => window.assignmentFixture.updateProps({ canSubmit: false }));
      await expect(response(page)).toBeHidden();
      const returnButton = page.getByRole("button", { name: "Volver a mi respuesta", exact: true });
      if (await returnButton.count()) await expect(returnButton).toBeDisabled();
      expect(await page.evaluate(() => document.activeElement !== document.body
        && Boolean(document.activeElement?.getClientRects().length))).toBe(true);
      await page.getByText("Borrador conservado en esta pantalla", { exact: true }).click();
      await expect(page.locator("details[open]").getByText(answer, { exact: true })).toBeVisible();
      expect(await page.evaluate(() => window.assignmentFixture.calls.length)).toBe(step === "rejection" ? 1 : 0);
    }
  });
  for (const result of ["false", "true", "throw"]) for (const order of ["before", "during", "after"]) {
    test(`@single revalidated props ${order} action ${result} preserve the confirmed draft snapshot`, async ({ page }) => {
      const ok = result === "true";
      await open(page); await draft(page); const update = () => page.evaluate(() => window.assignmentFixture.updateProps({
        content: "Contenido anterior releído del servidor", link: "https://example.test/anterior",
        currentFiles: [{ id: "server-fixture", name: "Trabajo releído.pdf", sizeBytes: 24012, url: "/api/assets/server-fixture" }],
      }));
      if (order === "before") await update();
      await page.evaluate(() => { window.assignmentFixture.mode = "hold"; }); await inReview(page); await inConfirmation(page); await confirm(page).click();
      if (order === "during") await update();
      await page.evaluate(value => value === "throw" ? window.assignmentFixture.rejectSubmit()
        : window.assignmentFixture.releaseSubmit({ ok: value === "true", message: "Respuesta simulada." }), result);
      if (ok) await expect(sentHeading(page)).toBeVisible();
      else await expect(page.getByRole("alert")).toBeVisible();
      if (order === "after") await update();
      const fields = await page.evaluate(() => window.assignmentFixture.calls[0]);
      expect(fields.find(([key]) => key === "content")?.[1]).toBe(answer); expect(fields.find(([key]) => key === "link")?.[1]).toBe(link);
      expect(fields.filter(([key]) => key === "assetIds")).toEqual(order === "before" ? [["assetIds", "server-fixture"]] : []);
      if (!ok) { await expect(response(page)).toHaveValue(answer); await expect(urlField(page)).toHaveValue(link); }
      else await expect(response(page)).toBeHidden();
    });
  }
  test("@single native step buttons support tap, Tab, Enter, Space and Escape without sending", async ({ page }, info) => {
    await open(page, "long", 200); await draft(page); await response(page).evaluate(element => { element.dataset.navigationDraft = "same"; });
    expect(await page.evaluate(() => navigator.maxTouchPoints)).toBeGreaterThan(0);
    for (const index of [1, 2]) await expect(step(page, index)).toHaveAttribute("type", "button");
    await step(page, 1).focus(); await page.keyboard.press("Tab"); await expect(step(page, 2)).toBeFocused();
    expect(await step(page, 2).evaluate(button => button.matches(":focus-visible"))).toBe(true);
    await capture(page, info, "text200-navigation-keyboard-focus");
    await page.keyboard.press("Space"); await expect(confirmation(page)).toBeVisible(); await completed(page, [1]);
    await step(page, 1).tap(); await progress(page, 1);
    await completed(page, [1]); await expect(response(page)).toHaveAttribute("data-navigation-draft", "same");
    await expect(response(page)).toHaveValue(answer); await expect(urlField(page)).toHaveValue(link);
    await response(page).fill(answer); await urlField(page).fill(link); await completed(page, [1]);
    await capture(page, info, "text200-navigation-preserved-checks"); await layout(page);
    await step(page, 2).focus(); await page.keyboard.press("Enter"); await expect(confirmation(page)).toBeVisible();
    await page.keyboard.press("Escape"); await expect(reviewButton(page)).toBeFocused();
    await completed(page, [1]); await step(page, 2).tap(); await expect(confirmation(page)).toBeVisible();
    expect(await page.evaluate(() => window.assignmentFixture.calls)).toEqual([]);
  });
  for (const mutation of ["text", "link", "add", "remove", "exclude"]) {
    test(`@single ${mutation} requires reviewing the current payload even when an edit is undone`, async ({ page }) => {
      await open(page, mutation === "exclude" ? "current" : mutation === "remove" ? "pending" : "new");
      if (mutation === "exclude") await editSaved(page);
      await draft(page); await inReview(page); await completed(page, [1]);
      await step(page, 1).click(); await completed(page, [1]);
      if (mutation === "text") { await response(page).fill(answer + " Otra observación."); await response(page).fill(answer); }
      if (mutation === "link") { await urlField(page).fill(link + "?version=2"); await urlField(page).fill(link); }
      if (mutation === "add") {
        await page.locator('input[type="file"]').setInputFiles(pdf("Nueva observación.pdf"));
        await expect(page.getByRole("list", { name: "Archivos listos para entregar" })).toContainText("Nueva observación.pdf");
      }
      if (mutation === "remove") {
        await page.getByRole("button", { name: /^Quitar Observación de la planta/ }).click();
        await expect(page.getByRole("list", { name: "Archivos listos para entregar" })).toHaveCount(0);
      }
      if (mutation === "exclude") {
        const include = page.getByRole("checkbox", { name: /Incluir.*Observación anterior/ }); await include.uncheck(); await include.check();
      }
      await completed(page, []); await step(page, 2).click(); await expect(confirmation(page)).toBeVisible(); await completed(page, [1]);
      await expect(confirmation(page)).toContainText(answer); await expect(confirmation(page)).toContainText(link);
      expect(await page.evaluate(() => window.assignmentFixture.calls)).toEqual([]);
      await confirm(page, mutation === "exclude").click(); await finished(page);
      const sent = await page.evaluate(() => window.assignmentFixture.calls);
      expect(sent).toHaveLength(1); expect(sent[0].find(([key]) => key === "content")?.[1]).toBe(answer);
      expect(sent[0].find(([key]) => key === "link")?.[1]).toBe(link);
      expect(sent[0].filter(([key]) => key === "assetIds")).toEqual(mutation === "add" ? [["assetIds", "uploaded-fixture-1"]]
        : mutation === "exclude" ? [["assetIds", "current-fixture"]] : []);
    });
  }
  test("@single jumping to confirmation validates the draft without sending it", async ({ page }, info) => {
    await open(page); await step(page, 2).click(); await expect(page.getByRole("alert")).toBeVisible();
    await expect(response(page)).toBeVisible(); await completed(page, []);
    await urlField(page).fill("http://example.test/insecure"); await step(page, 2).click();
    expect(await urlField(page).evaluate((field: HTMLInputElement) => field.validity.valid)).toBe(false);
    await expect(confirmation(page)).toHaveCount(0); await draft(page); await step(page, 2).click();
    await expect(confirmation(page)).toBeVisible(); await completed(page, [1]);
    await expect(confirmation(page)).toContainText(answer); await expect(confirmation(page)).toContainText(link);
    await capture(page, info, "text100-direct-confirmation"); await layout(page);
    expect(await page.evaluate(() => window.assignmentFixture.calls)).toEqual([]);
  });
  test("@single equivalent URLs preserve review and changed server files require checking the new payload", async ({ page }) => {
    await open(page, "current"); await editSaved(page); await draft(page); await inReview(page);
    await page.evaluate(() => window.assignmentFixture.updateProps({ currentFiles: [{ id: "current-fixture",
      name: "Observación anterior.pdf", sizeBytes: 24012, url: "/api/assets/current-fixture?signature=refreshed" }],
    }));
    await completed(page, [1]); await expect(confirm(page, true)).toBeEnabled();
    await page.evaluate(() => window.assignmentFixture.updateProps({
      currentFiles: [{ id: "server-fixture", name: "Trabajo releído.pdf", sizeBytes: 24012, url: "/api/assets/server-fixture" }],
    }));
    await completed(page, []); await expect(confirmation(page).locator('button[type="submit"]')).toHaveCount(0);
    await expect(confirmation(page).getByRole("status")).toHaveText("Hay cambios. Revísalos antes de entregar.");
    await page.getByRole("button", { name: "Revisar cambios", exact: true }).click();
    await expect(confirmation(page)).toContainText("Trabajo releído.pdf"); await expect(confirmation(page)).toContainText(answer);
    await page.evaluate(() => window.assignmentFixture.updateProps({ currentFiles: [{ id: "server-next-fixture",
      name: "Trabajo actualizado durante la revisión.pdf", sizeBytes: 24012, url: "/api/assets/server-next-fixture" }],
    }));
    await completed(page, []); await expect(confirmation(page)).not.toContainText("Trabajo actualizado durante la revisión.pdf");
    await expect(confirmation(page).locator('button[type="submit"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Revisar cambios", exact: true }).click();
    await completed(page, [1]); await expect(confirmation(page)).toContainText("Trabajo actualizado durante la revisión.pdf");
    expect(await page.evaluate(() => window.assignmentFixture.calls)).toEqual([]);
    await confirm(page, true).click(); await finished(page);
    expect(await page.evaluate(() => window.assignmentFixture.calls[0].filter(([key]) => key === "assetIds")))
      .toEqual([["assetIds", "server-next-fixture"]]);
  });
  for (const result of ["false", "throw"] as const) test(`@single ${result} requires explicit review and confirmation before retry`, async ({ page }) => {
    await open(page); await draft(page); await inReview(page);
    await page.evaluate(mode => { window.assignmentFixture.mode = mode; }, result); await confirm(page).click();
    await expect(page.getByRole("alert")).toBeVisible(); await completed(page, [1]);
    await page.locator("form").evaluate((form: HTMLFormElement) => { form.requestSubmit(); form.requestSubmit(); });
    expect(await page.evaluate(() => window.assignmentFixture.calls.length)).toBe(1);
    await step(page, 1).click(); await expect(response(page)).toHaveValue(answer);
    await expect(urlField(page)).toHaveValue(link); expect(await page.evaluate(() => window.assignmentFixture.calls.length)).toBe(1);
    await step(page, 2).click(); await expect(confirmation(page)).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0); await expect(confirm(page)).toBeEnabled();
    expect(await page.evaluate(() => window.assignmentFixture.calls.length)).toBe(1);
    await page.evaluate(() => { window.assignmentFixture.mode = "ok"; }); await confirm(page).click();
    await finished(page); expect(await page.evaluate(() => window.assignmentFixture.calls.length)).toBe(2);
  });
  test("@single computed borders, text and keyboard focus retain contrast", async ({ page }, info) => {
    await open(page); await response(page).focus(); await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab");
    await expect(response(page)).toBeFocused();
    expect(await response(page).evaluate(element => element.matches(":focus-visible"))).toBe(true);
    const contrast = await page.evaluate(() => window.assignmentFixture.measureContrast());
    expect(contrast.borders).toHaveLength(2); expect(Math.min(...contrast.borders)).toBeGreaterThanOrEqual(3);
    expect(Math.min(...contrast.text)).toBeGreaterThanOrEqual(4.5); expect(contrast.focus).toBeGreaterThanOrEqual(3);
    await info.attach("computed-contrast", { body: JSON.stringify(contrast), contentType: "application/json" });
    await draft(page, false); await inReview(page); await inConfirmation(page); await completed(page, [1]);
    await step(page, 2).focus(); await page.keyboard.press("Shift+Tab"); await expect(step(page, 1)).toBeFocused();
    expect(await step(page, 1).evaluate(button => button.matches(":focus-visible"))).toBe(true);
    const green = await page.evaluate(() => window.assignmentFixture.measureContrast());
    expect(Math.min(...green.text)).toBeGreaterThanOrEqual(4.5); expect(green.focus).toBeGreaterThanOrEqual(3);
    await info.attach("completed-step-contrast", { body: JSON.stringify(green), contentType: "application/json" });
  });
  for (const scene of ["linked", "graded", "closed"]) test(`${scene}: read-only restrictions stay visible at text 200%`, async ({ page }, info) => {
    await open(page, scene, 200); await layout(page);
    if (scene !== "closed") {
      await finished(page);
      await expect(page.getByRole("button", { name: "Editar entrega", exact: true })).toHaveCount(0);
      const inspect = page.getByRole("link", { name: "Revisar entrega", exact: true });
      const target = await inspect.getAttribute("href"); expect(target).toMatch(/^#/);
      expect(await inspect.evaluate(anchor => document.getElementById(anchor.getAttribute("href")!.slice(1))?.textContent))
        .toBe("Tu respuesta enviada");
      await inspect.click(); await finished(page);
      expect(await page.evaluate(() => window.assignmentFixture.navigation)).toEqual([target]);
    } else await expect(sentHeading(page)).toHaveCount(0);
    await expect(page.getByText(scene === "graded" ? "Tu docente ya calificó esta entrega."
      : scene === "linked" ? "Esta entrega incluye un enlace y no se puede reemplazar." : "La tarea está cerrada.", { exact: true })).toBeVisible();
    await capture(page, info, `text200-${scene}`);
    await expect(page.locator('input[type="file"]:visible,textarea:visible:not([readonly])')).toHaveCount(0);
    expect(await page.evaluate(() => window.assignmentFixture.calls)).toEqual([]);
  });
});
