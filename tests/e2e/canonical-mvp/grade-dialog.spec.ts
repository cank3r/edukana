import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { canonicalConfig } from "../../../scripts/canonical-mvp-config.mjs";
import { BASE_URL, NAMES, USERS, type PilotManifest } from "./fixtures";
import { coursePath, login, readManifest } from "./helpers";

const viewports = [{ width: 360, height: 844 }, { width: 1280, height: 800 }];
type Viewport = typeof viewports[number];
let manifest: PilotManifest;

test.use({ screenshot: "off", trace: "off", video: "off" });
test.beforeAll(async () => {
  canonicalConfig();
  manifest = await readManifest();
  expect(manifest.completedBlocks, "El recorrido UI debe haber creado la nota").toEqual([1, 2, 3, 4, 5, 6]);
  expect(manifest.users).toEqual(USERS);
  expect(manifest.names).toEqual(NAMES);
  for (const id of [manifest.courseId, manifest.gradeItemId, manifest.enrollmentId]) {
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
  }
});

/** Login is real UI; afterwards no business request can mutate the shared fixture. */
async function readOnlySession(browser: Browser, viewport: Viewport) {
  const context = await browser.newContext({ baseURL: BASE_URL, viewport, locale: "es-DO", timezoneId: "UTC" });
  const writes: string[] = [];
  const external: string[] = [];
  let authenticated = false;
  await context.route("**/*", async (route) => {
    const request = route.request();
    if (new URL(request.url()).origin !== BASE_URL) {
      external.push(request.method());
      return route.abort("blockedbyclient");
    }
    if (authenticated && !["GET", "HEAD"].includes(request.method())) {
      writes.push(request.method()); // Only methods; never URLs, credentials, headers or bodies.
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
  const page = await context.newPage();
  try {
    await login(page, USERS.teacher);
    authenticated = true;
    return { context, page, writes, external };
  } catch (error) {
    await context.close();
    throw error;
  }
}

function paths() {
  const base = coursePath(manifest.courseId, "calificaciones");
  return { base, cell: `${base}?nota=${encodeURIComponent(`${manifest.gradeItemId}~${manifest.enrollmentId}`)}` };
}

function noteLink(page: Page) {
  return page.locator(`main a[href="${paths().cell}"]`).filter({ visible: true });
}

function studentCard(page: Page) {
  return page.locator("main details").filter({
    has: page.locator("summary").filter({ hasText: USERS.student.name }),
  });
}

async function showCell(page: Page, viewport: Viewport) {
  await expect(page.getByRole("heading", { name: "Calificaciones", exact: true })).toBeVisible();
  if (viewport.width === 360) {
    const card = studentCard(page);
    await expect(card).toHaveCount(1);
    if (!(await card.evaluate((element) => element instanceof HTMLDetailsElement && element.open))) {
      await card.locator("summary").focus();
      await page.keyboard.press("Enter");
    }
    await expect(card).toHaveAttribute("open", "");
  }
  await expect(noteLink(page)).toHaveCount(1);
  await expect(noteLink(page)).toBeVisible();
  await expect(noteLink(page)).toContainText(/\b92\b/);
}

function historyPanel(dialog: Locator) {
  return dialog.getByRole("heading", { name: "Historial de esta nota", exact: true }).locator("..");
}

async function expectOpen(page: Page, history?: string) {
  await expect(page).toHaveURL(`${BASE_URL}${paths().cell}`);
  const dialog = page.getByRole("dialog", { name: USERS.student.name, exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(NAMES.assignment, { exact: true })).toBeVisible();
  const score = dialog.getByRole("textbox", { name: /^Nota / });
  await expect(score).toHaveValue("92");
  await expect(score).toBeFocused();
  await expect(dialog.getByRole("textbox", { name: /^Comentario para el estudiante/ })).toHaveValue(NAMES.feedback);
  await expect(dialog.getByRole("checkbox", { name: /^Exonerado/ })).not.toBeChecked();
  await expect(dialog.getByRole("textbox", { name: /^Motivo del cambio/ })).toHaveValue("");
  await expect(dialog.getByRole("heading", { name: "Historial de esta nota", exact: true })).toBeVisible();
  if (history !== undefined) await expect(historyPanel(dialog)).toHaveText(history);
  return dialog;
}

async function expectClosed(page: Page, viewport: Viewport) {
  await expect(page).toHaveURL(`${BASE_URL}${paths().base}`);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Calificaciones", exact: true })).toBeVisible();
  // Never open details or inject focus here: restoration must be performed by the application.
  if (viewport.width === 360) await expect(studentCard(page)).toHaveAttribute("open", "");
  await expect(noteLink(page)).toHaveCount(1);
  await expect(noteLink(page)).toBeVisible();
  await expect(noteLink(page)).toBeFocused();
  await expect(noteLink(page)).toContainText(/\b92\b/);
}

async function openWithKeyboard(page: Page) {
  await noteLink(page).focus();
  await page.keyboard.press("Enter");
}

async function localDraft(dialog: Locator) {
  await dialog.getByRole("textbox", { name: /^Nota / }).fill("17");
  await dialog.getByRole("textbox", { name: /^Comentario para el estudiante/ }).fill("Borrador local que no se guarda.");
  await dialog.getByRole("textbox", { name: /^Motivo del cambio/ }).fill("Ensayo de cierre sin guardar.");
}

for (const viewport of viewports) {
  test(`Nota ${viewport.width}: query directo, recarga abierta y enlaces Cerrar/Cancelar`, async ({ browser }) => {
    const session = await readOnlySession(browser, viewport);
    const { page } = session;
    try {
      const response = await page.goto(paths().cell);
      expect(response?.status()).toBe(200);
      const dialog = await expectOpen(page);
      const history = await historyPanel(dialog).innerText();
      await localDraft(dialog);
      expect((await page.reload())?.status()).toBe(200);
      await expectOpen(page, history);
      await dialog.getByRole("link", { name: "Cerrar", exact: true }).click();
      await expectClosed(page, viewport);

      // A new document reads persisted data; no remembered opener survives the earlier reload.
      expect((await page.reload())?.status()).toBe(200);
      await showCell(page, viewport);
      await openWithKeyboard(page);
      await expectOpen(page, history);
      await localDraft(dialog);
      await dialog.getByRole("link", { name: "Cancelar", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expectClosed(page, viewport);
      expect((await page.reload())?.status()).toBe(200);
      await showCell(page, viewport);
      await openWithKeyboard(page);
      await expectOpen(page, history);
    } finally {
      expect.soft(session.writes, "Navegar, recargar y cerrar no deben intentar escrituras").toEqual([]);
      expect.soft(session.external, "Toda la navegación debe permanecer en la aplicación aislada").toEqual([]);
      await session.context.close();
    }
  });

  test(`Nota ${viewport.width}: Atrás/Adelante y Escape restauran URL, foco y nota persistida`, async ({ browser }) => {
    const session = await readOnlySession(browser, viewport);
    const { page } = session;
    try {
      expect((await page.goto(paths().base))?.status()).toBe(200);
      await showCell(page, viewport);
      await openWithKeyboard(page);
      const dialog = await expectOpen(page);
      const history = await historyPanel(dialog).innerText();
      await page.goBack();
      await expectClosed(page, viewport);
      await page.goForward();
      await expectOpen(page, history);
      await localDraft(dialog);
      await page.keyboard.press("Escape");
      await expectClosed(page, viewport);

      // Escape has the same push-to-base history contract as the explicit close Link.
      await page.goBack();
      await expectOpen(page, history);
      await page.goForward();
      await expectClosed(page, viewport);
      expect((await page.reload())?.status()).toBe(200);
      await showCell(page, viewport);
      await openWithKeyboard(page);
      await expectOpen(page, history);
    } finally {
      expect.soft(session.writes, "Historial y Escape no deben intentar guardar el borrador").toEqual([]);
      expect.soft(session.external, "Toda la navegación debe permanecer en la aplicación aislada").toEqual([]);
      await session.context.close();
    }
  });
}
