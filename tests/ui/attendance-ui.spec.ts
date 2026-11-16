import { test, expect, type Page } from "@playwright/test";
import type { AttendanceCall } from "./attendance-fixture";

const baseline = process.env.ATTENDANCE_BASELINE === "1";
const calls = (page: Page): Promise<AttendanceCall[]> => page.evaluate(() => window.attendanceFixture.calls);
const taking = (page: Page) => page.getByRole("region", { name: "Tomar asistencia" });
const deleting = (page: Page) => page.getByRole("region", { name: "Borrar asistencia" });
const title = (page: Page) => taking(page).getByRole("textbox", { name: "Título de la clase (opcional)" });
const ana = (page: Page) => taking(page).getByRole("group", { name: "Ana Prueba" });
const save = (page: Page) => taking(page).getByRole("button", { name: /^Guardar/ });
const confirmDelete = (page: Page) => deleting(page).getByRole("button", { name: "Sí, borrar esta asistencia" });
let pageErrors: string[];
async function draft(page: Page) {
  await title(page).fill("Borrador docente");
  await ana(page).getByText("Ausente", { exact: true }).click();
  await ana(page).getByRole("textbox", { name: "Nota (opcional)" }).fill("Avisó antes de clase");
}
async function assertDraft(page: Page) {
  await expect(title(page)).toHaveValue("Borrador docente");
  await expect(ana(page).getByRole("radio", { name: "Ausente", exact: true })).toBeChecked();
  await expect(ana(page).getByRole("textbox", { name: "Nota (opcional)" })).toHaveValue("Avisó antes de clase");
}
async function release(page: Page) { await page.evaluate(() => window.attendanceFixture.release?.()); }
test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/*", (route) => route.request().url().startsWith("http://127.0.0.1:3151/")
    ? route.continue() : route.abort("blockedbyclient"));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Asistencia: componentes reales" })).toBeVisible();
});
test.afterEach(async ({ page }) => {
  expect(pageErrors, "Sin errores de navegador no capturados").toEqual([]);
  if (!baseline) expect(await page.evaluate(() => window.attendanceFixture.caught)).toBe(0);
});

test("error devuelto por servidor conserva título, marcas y notas y permite guardar después", async ({ page }) => {
  await draft(page);
  await page.evaluate(() => { window.attendanceFixture.saveResult = "error"; });
  await save(page).click();
  await expect(taking(page).getByRole("alert")).toContainText("Rechazo simulado");
  await assertDraft(page);
  expect(await page.evaluate(() => window.attendanceFixture.caught)).toBe(0);
  await page.evaluate(() => { window.attendanceFixture.saveResult = "ok"; });
  await save(page).click();
  await expect(taking(page).getByRole("status")).toContainText("Asistencia guardada");
  const recorded = await calls(page);
  expect(recorded).toHaveLength(2);
  expect(recorded[1].data.courseId).toBe("course-fixture");
  expect(recorded[1].data.date).toBe("2026-10-12");
  expect(recorded[1].data.title).toBe("Borrador docente");
  expect(JSON.parse(recorded[1].data.entries)[0]).toEqual({
    studentId: "student-ana", status: "ABSENT", note: "Avisó antes de clase",
  });
});

test("doble clic sin esperar render sólo envía una vez", async ({ page }) => {
  await draft(page);
  await save(page).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(taking(page).getByRole("status")).toContainText("Asistencia guardada");
  expect((await calls(page)).length).toBe(1);
});

test.describe("evidencia antes de la corrección", () => {
  test.skip(!baseline, "Ejecutar sólo sobre el componente original con ATTENDANCE_BASELINE=1");
  test("diagnóstico de reset: radio DOM diverge del JSON y la nota retenidos", async ({ page }, testInfo) => {
    await draft(page);
    await page.evaluate(() => { window.attendanceFixture.saveResult = "error"; });
    await save(page).click();
    await expect(taking(page).getByRole("alert")).toContainText("Rechazo simulado");
    const snapshot = await taking(page).evaluate((section) => ({
      title: section.querySelector<HTMLInputElement>('[name="title"]')?.value,
      checked: [...section.querySelectorAll<HTMLInputElement>('[name="estado-student-ana"]')].map((input) => input.checked),
      entries: JSON.parse(section.querySelector<HTMLInputElement>('[name="entries"]')!.value),
      note: section.querySelectorAll('fieldset')[0].querySelector<HTMLInputElement>('input:not([type="radio"])')?.value,
    }));
    await testInfo.attach("radio-reset-snapshot.json", { body: JSON.stringify(snapshot, null, 2), contentType: "application/json" });
    console.log(JSON.stringify(snapshot));
    expect(snapshot.title).toBe("Borrador docente");
    expect(snapshot.checked[1]).toBe(false);
    expect(snapshot.entries[0]).toEqual({ studentId: "student-ana", status: "ABSENT", note: "Avisó antes de clase" });
    expect(snapshot.note).toBe("Avisó antes de clase");
  });
  test("rechazo de transporte sale al boundary y reabrir pierde el borrador", async ({ page }) => {
    await draft(page);
    await page.evaluate(() => { window.attendanceFixture.saveResult = "throw"; });
    await save(page).click();
    await expect(taking(page).getByTestId("boundary")).toBeVisible();
    expect(await page.evaluate(() => window.attendanceFixture.caught)).toBe(1);
    await taking(page).getByRole("button", { name: "Reabrir componente" }).click();
    await expect(title(page)).toHaveValue("Clase inicial");
    await expect(ana(page).getByRole("radio", { name: "Presente", exact: true })).toBeChecked();
    await expect(ana(page).getByRole("textbox")).toHaveCount(0);
    expect((await calls(page))[0].data.title).toBe("Borrador docente");
  });
  test("se edita durante envío y aparece guardado aunque el snapshot no contiene esas ediciones", async ({ page }) => {
    await draft(page);
    await page.evaluate(() => { window.attendanceFixture.hold = true; });
    await save(page).click();
    await expect.poll(async () => (await calls(page)).length).toBe(1);
    await title(page).fill("Cambio durante envío");
    await ana(page).getByText("Justificado", { exact: true }).click();
    await ana(page).getByRole("textbox").fill("Nota durante envío");
    await release(page);
    await expect(taking(page).getByRole("status")).toContainText("Asistencia guardada");
    await expect(title(page)).toHaveValue("Cambio durante envío");
    const snapshot = (await calls(page))[0].data;
    expect(snapshot.title).toBe("Borrador docente");
    expect(JSON.parse(snapshot.entries)[0].status).toBe("ABSENT");
    expect(JSON.parse(snapshot.entries)[0].note).toBe("Avisó antes de clase");
  });
  test("mensaje guardado sigue visible tras editar", async ({ page }) => {
    await save(page).click();
    await expect(taking(page).getByRole("status")).toBeVisible();
    await title(page).fill("Aún no enviado");
    await expect(taking(page).getByRole("status")).toContainText("Asistencia guardada");
    expect((await calls(page))[0].data.title).toBe("Clase inicial");
  });
  test("rechazo al borrar sale al boundary", async ({ page }) => {
    await page.evaluate(() => { window.attendanceFixture.deleteResult = "throw"; });
    await deleting(page).getByRole("button", { name: "Borrar", exact: true }).click();
    await confirmDelete(page).click();
    await expect(deleting(page).getByTestId("boundary")).toBeVisible();
    expect((await calls(page)).map((call) => call.kind)).toEqual(["delete"]);
    expect(await page.evaluate(() => window.attendanceFixture.caught)).toBe(1);
  });
});

test.describe("regresión de recuperación", () => {
  test.skip(baseline, "La ejecución inicial documenta explícitamente los defectos existentes");
  test("rechazo de transporte conserva borrador, informa incertidumbre y no reintenta solo", async ({ page }) => {
    await draft(page);
    await page.evaluate(() => { window.attendanceFixture.saveResult = "throw"; });
    await save(page).click();
    await expect(taking(page).getByRole("alert")).toContainText(/confirmar|comprobar/i);
    await expect(taking(page).getByRole("alert")).toContainText(/guard|registr/i);
    await expect(taking(page).getByTestId("boundary")).toHaveCount(0);
    await assertDraft(page);
    await expect(save(page)).toBeEnabled();
    expect(await page.evaluate(() => window.attendanceFixture.caught)).toBe(0);
    expect((await calls(page)).map((call) => call.kind)).toEqual(["save"]);
    await page.evaluate(() => { window.attendanceFixture.saveResult = "ok"; });
    await save(page).click();
    await expect(taking(page).getByRole("status")).toContainText("Asistencia guardada");
    expect((await calls(page)).map((call) => call.kind)).toEqual(["save", "save"]);
    await assertDraft(page);
  });
  test("pending bloquea todas las ediciones y envía el snapshot visible una sola vez", async ({ page }) => {
    await draft(page);
    await page.evaluate(() => { window.attendanceFixture.hold = true; });
    await save(page).click();
    await expect.poll(async () => (await calls(page)).length).toBe(1);
    await expect(title(page)).toBeDisabled();
    await expect(taking(page).getByRole("button", { name: /Usar/ })).toBeDisabled();
    for (const radio of await taking(page).getByRole("radio").all()) await expect(radio).toBeDisabled();
    for (const note of await taking(page).getByRole("textbox", { name: "Nota (opcional)" }).all()) {
      await expect(note).toBeDisabled();
    }
    const pendingSave = taking(page).getByRole("button", { name: /^Guardando/ });
    await expect(pendingSave).toBeDisabled();
    await pendingSave.evaluate((button: HTMLButtonElement) => button.click());
    expect((await calls(page)).length).toBe(1);
    await release(page);
    await expect(taking(page).getByRole("status")).toContainText("Asistencia guardada");
    await assertDraft(page);
    expect((await calls(page))[0].data.title).toBe("Borrador docente");
    await expect(title(page)).toBeEnabled();
  });
  for (const edit of ["título", "marca", "nota", "sugerencia"]) {
    test(`editar ${edit} retira la confirmación del envío anterior`, async ({ page }) => {
      await draft(page);
      await save(page).click();
      await expect(taking(page).getByRole("status")).toContainText("Asistencia guardada");
      if (edit === "título") await title(page).fill("Siguiente versión");
      else if (edit === "marca") await ana(page).getByText("Tarde", { exact: true }).click();
      else if (edit === "nota") await ana(page).getByRole("textbox").fill("Otra nota");
      else await taking(page).getByRole("button", { name: /Usar/ }).click();
      await expect(taking(page).getByRole("status")).toHaveCount(0);
      expect((await calls(page)).length).toBe(1);
      await save(page).click();
      await expect(taking(page).getByRole("status")).toContainText("Asistencia guardada");
      expect((await calls(page)).length).toBe(2);
    });
  }
  for (const result of ["error", "throw"] as const) {
    test(`borrado ${result}: mantiene confirmación y explica fallo sin repetir operación`, async ({ page }) => {
      await page.evaluate((value) => { window.attendanceFixture.deleteResult = value; }, result);
      await deleting(page).getByRole("button", { name: "Borrar", exact: true }).click();
      await expect(deleting(page)).toContainText("2 estudiantes");
      await expect(deleting(page)).toContainText("no se puede deshacer");
      await confirmDelete(page).click();
      const alert = deleting(page).getByRole("alert");
      await expect(alert).toBeVisible();
      if (result === "throw") {
        await expect(alert).toContainText(/confirmar|comprobar/i);
        await expect(alert).toContainText(/borr|elimin/i);
      } else await expect(alert).toContainText("Rechazo simulado");
      await expect(deleting(page).getByTestId("boundary")).toHaveCount(0);
      await expect(deleting(page).getByRole("button", { name: "Cancelar" })).toBeEnabled();
      expect(await page.evaluate(() => window.attendanceFixture.caught)).toBe(0);
      expect((await calls(page)).map((call) => call.kind)).toEqual(["delete"]);
      expect((await calls(page))[0].data).toEqual({ courseId: "course-fixture", sessionId: "session-fixture" });
      await deleting(page).getByRole("button", { name: "Cancelar" }).click();
      await expect(deleting(page).getByRole("button", { name: "Borrar", exact: true })).toBeVisible();
      expect((await calls(page)).length).toBe(1);
    });
  }
  test("borrado pending bloquea cancelar y confirmar; el éxito conserva el contrato", async ({ page }) => {
    await page.evaluate(() => { window.attendanceFixture.hold = true; });
    await deleting(page).getByRole("button", { name: "Borrar", exact: true }).click();
    await confirmDelete(page).click();
    await expect.poll(async () => (await calls(page)).length).toBe(1);
    await expect(deleting(page).getByRole("button", { name: /^Borrando/ })).toBeDisabled();
    await expect(deleting(page).getByRole("button", { name: "Cancelar" })).toBeDisabled();
    await release(page);
    await expect(deleting(page).getByRole("status")).toContainText("Asistencia borrada");
    expect((await calls(page)).map((call) => call.kind)).toEqual(["delete"]);
  });
  test("dos confirmaciones en el mismo tick no duplican el borrado", async ({ page }) => {
    await deleting(page).getByRole("button", { name: "Borrar", exact: true }).click();
    await confirmDelete(page).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await expect(deleting(page).getByRole("status")).toContainText("Asistencia borrada");
    expect((await calls(page)).map((call) => call.kind)).toEqual(["delete"]);
  });
  test("recorrido con teclado y sin desbordamiento conserva marcas al guardar", async ({ page }) => {
    await page.keyboard.press("Tab");
    await expect(title(page)).toBeFocused();
    await page.keyboard.type(" desde teclado");
    await page.keyboard.press("Tab");
    await expect(taking(page).getByRole("button", { name: /Usar/ })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(ana(page).getByRole("radio", { name: "Presente", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(ana(page).getByRole("radio", { name: "Ausente", exact: true })).toBeChecked();
    await page.keyboard.press("Tab");
    await expect(ana(page).getByRole("textbox")).toBeFocused();
    await page.keyboard.type("Nota con teclado");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(save(page)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(taking(page).getByRole("status")).toContainText("Asistencia guardada");
    expect(JSON.parse((await calls(page))[0].data.entries)[0]).toEqual({
      studentId: "student-ana", status: "ABSENT", note: "Nota con teclado",
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await page.evaluate(() => window.attendanceFixture.caught)).toBe(0);
  });
});
