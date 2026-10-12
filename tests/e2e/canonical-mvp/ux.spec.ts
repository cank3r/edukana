import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { canonicalConfig } from "../../../scripts/canonical-mvp-config.mjs";
import { BASE_URL, NAMES, USERS, type PilotManifest } from "./fixtures";
import { coursePath, login, readManifest } from "./helpers";

type Role = keyof typeof USERS;
type Screen = { name: string; path: string; heading: string; persists?: (page: Page) => Promise<void> };
let manifest: PilotManifest;
const viewports = [{ width: 360, height: 844 }, { width: 1280, height: 800 }];

test.use({ screenshot: "off", trace: "off", video: "off" });
test.beforeAll(async () => {
  canonicalConfig();
  manifest = await readManifest();
  expect(manifest.completedBlocks, "El core UI debe terminar antes de esta auditoría").toEqual([1, 2, 3, 4, 5, 6]);
  expect(manifest.names).toEqual(NAMES);
  expect(manifest.users).toEqual(USERS);
  for (const id of [manifest.courseId, manifest.lessonId, manifest.assignmentId, manifest.studentId,
    manifest.gradeItemId, manifest.enrollmentId]) {
    expect(/^[A-Za-z0-9_-]+$/.test(id), "Solo identificadores del ensayo UI local").toBe(true);
  }
});

