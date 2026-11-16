import { test, expect, type Page, type TestInfo } from "@playwright/test";
import type { EnrollmentCall } from "./enrollment-fixture";

const calls = (page: Page): Promise<EnrollmentCall[]> => page.evaluate(() => window.enrollmentFixture.calls);
const search = (page: Page) => page.getByLabel("Busca por nombre o correo");
const studentA = (page: Page) => page.getByRole("checkbox", { name: /Ana Ejemplo/ });
const writes = async (page: Page) => (await calls(page)).filter((call) => call.action !== "search");
const individualReview = (page: Page) => page.getByRole("alertdialog", { name: "Confirmar inscripción", exact: true });
let errors: string[];
async function evidence(page: Page, info: TestInfo) {
  await info.attach("Componente real y acciones simuladas", { contentType: "application/json", body: JSON.stringify({
    calls: await calls(page), pageErrors: errors,
    boundaryErrors: await page.evaluate(() => window.enrollmentFixture.boundaryErrors),
    visibleText: await page.locator("main").innerText(),
  }) });
}
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => route.request().url().startsWith("http://127.0.0.1:3151/")
    ? route.continue() : route.abort("blockedbyclient"));
});
test.afterEach(async ({ page }) => {
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.enrollmentFixture.boundaryErrors)).toEqual([]);
});

test("transporte de búsqueda produce un error recuperable dentro del panel", async ({ page }, info) => {
  await page.goto("/?throw=search");
  await expect.poll(async () => (await calls(page)).some((call) => call.action === "search" && call.completed)).toBe(true);
  await evidence(page, info);
  await expect(page.getByRole("alert")).toContainText(/búsqueda|buscar|conexión/i);
  await expect(page.getByRole("alert")).toBeFocused();
  await expect(search(page)).toBeVisible();
  await page.evaluate(() => { window.enrollmentFixture.throwAction = null; });
  await page.getByRole("button", { name: "Reintentar búsqueda", exact: true }).click();
  await expect(studentA(page)).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("transporte de matrícula individual mantiene selección y confirmación sin escalar a boundary", async ({ page }, info) => {
  await page.goto("/");
  await search(page).fill("Ana");
  await studentA(page).check();
  await page.getByRole("button", { name: "Continuar con 1 estudiante", exact: true }).click();
  await page.evaluate(() => { window.enrollmentFixture.throwAction = "students"; });
  await page.getByRole("button", { name: "Sí, inscribir a 1 estudiante", exact: true }).click();
  await expect.poll(async () => (await calls(page)).some((call) => call.action === "students" && call.completed)).toBe(true);
  await evidence(page, info);
  await expect(page.getByTestId("fixture-error-boundary")).toHaveCount(0);
  await expect(page.getByRole("alertdialog", { name: "Confirmar inscripción", exact: true })).toContainText("Ana Ejemplo");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("alert")).toBeFocused();
  await page.getByRole("button", { name: "Volver a elegir", exact: true }).click();
  await expect(search(page)).toHaveValue("Ana");
  await expect(studentA(page)).toBeChecked();
  expect((await writes(page)).length).toBe(1);
  expect(await page.evaluate(() => window.enrollmentFixture.refreshes)).toBe(1);
  expect(await page.evaluate(() => window.enrollmentFixture.boundaryErrors)).toEqual([]);
});

test("transporte de matrícula de grupo mantiene groupId y confirmación sin escalar a boundary", async ({ page }, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Inscribir un grupo completo", exact: true }).click();
  await page.getByLabel("Grupo", { exact: true }).selectOption("group-b");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.evaluate(() => { window.enrollmentFixture.throwAction = "group"; });
  await page.getByRole("button", { name: "Sí, inscribir al grupo", exact: true }).click();
  await expect.poll(async () => (await calls(page)).some((call) => call.action === "group" && call.completed)).toBe(true);
  await evidence(page, info);
  await expect(page.getByTestId("fixture-error-boundary")).toHaveCount(0);
  await expect(page.getByLabel("Grupo", { exact: true })).toHaveValue("group-b");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("alertdialog", { name: "Confirmar inscripción del grupo", exact: true })).toContainText("Grupo B");
  await expect(page.getByRole("alert")).toBeFocused();
  expect((await writes(page)).length).toBe(1);
  expect(await page.evaluate(() => window.enrollmentFixture.refreshes)).toBe(1);
  expect(await page.evaluate(() => window.enrollmentFixture.boundaryErrors)).toEqual([]);
});

