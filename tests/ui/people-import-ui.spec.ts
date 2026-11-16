import { test, expect, type Page } from "@playwright/test";
import type { ImportCall } from "./people-import-fixture";

const csv = "Nombre,Correo\nAna Nueva,ana@example.invalid\nJuan Nuevo,juan@example.invalid\n" +
  "Persona Existente,existe@example.invalid\nFila Inválida,sin-correo\n";
const calls = (page: Page): Promise<ImportCall[]> => page.evaluate(() => window.peopleImportFixture.calls);
const file = (page: Page) => page.getByLabel("Archivo CSV", { exact: true });
const review = (page: Page) => page.getByRole("button", { name: "Revisar archivo", exact: true });
const create = (page: Page) => page.getByRole("button", { name: /^Crear \d+ persona/ });
const reviewHeading = (page: Page) => page.getByRole("heading", { name: "Revisar importación", exact: true });
const doneHeading = (page: Page) => page.getByRole("heading", { name: "Importación completada", exact: true });
let errors: string[];
async function choose(page: Page, name = "personas.csv", content = csv) {
  await file(page).setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(content) });
}
async function preview(page: Page) {
  await choose(page); await review(page).click(); await expect(reviewHeading(page)).toBeVisible();
}
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => route.request().url().startsWith("http://127.0.0.1:3149/")
    ? route.continue() : route.abort("blockedbyclient"));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Importación de personas: componentes reales" })).toBeVisible();
});
test.afterEach(() => { expect(errors, "No uncaught errors in the real client component").toEqual([]); });

test("revisar no crea; Escape cancela y devuelve el foco sin perder el archivo", async ({ page }) => {
  await preview(page);
  await expect(reviewHeading(page)).toBeFocused();
  expect((await calls(page)).map((call) => call.confirm)).toEqual([false]);
  await page.keyboard.press("Escape");
  await expect(reviewHeading(page)).toHaveCount(0);
  await expect(review(page)).toBeFocused();
  expect(await file(page).evaluate((input: HTMLInputElement) => input.files?.[0]?.name)).toBe("personas.csv");
  expect((await calls(page)).map((call) => call.confirm)).toEqual([false]);
});

test("doble revisión y doble confirmación ejecutan una vez cada fase y confirman sólo el archivo revisado", async ({ page }) => {
  await choose(page);
  await page.evaluate(() => { window.peopleImportFixture.delay = 250; });
  await review(page).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(reviewHeading(page)).toBeVisible();
  expect((await calls(page)).map((call) => call.confirm)).toEqual([false]);
  await create(page).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(file(page)).toBeDisabled();
  await expect(doneHeading(page)).toBeFocused();
  const recorded = await calls(page);
  expect(recorded.map((call) => call.confirm)).toEqual([false, true]);
  expect(recorded.map((call) => [call.name, call.content])).toEqual([["personas.csv", csv], ["personas.csv", csv]]);
  expect(await page.evaluate(() => window.peopleImportFixture.refreshes)).toBe(1);
});

test("elegir otro archivo con el mismo nombre invalida la revisión anterior antes de poder crear", async ({ page }) => {
  await preview(page);
  const changed = "Nombre,Correo\nArchivo Distinto,distinto@example.invalid\n";
  await choose(page, "personas.csv", changed);
  await expect(reviewHeading(page)).toHaveCount(0);
  await expect(create(page)).toHaveCount(0);
  await review(page).click();
  await expect(reviewHeading(page)).toBeVisible();
  await create(page).click();
  await expect(doneHeading(page)).toBeVisible();
  const recorded = await calls(page);
  expect(recorded.map((call) => call.confirm)).toEqual([false, false, true]);
  expect(recorded.at(-1)?.content).toBe(changed);
});

test("respuesta tardía de una revisión cancelada no restaura una confirmación obsoleta", async ({ page }) => {
  await choose(page);
  await page.evaluate(() => { window.peopleImportFixture.delay = 600; });
  await review(page).click();
  await expect.poll(async () => (await calls(page)).length).toBe(1);
  await choose(page, "nuevo.csv", "Nombre,Correo\nPersona Nueva,nueva@example.invalid\n");
  await page.evaluate(() => { window.peopleImportFixture.delay = 0; window.peopleImportFixture.toCreate = 0; });
  await review(page).click();
  await expect(reviewHeading(page)).toBeVisible();
  await expect(create(page)).toHaveText("Crear 0 personas");
  await expect.poll(async () => (await calls(page))[0].completed).toBe(true);
  await expect(create(page)).toHaveText("Crear 0 personas");
  await expect(create(page)).toBeDisabled();
  expect((await calls(page)).map((call) => call.confirm)).toEqual([false, false]);
});

for (const transport of [false, true]) {
  test(`fallo ${transport ? "de transporte" : "del servidor"} al revisar conserva archivo y permite nueva revisión`, async ({ page }) => {
    await choose(page);
    await page.evaluate((value) => {
      if (value) window.peopleImportFixture.throwPhase = "preview";
      else window.peopleImportFixture.failPhase = "preview";
    }, transport);
    await review(page).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(create(page)).toHaveCount(0);
    expect(await file(page).evaluate((input: HTMLInputElement) => input.files?.[0]?.name)).toBe("personas.csv");
    await page.evaluate(() => { window.peopleImportFixture.throwPhase = null; window.peopleImportFixture.failPhase = null; });
    await review(page).click();
    await expect(reviewHeading(page)).toBeVisible();
    expect((await calls(page)).map((call) => call.confirm)).toEqual([false, false]);
  });

  test(`fallo ${transport ? "de transporte" : "del servidor"} al crear informa posible parcial y exige revisar antes de reintentar`,
    async ({ page }) => {
      await preview(page);
      await page.evaluate((value) => {
        if (value) window.peopleImportFixture.throwPhase = "confirm";
        else window.peopleImportFixture.failPhase = "confirm";
      }, transport);
      await create(page).click();
      await expect(page.getByRole("alert")).toContainText("La importación pudo crear algunas personas");
      await expect(page.getByRole("alert")).toContainText("Vuelve a revisar este archivo antes de intentar de nuevo");
      await expect(reviewHeading(page)).toHaveCount(0);
      await expect(create(page)).toHaveCount(0);
      await expect(doneHeading(page)).toHaveCount(0);
      expect(await file(page).evaluate((input: HTMLInputElement) => input.files?.[0]?.name)).toBe("personas.csv");
      await page.evaluate(() => { window.peopleImportFixture.throwPhase = null; window.peopleImportFixture.failPhase = null; });
      await review(page).click();
      await expect(reviewHeading(page)).toBeVisible();
      await create(page).click();
      await expect(doneHeading(page)).toBeVisible();
      expect((await calls(page)).map((call) => call.confirm)).toEqual([false, true, false, true]);
    });
}