/** Sessions come from login UI. Afterwards even accidental business POSTs are blocked, not mocked as successful. */
async function readOnlySession(browser: Browser, role: Role, viewport: typeof viewports[number]) {
  const context = await browser.newContext({ baseURL: BASE_URL, viewport, locale: "es-DO", timezoneId: "UTC" });
  const attempts: string[] = [];
  let authenticated = false;
  await context.route("**/*", async (route) => {
    const request = route.request();
    if (new URL(request.url()).origin !== BASE_URL) return route.abort("blockedbyclient");
    if (authenticated && !["GET", "HEAD"].includes(request.method())) {
      attempts.push(request.method()); // No URLs, headers, bodies, cookies or tokens in the evidence.
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
  const page = await context.newPage();
  try {
    await login(page, USERS[role]);
    authenticated = true;
    return { page, context, attempts };
  } catch (error) {
    await context.close();
    throw error;
  }
}

function screens(role: Role): Screen[] {
  const course = coursePath(manifest.courseId);
  const home = { name: "inicio", path: "/dashboard", heading: role === "admin" ? NAMES.institution
    : role === "parent" ? "¿Cómo van mis hijos?" : "¿Qué tengo hoy?" };
  const community = { name: "avisos", path: "/dashboard/comunidad", heading: "Avisos",
    persists: async (page: Page) => {
      await expect.soft(page.getByRole("heading", { name: NAMES.announcement, exact: true })).toBeVisible();
    } };
  if (role === "admin") return [home,
    { name: "personas", path: "/dashboard/gestion", heading: "Personas" },
    { name: "institución", path: "/dashboard/configuracion/institucion", heading: "Datos de la institución",
      persists: async (page) => { await expect.soft(page.getByLabel("Zona horaria")).toHaveValue("UTC"); } },
    { name: "vínculos", path: "/dashboard/configuracion/tutores", heading: "Tutores y estudiantes" }, community];
  if (role === "teacher") return [home,
    { name: "contenido", path: `${course}/contenido`, heading: "Contenido del curso",
      persists: async (page) => { await expect.soft(page.getByText(NAMES.lesson, { exact: true })).toBeVisible(); } },
    { name: "entrega", path: `${course}/tareas/${manifest.assignmentId}`, heading: NAMES.assignment },
    { name: "calificaciones", path: `${course}/calificaciones`, heading: "Calificaciones" }, community];
  if (role === "student") return [home,
    { name: "lección", path: `${course}/leccion/${manifest.lessonId}`, heading: NAMES.lesson,
      persists: async (page) => { await expect.soft(page.getByText(/Completada el/)).toBeVisible(); } },
    { name: "entrega", path: `${course}/tareas/${manifest.assignmentId}`, heading: NAMES.assignment,
      persists: async (page) => { await expect.soft(page.getByText(NAMES.submission, { exact: true })).toBeVisible(); } },
    { name: "notas", path: `${course}/mis-notas`, heading: "Mis notas",
      persists: async (page) => { await expect.soft(page.getByText(NAMES.feedback, { exact: true })).toBeVisible(); } }, community];
  return [home, { name: "hijo", path: `/dashboard/hijos/${manifest.studentId}`, heading: USERS.student.name,
    persists: async (page) => {
      await expect.soft(page.getByRole("progressbar", { name: `Avance en ${NAMES.course}` })).toHaveAttribute("aria-valuenow", "100");
      await expect.soft(page.locator('section[aria-labelledby="notas"]')).toContainText("92 / 100");
      await expect.soft(page.locator('section[aria-labelledby="asistencia"]')).toContainText("100 %");
    } }, community];
}

async function auditLayout(page: Page, label: string, mobile: boolean) {
  const dimensions = await page.evaluate(() => {
    const main = document.querySelector("main");
    return { viewport: innerWidth, document: document.documentElement.scrollWidth, main: main?.scrollWidth ?? 0 };
  });
  expect.soft(dimensions.document, `${label}: sin desplazamiento horizontal global`).toBeLessThanOrEqual(dimensions.viewport);
  if (mobile) expect.soft(dimensions.main, `${label}: contenido móvil sin ancho oculto`).toBeLessThanOrEqual(dimensions.viewport);
  const targets = await page.locator("main button, main input, main select, main textarea, main summary").evaluateAll((elements) => {
    return elements.flatMap((element, index) => {
      if (!(element instanceof HTMLElement) || element.matches(":disabled, [type=hidden], [readonly]")) return [];
      const rect = element.getBoundingClientRect();
      if (!element.getClientRects().length || getComputedStyle(element).visibility === "hidden") return [];
      // A checkbox/file input can delegate activation to its associated visible label.
      const labels = element instanceof HTMLInputElement ? Array.from(element.labels ?? []) : [];
      const areas = [rect, ...labels.filter((item) => item.getClientRects().length).map((item) => item.getBoundingClientRect())];
      const largeEnough = areas.some((area) => area.width >= 43.9 && area.height >= 43.9);
      return [{ control: `${element.tagName.toLowerCase()} ${index + 1}`, width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10, largeEnough }];
    });
  });
  const small = targets.filter((target) => !target.largeEnough);
  expect.soft(small, `${label}: controles de 44 px o etiqueta asociada equivalente`).toEqual([]);
  if (mobile) {
    const back = page.getByRole("link", { name: /^Volver / }).filter({ visible: true });
    if (await back.count()) {
      const bounds = await back.first().boundingBox();
      expect.soft(bounds?.height ?? 0, `${label}: Volver móvil tiene 44 px de alto`).toBeGreaterThanOrEqual(43.9);
    }
  }
}

async function mobileNavigation(page: Page, role: Role) {
  const toggle = page.locator("details.mobile-menu > summary");
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect.soft(page.locator("details.mobile-menu")).toHaveAttribute("open", "");
  const nav = page.getByRole("navigation", { name: "Navegación móvil", exact: true });
  const destination = nav.getByRole("link", { name: role === "admin" ? "Personas" : role === "parent" ? "Mis hijos" : "Mis cursos",
    exact: true });
  // Reach the destination from the menu toggle using Tab, without a pointer click or direct focus injection.
  let reached = false;
  for (let index = 0; index < 12; index++) {
    await page.keyboard.press("Tab");
    if (await destination.evaluate((element) => element === document.activeElement)) { reached = true; break; }
  }
  expect.soft(reached, `${role}: opción principal alcanzable con Tab`).toBe(true);
  if (!reached) return;
  await page.keyboard.press("Enter");
  await expect.soft(page.locator("details.mobile-menu")).not.toHaveAttribute("open", "");
  const expected = role === "admin" ? "/dashboard/gestion" : role === "parent" ? `/dashboard/hijos/${manifest.studentId}`
    : "/dashboard/aula";
  await expect.soft(page).toHaveURL(`${BASE_URL}${expected}`);
}

for (const viewport of viewports) {
  for (const role of Object.keys(USERS) as Role[]) {
    test(`UX ${role} ${viewport.width}: pantallas, controles, recarga y navegación`, async ({ browser }) => {
      const session = await readOnlySession(browser, role, viewport);
      const { page } = session;
      try {
        for (const screen of screens(role)) {
          await test.step(screen.name, async () => {
            try {
              const response = await page.goto(screen.path, { waitUntil: "networkidle" });
              expect.soft(response?.status(), `${screen.name}: página autorizada`).toBe(200);
              expect.soft(new URL(page.url()).pathname, `${screen.name}: ruta solicitada`).toBe(screen.path);
              await expect.soft(page.getByRole("heading", { name: screen.heading, exact: true }).first()).toBeVisible();
              await auditLayout(page, `${role}/${screen.name}/${viewport.width}`, viewport.width === 360);
              if (screen.persists) {
                await screen.persists(page);
                await page.reload({ waitUntil: "networkidle" });
                await screen.persists(page);
              }
            } catch {
              // Do not log request details; a failed screen remains red while other screens still execute.
              expect.soft(false, `${role}/${screen.name}: navegación o auditoría incompleta; revisar fixture privada`).toBe(true);
            }
          });
        }
        if (viewport.width === 360) await mobileNavigation(page, role);
      } finally {
        expect.soft(session.attempts, "La auditoría no debe intentar escrituras de negocio").toEqual([]);
        await session.context.close();
      }
    });
  }

  test(`UX docente ${viewport.width}: modal de nota con teclado, sin guardar`, async ({ browser }) => {
    const session = await readOnlySession(browser, "teacher", viewport);
    const { page } = session;
    try {
      const base = coursePath(manifest.courseId, "calificaciones");
      await page.goto(base, { waitUntil: "networkidle" });
      if (viewport.width === 360) {
        const student = page.locator("main details > summary").filter({ hasText: USERS.student.name });
        await student.focus();
        await page.keyboard.press("Enter");
      }
      const entry = noteLink(page);
      await expect(entry, "Existe la nota creada por el core").toBeVisible();
      await entry.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: USERS.student.name, exact: true });
      await expect(dialog).toBeVisible();
      await expect.soft(dialog.getByRole("textbox", { name: /^Nota / })).toBeFocused();
      await focusStaysInside(page, dialog, "Tab");
      await focusStaysInside(page, dialog, "Shift+Tab");
      await page.keyboard.press("Escape");
      await expect.soft(dialog, "Escape cierra el editor sin guardar").not.toBeVisible();
      // Explicit close is only cleanup of navigation state if Escape is broken. The failure above stays red.
      if (await dialog.isVisible()) await dialog.getByRole("link", { name: "Cerrar", exact: true }).click();
      await expect.soft(page).toHaveURL(`${BASE_URL}${base}`);
      await expect.soft(entry, "El cierre devuelve el foco a la nota que abrió el editor").toBeFocused();
      await page.reload({ waitUntil: "networkidle" });
      if (viewport.width === 360) {
        await page.locator("main details > summary").filter({ hasText: USERS.student.name }).click();
      }
      await expect.soft(noteLink(page)).toContainText("92");
    } finally {
      expect.soft(session.attempts, "Abrir y cerrar la nota no debe enviar una mutación").toEqual([]);
      await session.context.close();
    }
  });
}

function noteLink(page: Page) {
  const query = encodeURIComponent(`${manifest.gradeItemId}~${manifest.enrollmentId}`);
  return page.locator(`main a[href$="?nota=${query}"]`).filter({ visible: true });
}

async function focusStaysInside(page: Page, dialog: Locator, key: "Tab" | "Shift+Tab") {
  const first = dialog.getByRole("link", { name: "Cerrar", exact: true });
  await first.focus();
  const count = await dialog.locator("a[href], button, input:not([type=hidden]), textarea, select").count();
  let escaped = false;
  for (let index = 0; index < count + 2; index++) {
    await page.keyboard.press(key);
    if (!(await dialog.evaluate((element) => element.contains(document.activeElement)))) { escaped = true; break; }
  }
  expect.soft(escaped, `El foco se mantiene dentro del modal con ${key}`).toBe(false);
}