test("escritura en curso bloquea cerrar y cambiar de modo", async ({ page }, info) => {
  await page.goto("/");
  await studentA(page).check();
  await page.getByRole("button", { name: "Continuar con 1 estudiante", exact: true }).click();
  await page.evaluate(() => { window.enrollmentFixture.delay = 1500; });
  await page.getByRole("button", { name: "Sí, inscribir a 1 estudiante", exact: true }).click();
  await expect.poll(async () => (await calls(page)).some((call) => call.action === "students")).toBe(true);
  await evidence(page, info);
  await expect(page.getByRole("button", { name: "Cerrar", exact: true })).toBeDisabled({ timeout: 500 });
  await expect(page.getByRole("button", { name: "Inscribir un grupo completo", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Elegir estudiantes", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Inscribir estudiantes", exact: true })).toBeVisible();
});

test("error de búsqueda devuelto por el servidor conserva consulta y selección al reintentar", async ({ page }) => {
  await page.goto("/");
  await studentA(page).check();
  await page.evaluate(() => { window.enrollmentFixture.failAction = "search"; });
  await search(page).fill("Beto");
  await expect(page.getByRole("alert")).toContainText("La búsqueda simulada fue rechazada");
  await expect(search(page)).toHaveValue("Beto");
  await expect(page.getByRole("button", { name: "Continuar con 1 estudiante", exact: true })).toBeEnabled();
  await page.evaluate(() => { window.enrollmentFixture.failAction = null; });
  await page.getByRole("button", { name: "Reintentar búsqueda", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /Beto Ejemplo/ })).toBeVisible();
  await page.getByRole("button", { name: "Continuar con 1 estudiante", exact: true }).click();
  await expect(individualReview(page)).toContainText("Ana Ejemplo");
  expect(await writes(page)).toEqual([]);
});

test("respuesta de búsqueda vieja no sustituye resultados de una consulta más reciente", async ({ page }) => {
  await page.goto("/");
  await expect(studentA(page)).toBeVisible();
  await page.evaluate(() => { window.enrollmentFixture.searchDelayByQuery.Ana = 900; });
  await search(page).fill("Ana");
  await expect.poll(async () => (await calls(page)).some((call) => call.query === "Ana")).toBe(true);
  await search(page).fill("Beto");
  await expect(page.getByRole("checkbox", { name: /Beto Ejemplo/ })).toBeVisible();
  await expect.poll(async () => (await calls(page)).some((call) => call.query === "Ana" && call.completed)).toBe(true);
  await expect(studentA(page)).toHaveCount(0);
  await expect(search(page)).toHaveValue("Beto");
});

test("cerrar durante una búsqueda descarta su respuesta y reabrir crea una consulta limpia", async ({ page }) => {
  await page.goto("/");
  await expect(studentA(page)).toBeVisible();
  await page.evaluate(() => {
    window.enrollmentFixture.searchDelayByQuery.Ana = 900;
    window.enrollmentFixture.throwAction = "search";
  });
  await search(page).fill("Ana");
  await expect.poll(async () => (await calls(page)).some((call) => call.query === "Ana")).toBe(true);
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Inscribir estudiantes", exact: true })).toBeFocused();
  await page.evaluate(() => { window.enrollmentFixture.throwAction = null; });
  await page.getByRole("button", { name: "Inscribir estudiantes", exact: true }).click();
  await expect(search(page)).toHaveValue("");
  await expect(page.getByRole("checkbox", { name: /Beto Ejemplo/ })).toBeVisible();
  await expect.poll(async () => (await calls(page)).some((call) => call.query === "Ana" && call.completed)).toBe(true);
  await expect(search(page)).toHaveValue("");
  await expect(page.getByRole("checkbox", { name: /Beto Ejemplo/ })).toBeVisible();
  expect(await writes(page)).toEqual([]);
});