test("una creación incierta conserva su advertencia hasta reconciliar y refresca pendientes aunque no queden filas nuevas",
  async ({ page }) => {
    await preview(page);
    await page.evaluate(() => { window.peopleImportFixture.throwPhase = "confirm"; });
    await create(page).click();
    const warning = page.getByText("La importación pudo crear algunas personas. Vuelve a revisar este archivo antes de intentar de nuevo.");
    await expect(warning).toBeVisible();
    await page.evaluate(() => { window.peopleImportFixture.throwPhase = "preview"; });
    await review(page).click();
    await expect(page.getByRole("alert")).toContainText("La importación pudo crear algunas personas");
    await page.evaluate(() => { window.peopleImportFixture.delay = 600; });
    await review(page).click();
    await expect.poll(async () => (await calls(page)).length).toBe(4);
    await page.getByRole("button", { name: "Cancelar revisión" }).click();
    await expect(warning).toBeVisible();
    await expect(review(page)).toBeFocused();
    await page.evaluate(() => {
      window.peopleImportFixture.throwPhase = null;
      window.peopleImportFixture.delay = 0;
      window.peopleImportFixture.toCreate = 0;
      window.peopleImportFixture.alreadyExisted = 3;
    });
    await review(page).click();
    await expect(reviewHeading(page)).toBeVisible();
    await expect(create(page)).toHaveText("Crear 0 personas");
    await expect(create(page)).toBeDisabled();
    await expect(warning).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.peopleImportFixture.refreshes)).toBe(1);
    await expect.poll(async () => (await calls(page))[3].completed).toBe(true);
    expect((await calls(page)).map((call) => call.confirm)).toEqual([false, true, false, false, false]);
    expect(await page.evaluate(() => window.peopleImportFixture.refreshes)).toBe(1);
  });

test("resultado conserva informe de errores y empezar otro archivo limpia y enfoca el selector", async ({ page }) => {
  await preview(page);
  await page.getByText(/^Ver errores/).click();
  await expect(page.getByText(/Fila 5/)).toBeVisible();
  const download = page.getByRole("link", { name: "Descargar informe de errores" });
  const href = await download.getAttribute("href");
  expect(decodeURIComponent(href!.split(",").slice(1).join(","))).toContain("Fila Inválida,sin-correo");
  await create(page).click();
  await expect(doneHeading(page)).toBeVisible();
  if (!(await download.isVisible())) await page.getByText(/^Ver errores/).click();
  await expect(page.getByRole("link", { name: "Descargar informe de errores" })).toBeVisible();
  await page.getByRole("button", { name: "Importar otro archivo" }).click();
  await expect(file(page)).toBeFocused();
  expect(await file(page).evaluate((input: HTMLInputElement) => input.files?.length)).toBe(0);
  await expect(doneHeading(page)).toHaveCount(0);
  await expect(create(page)).toHaveCount(0);
});

test("cero personas nuevas conserva el resumen y bloquea la creación", async ({ page }) => {
  await page.evaluate(() => { window.peopleImportFixture.toCreate = 0; });
  await preview(page);
  await expect(create(page)).toBeDisabled();
  await expect(page.getByText(/No hay personas nuevas/)).toBeVisible();
  await page.getByRole("button", { name: "Cancelar revisión" }).click();
  await expect(review(page)).toBeFocused();
  expect((await calls(page)).map((call) => call.confirm)).toEqual([false]);
});

test("archivo sin elegir no ejecuta la acción y explica cómo seguir", async ({ page }) => {
  await review(page).click();
  await expect(page.getByRole("alert")).toContainText(/Elige.*archivo CSV/);
  expect(await calls(page)).toEqual([]);
});

test("360/1280: revisión, errores largos y controles no desbordan el viewport", async ({ page }, info) => {
  const name = `${"nombre-muy-largo-".repeat(18)}.csv`;
  await page.evaluate(() => {
    window.peopleImportFixture.sampleErrors = [{ line: 5, field: "Correo", message: "Error".repeat(100) }];
  });
  await choose(page, name);
  await review(page).click();
  await expect(reviewHeading(page)).toBeVisible();
  await page.getByText(/^Ver errores/).click();
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
  const undersized = await page.locator('button:visible, input[type="file"]:visible, summary:visible')
    .evaluateAll((controls) => controls.filter((control) => control.getBoundingClientRect().height < 44)
      .map((control) => control.textContent || control.tagName));
  expect(undersized).toEqual([]);
  await page.screenshot({ path: info.outputPath("importacion-revision.png"), fullPage: true });
  await info.attach("ImportPeople real con archivo ficticio y estilos de la app", {
    path: info.outputPath("importacion-revision.png"), contentType: "image/png",
  });
});
