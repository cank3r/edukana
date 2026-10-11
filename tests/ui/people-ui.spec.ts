import { test, expect, type Page } from "@playwright/test";
import type { RecordedAction } from "./people-fixture";

const calls = (page: Page): Promise<RecordedAction[]> => page.evaluate(() => window.peopleFixture.calls);
test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => route.request().url().startsWith("http://127.0.0.1:3147/")
    ? route.continue() : route.abort("blockedbyclient"));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Personas — prueba de componentes reales" })).toBeVisible();
});

test("acciones por teclado: Tab, Enter, Escape y foco de regreso", async ({ page }) => {
  const trigger = page.getByRole("button", { name: "Acciones de Ana Ejemplo", exact: true });
  await page.keyboard.press("Tab");
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Tab");
  await expect(page.locator("#directory").getByRole("button", { name: "Editar datos" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Space");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(await calls(page)).toEqual([]);
});

test("editor conserva borrador al fallar, cancelar descarta y restaura foco", async ({ page }, info) => {
  const editor = page.locator("#editor");
  const trigger = editor.getByRole("button", { name: "Editar datos" });
  await page.evaluate(() => { window.peopleFixture.fail = true; });
  await trigger.click();
  await expect(editor.getByLabel("Nombre completo")).toBeFocused();
  await editor.getByLabel("Nombre completo").fill("Ana corregida");
  await editor.getByLabel("Teléfono (opcional)").fill("8095550199");
  await editor.getByLabel("Rol en esta institución").selectOption("TEACHER");
  await expect(editor.getByLabel("Rol en esta institución")).toHaveValue("TEACHER");
  await editor.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(editor.getByRole("alert")).toContainText("Fallo simulado");
  await info.attach("Formulario enviado al stub aislado", {
    body: JSON.stringify(await calls(page)), contentType: "application/json",
  });
  expect((await calls(page))[0].fields.role).toBe("TEACHER");
  await expect(editor.getByLabel("Nombre completo")).toHaveValue("Ana corregida");
  await expect(editor.getByLabel("Teléfono (opcional)")).toHaveValue("8095550199");
  await expect(editor.getByLabel("Rol en esta institución")).toHaveValue("TEACHER");
  await editor.getByRole("button", { name: "Cancelar" }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(editor.getByLabel("Nombre completo")).toHaveValue("Ana Ejemplo");
  expect((await calls(page)).map((call) => call.action)).toEqual(["update"]);
});

test("suspensión requiere motivo, conserva rechazo y cancelar no ejecuta", async ({ page }) => {
  const section = page.locator("#directory");
  const trigger = section.getByRole("button", { name: "Acciones de Ana Ejemplo" });
  await page.evaluate(() => { window.peopleFixture.fail = true; });
  await trigger.click();
  await section.getByRole("button", { name: "Suspender en esta institución" }).click();
  await expect(section.getByRole("heading", { name: "Confirmar suspensión" })).toBeFocused();
  await section.getByRole("button", { name: "Sí, suspender" }).click();
  expect(await calls(page)).toEqual([]);
  await section.getByLabel("Motivo de la suspensión").fill("Retiro simulado del programa");
  await section.getByRole("button", { name: "Sí, suspender" }).click();
  await expect(section.getByRole("alert")).toContainText("Fallo simulado");
  await expect(section.getByLabel("Motivo de la suspensión")).toHaveValue("Retiro simulado del programa");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  expect((await calls(page)).map((call) => call.action)).toEqual(["status"]);
});

test("correo exige confirmación y doble envío queda bloqueado mientras espera", async ({ page }) => {
  const section = page.locator("#directory");
  await page.evaluate(() => { window.peopleFixture.delay = 500; });
  await section.getByRole("button", { name: "Acciones de Ana Ejemplo" }).click();
  await section.getByRole("button", { name: "Enviar invitación", exact: true }).click();
  await expect(section.getByText(/Se enviará un correo a ana@example.invalid/)).toBeVisible();
  expect(await calls(page)).toEqual([]);
  await section.getByRole("button", { name: "Sí, enviar correo" }).evaluate((element: HTMLButtonElement) => {
    element.click(); element.click();
  });
  await expect(section.getByRole("button", { name: "Procesando…" })).toBeDisabled();
  await expect(section.getByRole("status")).toContainText("La entrega en la bandeja no está confirmada");
  expect((await calls(page)).map((call) => call.action)).toEqual(["invite"]);
});

test("restricciones: superadministrador, identidad ausente y permisos de administrador", async ({ page }) => {
  const section = page.locator("#restrictions");
  await expect(section.getByRole("button", { name: "Editar datos", exact: true })).toBeDisabled();
  await section.getByRole("button", { name: "Acciones de Sin acceso" }).click();
  const absent = section.locator("li").filter({ hasText: "Sin acceso" });
  await expect(absent.getByText("Este registro no tiene acceso configurado.")).toBeVisible();
  await expect(absent.getByRole("button", { name: "Enviar invitación" })).toHaveCount(0);
  await section.getByRole("button", { name: "Acciones de Acceso restringido" }).click();
  const restricted = section.locator("li").filter({ hasText: "Acceso restringido" });
  await expect(restricted.getByRole("button", { name: "Enviar invitación" })).toHaveCount(0);
  await section.getByRole("button", { name: "Acciones de Administrador", exact: true }).click();
  const admin = section.locator("li").filter({ hasText: "Administrador" });
  await expect(admin.getByRole("button", { name: "Suspender en esta institución" })).toHaveCount(0);
  await admin.getByRole("button", { name: "Editar datos" }).click();
  await expect(admin.locator('select[name="role"]')).toHaveCount(0);
  await expect(admin.locator('input[name="role"]')).toHaveValue("ADMIN");
  expect(await calls(page)).toEqual([]);
});

test("alta: revisar no ejecuta; confirmar ejecuta una vez y conserva datos ante fallo", async ({ page }, info) => {
  const section = page.locator("#create");
  await page.evaluate(() => { window.peopleFixture.fail = true; });
  await section.getByRole("button", { name: "Agregar persona" }).click();
  await section.getByLabel("Nombre completo").fill("Persona de prueba");
  await section.getByLabel("Correo", { exact: true }).fill("persona@example.invalid");
  await section.getByLabel("Teléfono (opcional)").fill("8095550123");
  await expect(section.locator('option[value="ADMIN"]')).toHaveCount(0);
  await section.getByRole("button", { name: "Revisar", exact: true }).dblclick();
  await expect(section.getByRole("heading", { name: "Revisar antes de agregar" })).toBeVisible();
  expect(await calls(page)).toEqual([]);
  await section.getByRole("button", { name: "Corregir datos" }).click();
  await section.getByRole("button", { name: "Revisar", exact: true }).click();
  await expect(section.getByRole("heading", { name: "Revisar antes de agregar" })).toBeFocused();
  await section.screenshot({ path: info.outputPath("alta-revision.png") });
  await info.attach("Alta — confirmación con datos ficticios", {
    path: info.outputPath("alta-revision.png"), contentType: "image/png",
  });
  await section.getByRole("button", { name: "Agregar y enviar invitación" }).click();
  await expect(section.getByRole("alert")).toContainText("Fallo simulado");
  await section.getByRole("button", { name: "Corregir datos" }).click();
  await expect(section.getByLabel("Nombre completo")).toHaveValue("Persona de prueba");
  await expect(section.getByLabel("Correo", { exact: true })).toHaveValue("persona@example.invalid");
  expect((await calls(page)).map((call) => call.action)).toEqual(["create"]);
  await section.getByRole("button", { name: "Cancelar" }).click();
  await expect(section.getByRole("button", { name: "Agregar persona" })).toBeFocused();
});

test("lote advierte alcance, cancelar no envía y confirma una vez", async ({ page }) => {
  const section = page.locator("#bulk");
  await expect(section.getByText(/en toda la institución/)).toContainText("no solo a los del archivo o la búsqueda actual");
  await section.getByRole("button", { name: "Enviar invitaciones", exact: true }).click();
  await expect(section.getByRole("heading", { name: "Confirmar envío de invitaciones" })).toBeFocused();
  await expect(section.getByText(/Se intentarán enviar 3 correos/)).toBeVisible();
  await section.getByRole("button", { name: "Cancelar" }).click();
  expect(await calls(page)).toEqual([]);
  await expect(section.getByRole("button", { name: "Enviar invitaciones", exact: true })).toBeFocused();
  await page.evaluate(() => { window.peopleFixture.fail = true; window.peopleFixture.delay = 400; });
  await section.getByRole("button", { name: "Enviar invitaciones", exact: true }).click();
  await section.getByRole("button", { name: "Sí, enviar 3" }).evaluate((element: HTMLButtonElement) => {
    element.click(); element.click();
  });
  await expect(section.getByRole("alert")).toContainText("Fallo simulado");
  expect((await calls(page)).map((call) => call.action)).toEqual(["bulk"]);
});

test("360/1280: textos largos sin desbordamiento y controles de 44px", async ({ page }, info) => {
  await expect(page.locator("#directory").getByText("Activo", { exact: true })).toBeVisible();
  await expect(page.getByText("Puede entrar", { exact: true })).toHaveCount(0);
  const initialDimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth,
  }));
  expect(initialDimensions.content).toBeLessThanOrEqual(initialDimensions.viewport);
  await page.locator("#longtext").getByRole("button", { name: /^Acciones de/ }).click();
  await page.locator("#longtext").getByRole("button", { name: "Editar datos" }).click();
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
  const shortButtons = await page.locator("button:visible").evaluateAll((buttons) => buttons
    .filter((button) => button.getBoundingClientRect().height < 44).map((button) => button.textContent));
  expect(shortButtons).toEqual([]);
  await page.screenshot({ path: info.outputPath("personas-componentes.png"), fullPage: true });
  await info.attach("Componentes reales — fixture aislado", {
    path: info.outputPath("personas-componentes.png"), contentType: "image/png",
  });
});

test("lote finaliza en cero con foco y reconoce personas nuevas al refrescar", async ({ page }) => {
  const section = page.locator("#bulk");
  await section.getByRole("button", { name: "Enviar invitaciones", exact: true }).click();
  await section.getByRole("button", { name: "Sí, enviar 3" }).click();
  await expect(section.getByRole("status")).toContainText("Acción simulada completada");
  await expect(section.getByRole("button", { name: "Enviar invitaciones", exact: true })).toHaveCount(0);
  await expect(section.locator('[tabindex="-1"]')).toBeFocused();
  await page.evaluate(() => window.peopleFixture.setPending(0));
  await expect(section.getByRole("button", { name: "Enviar invitaciones", exact: true })).toHaveCount(0);
  await page.evaluate(() => window.peopleFixture.setPending(2));
  await expect(section.getByRole("button", { name: "Enviar invitaciones", exact: true })).toBeVisible();
  await expect(section.getByText(/en toda la institución/)).toContainText("2 personas pendientes");
});

test("rechazos de red controlados conservan borradores y no duplican acciones", async ({ page }) => {
  await page.evaluate(() => { window.peopleFixture.throwError = true; });
  const editor = page.locator("#editor");
  await editor.getByRole("button", { name: "Editar datos" }).click();
  await editor.getByLabel("Nombre completo").fill("Borrador sin conexión");
  await editor.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(editor.getByRole("alert")).toContainText("Revisa tu conexión");
  await expect(editor.getByLabel("Nombre completo")).toHaveValue("Borrador sin conexión");
  const directory = page.locator("#directory");
  await directory.getByRole("button", { name: "Acciones de Ana Ejemplo" }).click();
  await directory.getByRole("button", { name: "Suspender en esta institución" }).click();
  await directory.getByLabel("Motivo de la suspensión").fill("Motivo conservado sin conexión");
  await directory.getByRole("button", { name: "Sí, suspender" }).click();
  await expect(directory.getByRole("alert")).toContainText("Revisa tu conexión");
  await expect(directory.getByLabel("Motivo de la suspensión")).toHaveValue("Motivo conservado sin conexión");
  await directory.getByRole("button", { name: "Cancelar" }).click();
  await directory.getByRole("button", { name: "Acciones de Ana Ejemplo" }).click();
  await directory.getByRole("button", { name: "Enviar invitación", exact: true }).click();
  await directory.getByRole("button", { name: "Sí, enviar correo" }).click();
  await expect.poll(async () => (await calls(page)).length).toBe(3);
  await expect(directory.getByRole("alert")).toContainText("Revisa tu conexión");
  const create = page.locator("#create");
  await create.getByRole("button", { name: "Agregar persona" }).click();
  await create.getByLabel("Nombre completo").fill("Alta sin conexión");
  await create.getByLabel("Correo", { exact: true }).fill("alta@example.invalid");
  await create.getByRole("button", { name: "Revisar", exact: true }).click();
  await create.getByRole("button", { name: "Agregar y enviar invitación" }).click();
  await expect(create.getByRole("alert")).toContainText("Revisa tu conexión");
  await create.getByRole("button", { name: "Corregir datos" }).click();
  await expect(create.getByLabel("Nombre completo")).toHaveValue("Alta sin conexión");
  const bulk = page.locator("#bulk");
  await bulk.getByRole("button", { name: "Enviar invitaciones", exact: true }).click();
  await bulk.getByRole("button", { name: "Sí, enviar 3" }).click();
  await expect(bulk.getByRole("alert")).toContainText("El envío se interrumpió");
  expect((await calls(page)).map((call) => call.action)).toEqual(["update", "status", "invite", "create", "bulk"]);
});