for (const mode of ["students", "group"] as const) {
  test(`${mode}: revisar y cancelar no escribe, el rechazo conserva selección y sólo el clic explícito reintenta`, async ({ page }) => {
    await page.goto("/");
    if (mode === "students") {
      await studentA(page).check();
      await page.getByRole("button", { name: "Continuar con 1 estudiante", exact: true }).click();
      await page.getByRole("button", { name: "Volver a elegir", exact: true }).click();
      await expect(studentA(page)).toBeChecked();
      await page.getByRole("button", { name: "Continuar con 1 estudiante", exact: true }).click();
    } else {
      await page.getByRole("button", { name: "Inscribir un grupo completo", exact: true }).click();
      await page.getByLabel("Grupo", { exact: true }).selectOption("group-b");
      await page.getByRole("button", { name: "Continuar", exact: true }).click();
      await page.getByRole("button", { name: "Cancelar", exact: true }).click();
      await expect(page.getByLabel("Grupo", { exact: true })).toHaveValue("group-b");
      await page.getByRole("button", { name: "Continuar", exact: true }).click();
    }
    expect(await writes(page)).toEqual([]);
    await page.evaluate((action) => { window.enrollmentFixture.failAction = action; }, mode);
    const confirm = page.getByRole("button", {
      name: mode === "students" ? "Sí, inscribir a 1 estudiante" : "Sí, inscribir al grupo", exact: true,
    });
    await confirm.click();
    await expect(page.getByRole("alert")).toContainText("Inscripción simulada rechazada");
    expect((await writes(page)).length).toBe(1);
    expect(await page.evaluate(() => window.enrollmentFixture.refreshes)).toBe(1);
    await page.evaluate(() => { window.enrollmentFixture.failAction = null; });
    await confirm.click();
    await expect(page.getByRole("status")).toContainText("Inscripción simulada completada");
    expect((await writes(page)).length).toBe(2);
    const expected = mode === "students" ? ["studentIds", "student-a"] : ["groupId", "group-b"];
    for (const call of await writes(page)) expect(call.fields).toContainEqual(expected);
    expect(await page.evaluate(() => window.enrollmentFixture.refreshes)).toBe(2);
  });

  test(`${mode}: doble confirmación no duplica y la escritura bloquea los controles de salida`, async ({ page }) => {
    await page.goto("/");
    if (mode === "students") {
      await studentA(page).check();
      await page.getByRole("button", { name: "Continuar con 1 estudiante", exact: true }).click();
    } else {
      await page.getByRole("button", { name: "Inscribir un grupo completo", exact: true }).click();
      await page.getByLabel("Grupo", { exact: true }).selectOption("group-b");
      await page.getByRole("button", { name: "Continuar", exact: true }).click();
    }
    await page.evaluate(() => { window.enrollmentFixture.delay = 700; });
    await page.getByRole("button", { name: /^Sí, inscribir/ }).evaluate((button: HTMLButtonElement) => {
      button.click(); button.click();
    });
    await expect(page.getByRole("button", { name: "Cerrar", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Elegir estudiantes", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Inscribir un grupo completo", exact: true })).toBeDisabled();
    if (mode === "group") await expect(page.getByLabel("Grupo", { exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Inscribir estudiantes", exact: true })).toBeFocused();
    expect((await writes(page)).length).toBe(1);
    await page.getByRole("button", { name: "Inscribir estudiantes", exact: true }).click();
    await expect(page.getByRole("button", { name: "Cerrar", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Elegir estudiantes", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Inscribir un grupo completo", exact: true }).click();
    await expect(page.getByLabel("Grupo", { exact: true })).toBeEnabled();
    expect((await writes(page)).length).toBe(1);
  });
}

test("grupo elegido después de revisar requiere otra confirmación y envía el nuevo groupId", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Inscribir un grupo completo", exact: true }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByLabel("Grupo", { exact: true }).selectOption("group-b");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(await writes(page)).toEqual([]);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Grupo B");
  await page.getByRole("button", { name: "Sí, inscribir al grupo", exact: true }).click();
  await expect(page.getByRole("status")).toBeVisible();
  expect((await writes(page))[0].fields).toContainEqual(["groupId", "group-b"]);
});

test("360/1280: confirmación con teclado, foco y textos largos dentro del viewport", async ({ page }, info) => {
  await page.goto("/");
  await expect(studentA(page)).toBeVisible();
  await expect(search(page)).toBeFocused();
  await studentA(page).focus();
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: "Continuar con 1 estudiante", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(individualReview(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(individualReview(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continuar con 1 estudiante", exact: true })).toBeFocused();
  await page.evaluate(() => {
    window.enrollmentFixture.students = [{ id: "long", name: "NombreLargo".repeat(25), email: "correo".repeat(25) + "@example.invalid" }];
  });
  await search(page).fill("NombreLargo");
  await page.getByRole("checkbox", { name: /NombreLargo/ }).check();
  await page.getByRole("button", { name: "Continuar con 2 estudiantes", exact: true }).click();
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
  const undersized = await page.locator("button:visible").evaluateAll((buttons) => buttons
    .filter((button) => button.getBoundingClientRect().height < 44).map((button) => button.textContent));
  expect(undersized).toEqual([]);
  await page.screenshot({ path: info.outputPath("matricula-confirmacion.png"), fullPage: true });
  await info.attach("Matrícula con datos ficticios y componentes reales", {
    path: info.outputPath("matricula-confirmacion.png"), contentType: "image/png",
  });
});
