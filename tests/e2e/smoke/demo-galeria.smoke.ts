import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page, type Response, type TestInfo } from "@playwright/test";
import type { ScreenRecord } from "./harness";
import { loadDemoGallery } from "./demo-shared";
import { SMOKE_DIR, SMOKE_PASSWORD } from "./shared";

/**
 * Galería de «Instituto Técnico Demo» en uso: entra con cada cuenta de la demo (docs/demo.md) y saca
 * una captura de página completa de sus pantallas principales en `screenshots/<proyecto>/demo/`.
 *
 * No repite las aserciones del recorrido: solo hace fallar la prueba si una página no carga o el servidor
 * responde con error. Lo demás (404, «Algo salió mal», título que no aparece, errores de consola,
 * desbordamiento en móvil) queda anotado como defecto en el informe del recorrido.
 *
 * Escritorio recorre todas las pantallas; móvil, solo las marcadas `movil` (para no alargar el job).
 * La demo la carga el job con `demo-load.ts`; sin `smoke-artifacts/demo.json` la galería se omite.
 */

const demo = loadDemoGallery();
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "";

/** Pantallas de error de Next y del dashboard: la página no cargó. */
const FATAL_TEXTS = [/This page couldn[’']t load/i, /Application error/i, /No pudimos cargar esta sección/i, /Internal Server Error/i];
/** Textos que delatan un defecto visible, sin que la página deje de cargar. */
const DEFECT_TEXTS = [/Algo salió mal/i, /Recurso no encontrado/i, /This page could not be found/i, /^Error$/m, /Código: [0-9a-f-]{8,}/i];
const IGNORED_CONSOLE = [/youtube|ytimg|googlevideo|doubleclick|google\.com|gstatic|ggpht/i, /favicon\.ico/i, /Permissions-Policy|Permissions policy violation/i, /net::ERR_/i];

const slug = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

type ShotOptions = {
  /** Título (o texto) que confirma que es la pantalla correcta. Si no aparece, se anota como defecto. */
  title?: string | RegExp;
  /** También se captura en el proyecto móvil. */
  movil?: boolean;
};

class Gallery {
  private readonly records: ScreenRecord[] = [];
  private readonly fatal: string[] = [];
  private serverErrors: string[] = [];
  private consoleErrors: string[] = [];
  private number = 1;
  private readonly project: string;
  private readonly mobile: boolean;
  private readonly origin: string;

  constructor(private readonly page: Page, private readonly info: TestInfo, private readonly role: string) {
    this.project = info.project.name;
    this.mobile = (info.project.use.viewport?.width ?? 1280) < 600;
    this.origin = new URL(info.project.use.baseURL ?? "http://127.0.0.1:3000").origin;
    page.on("response", (response: Response) => {
      if (response.url().startsWith(this.origin) && response.status() >= 500) {
        this.serverErrors.push(`${response.status()} en ${response.request().method()} ${new URL(response.url()).pathname}`);
      }
    });
    page.on("console", (message) => {
      const text = `${message.text()} ${message.location().url ?? ""}`;
      if (message.type() === "error" && !IGNORED_CONSOLE.some((pattern) => pattern.test(text))) this.consoleErrors.push(message.text().slice(0, 200));
    });
    page.on("pageerror", (error) => {
      if (!IGNORED_CONSOLE.some((pattern) => pattern.test(error.message))) this.consoleErrors.push(`error de página: ${error.message.slice(0, 200)}`);
    });
  }

  async login(email: string, password: string) {
    try {
      await this.page.goto("/login");
      await this.page.getByLabel("Correo electrónico").fill(email);
      await this.page.getByLabel("Contraseña").fill(password);
      await this.page.getByRole("button", { name: "Ingresar" }).click();
      await this.page.waitForURL(/\/dashboard|\/operador/, { timeout: 30_000 });
      return true;
    } catch (error) {
      this.fatal.push(`No se pudo iniciar sesión como ${this.role}: ${String(error).split("\n")[0].slice(0, 200)}`);
      return false;
    }
  }

  /** Abre la pantalla, espera a que termine de cargar, la revisa y saca su captura. */
  async shot(screen: string, path: string, options: ShotOptions = {}) {
    if (this.mobile && !options.movil) return;
    const nn = String(this.number).padStart(2, "0");
    this.number += 1;
    this.serverErrors = [];
    this.consoleErrors = [];
    const fatal: string[] = [];
    const defects: string[] = [];

    try {
      const response = await this.page.goto(path, { waitUntil: "domcontentloaded" });
      const status = response?.status() ?? 0;
      if (status >= 500) fatal.push(`La respuesta principal fue ${status}.`);
      else if (status >= 400) defects.push(`La respuesta principal fue ${status}.`);
    } catch (error) {
      fatal.push(`La página no cargó: ${String(error).split("\n")[0].slice(0, 200)}`);
    }
    await this.page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
    // Esperar a que desaparezcan los «Cargando…» de las secciones que cargan aparte.
    await this.page.getByText(/^Cargando/).filter({ visible: true }).first().waitFor({ state: "hidden", timeout: 8_000 }).catch(() => undefined);
    if (options.title) {
      const title = typeof options.title === "string" ? this.page.getByRole("heading", { name: options.title }) : this.page.getByRole("heading", { name: options.title }).or(this.page.getByText(options.title));
      await expect(title.filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 }).catch(() => defects.push(`No aparece «${String(options.title)}».`));
    }

    const body = await this.page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
    for (const pattern of FATAL_TEXTS) if (pattern.test(body)) fatal.push(`Pantalla de error visible: «${body.match(pattern)?.[0]}».`);
    for (const pattern of DEFECT_TEXTS) if (pattern.test(body)) defects.push(`Texto de error visible: «${body.match(pattern)?.[0]}».`);
    fatal.push(...new Set(this.serverErrors));
    if (this.consoleErrors.length) defects.push(`Consola: ${[...new Set(this.consoleErrors)].slice(0, 3).join(" / ")}`);
    if (this.mobile) {
      // Si la página es más ancha que la pantalla, se anota el elemento más profundo que se sale (para saber qué corregir).
      const wide = await this.page
        .evaluate(() => {
          const extra = document.documentElement.scrollWidth - document.documentElement.clientWidth;
          if (extra <= 1) return null;
          const found: string[] = [];
          for (const element of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
            const box = element.getBoundingClientRect();
            if (box.width === 0 || box.right <= window.innerWidth + 1) continue;
            // Solo donde nace el desborde: el padre cabe en la pantalla, pero este elemento no (y el padre no lo recorta).
            const parent = element.parentElement;
            if (!parent || parent.getBoundingClientRect().right > window.innerWidth + 1 || getComputedStyle(parent).overflowX !== "visible") continue;
            found.push(`<${element.tagName.toLowerCase()} class="${String(element.className).slice(0, 100)}"> ${Math.round(box.width)}px «${(element.innerText || "").replace(/\s+/g, " ").slice(0, 50)}»`);
          }
          const culprit = found.slice(0, 3).join(" · ");
          return { extra, culprit };
        })
        .catch(() => null);
      if (wide) defects.push(`Desbordamiento horizontal de ${wide.extra}px; se sale: ${wide.culprit}.`);
    }

    const file = `${slug(this.role)}-${nn}-${slug(screen)}.jpg`;
    const directory = join(process.cwd(), SMOKE_DIR, "screenshots", this.project, "demo");
    mkdirSync(directory, { recursive: true });
    await this.capture(join(directory, file)).catch((error) => defects.push(`No se pudo guardar la captura: ${String(error).slice(0, 150)}`));
    const texts = join(process.cwd(), SMOKE_DIR, "texts", this.project, "demo");
    mkdirSync(texts, { recursive: true });
    writeFileSync(join(texts, file.replace(/\.jpg$/, ".txt")), `${this.page.url()}\n\n${body.replace(/\n{3,}/g, "\n\n")}\n`);

    const url = new URL(this.page.url());
    this.records.push({
      project: this.project,
      role: `demo ${this.role}`,
      order: 900 + this.records.length,
      screen,
      url: url.pathname + url.search,
      status: fatal.length ? "FALLA" : defects.length ? "ADVERTENCIA" : "OK",
      detail: [...fatal, ...defects].join(" · ").replace(/\|/g, "/").replace(/\s+/g, " "),
      screenshot: `screenshots/${this.project}/demo/${file}`,
    });
    this.fatal.push(...fatal.map((problem) => `${screen}: ${problem}`));
    const results = join(process.cwd(), SMOKE_DIR, "results");
    mkdirSync(results, { recursive: true });
    writeFileSync(join(results, `${this.project}-demo-${slug(this.role)}.json`), JSON.stringify(this.records, null, 2));
  }

  /** Como en el recorrido: el panel desliza dentro de un contenedor de alto fijo, así que se agranda la ventana para que quepa todo. */
  private async capture(path: string) {
    const original = this.page.viewportSize();
    const extra = await this.page
      .evaluate(() => {
        let most = 0;
        for (const element of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
          const hidden = element.scrollHeight - element.clientHeight;
          if (hidden > most && /auto|scroll/.test(getComputedStyle(element).overflowY)) most = hidden;
        }
        return most;
      })
      .catch(() => 0);
    const grow = Boolean(original) && extra > 0;
    if (grow && original) await this.page.setViewportSize({ width: original.width, height: Math.min(original.height + extra + 16, 12_000) });
    try {
      await this.page.screenshot({ path, fullPage: true, animations: "disabled", type: "jpeg", quality: 60 });
    } finally {
      if (grow && original) await this.page.setViewportSize(original);
    }
  }

  finish() {
    const defects = this.records.filter((record) => record.status === "ADVERTENCIA").length;
    this.info.annotations.push({ type: "galería demo", description: `${this.records.length} capturas, ${defects} con defectos anotados` });
    expect(this.fatal, `Páginas de la demo que no cargaron (${this.role})`).toEqual([]);
  }
}

// En CI el job siempre carga la demo antes del recorrido: si no está, la carga falló.
test("galeria demo cargada", () => {
  test.skip(!process.env.CI, "Fuera de CI la galería es opcional.");
  expect(demo, "El job no pudo cargar «Instituto Técnico Demo» (ver registros/02b-demo.log).").not.toBeNull();
  expect(DEMO_PASSWORD.length, "Falta DEMO_PASSWORD en el job.").toBeGreaterThanOrEqual(8);
});

test.describe("galeria demo", () => {
  test.skip(!demo, "La demo no está cargada en esta base (falta smoke-artifacts/demo.json).");
  test.skip(DEMO_PASSWORD.length < 8, "Falta DEMO_PASSWORD.");

  test("directora", async ({ page }, info) => {
    const gallery = new Gallery(page, info, "directora");
    if (await gallery.login(demo!.accounts.director, DEMO_PASSWORD)) {
      await gallery.shot("tablero este mes", "/dashboard?rango=mes", { title: "Cómo va la institución", movil: true });
      await gallery.shot("tablero este periodo", "/dashboard?rango=periodo", { title: "Cómo va la institución" });
      await gallery.shot("estudiantes en riesgo", "/dashboard/analitica/riesgo", { title: "Estudiantes en riesgo", movil: true });
      await gallery.shot("personas", "/dashboard/gestion", { title: "Personas" });
      await gallery.shot("ficha estudiante en riesgo", `/dashboard/gestion/personas/${demo!.atRiskStudentId}`, { title: "Yaritza Mejía Lora" });
      await gallery.shot("cursos", "/dashboard/aula", { title: "Cursos" });
      await gallery.shot("reportes", "/dashboard/analitica", { title: "Reportes" });
      await gallery.shot("cobros", "/dashboard/pagos", { title: "Cobros", movil: true });
      await gallery.shot("admisiones", "/dashboard/admisiones", { title: "Admisiones" });
      await gallery.shot("configuracion institucion", "/dashboard/configuracion/institucion", { title: "Datos de la institución" });
    }
    gallery.finish();
  });

  test("coordinador", async ({ page }, info) => {
    const gallery = new Gallery(page, info, "coordinador");
    if (await gallery.login(demo!.accounts.coordinator, DEMO_PASSWORD)) {
      await gallery.shot("inicio", "/dashboard", { title: "Cómo va la institución" });
    }
    gallery.finish();
  });

  test("docente", async ({ page }, info) => {
    const gallery = new Gallery(page, info, "docente");
    const { courseId, assignmentId, submissionId, examId } = demo!.teacher;
    const course = `/dashboard/aula/${courseId}`;
    if (await gallery.login(demo!.accounts.teacher, DEMO_PASSWORD)) {
      await gallery.shot("inicio", "/dashboard", { title: "¿Qué tengo hoy?", movil: true });
      await gallery.shot("portada del curso", course, { title: "Anatomía y Fisiología Básica" });
      await gallery.shot("contenido", `${course}/contenido`);
      await gallery.shot("asistencia", `${course}/asistencia`, { title: "Asistencia" });
      await gallery.shot("tareas", `${course}/tareas`);
      await gallery.shot("calificar entrega", `${course}/tareas/${assignmentId}?entrega=${submissionId}`, { title: /^Entrega de / });
      await gallery.shot("calificaciones", `${course}/calificaciones`, { title: /^Notas de \d+ estudiantes$/, movil: true });
      await gallery.shot("examen respuestas por revisar", `${course}/examenes/${examId}/resultados`);
      await gallery.shot("generar preguntas con ia", `${course}/generar-preguntas`, { title: "Generar preguntas con IA" });
    }
    gallery.finish();
  });

  test("estudiante", async ({ page }, info) => {
    const gallery = new Gallery(page, info, "estudiante");
    const { courseId, videoLessonId, homework, examResult } = demo!.student;
    const course = `/dashboard/aula/${courseId}`;
    if (await gallery.login(demo!.accounts.student, DEMO_PASSWORD)) {
      await gallery.shot("inicio", "/dashboard", { title: "¿Qué tengo hoy?", movil: true });
      await gallery.shot("mis cursos", "/dashboard/portal", { title: "Mis cursos" });
      await gallery.shot("portada del curso", course);
      await gallery.shot("leccion con video", `${course}/leccion/${videoLessonId}`, { movil: true });
      await gallery.shot("tarea", `/dashboard/aula/${homework.courseId}/tareas/${homework.assignmentId}`);
      await gallery.shot("resultado de examen", `/dashboard/aula/${examResult.courseId}/presentar/${examResult.examId}/resultado`, { title: /Resultado/ });
      await gallery.shot("mis notas", `${course}/mis-notas`, { title: "Mis notas" });
      await gallery.shot("mi asistencia", `${course}/asistencia`, { title: "Mi asistencia" });
      await gallery.shot("mi estado de cuenta", "/dashboard/mi-cuenta", { title: "Mi estado de cuenta", movil: true });
      await gallery.shot("notificaciones", "/dashboard/notificaciones", { title: "Notificaciones" });
      await gallery.shot("mis certificados", "/dashboard/mis-certificados", { title: "Mis certificados" });
    }
    gallery.finish();
  });

  test("tutor", async ({ page }, info) => {
    const gallery = new Gallery(page, info, "tutor");
    if (await gallery.login(demo!.accounts.guardian, DEMO_PASSWORD)) {
      await gallery.shot("inicio", "/dashboard", { title: "¿Cómo van mis hijos?", movil: true });
      await gallery.shot("ficha del hijo", `/dashboard/hijos/${demo!.student.studentId}`, { title: "Ana Mercedes Reyes" });
      await gallery.shot("estado de cuenta", "/dashboard/mi-cuenta", { title: /Estado de cuenta/ });
    }
    gallery.finish();
  });

  test("publico", async ({ page }, info) => {
    const gallery = new Gallery(page, info, "publico");
    await gallery.shot("catalogo de la institucion", `/catalogo/${demo!.institutionSlug}`, { movil: true });
    await gallery.shot("curso del catalogo", `/catalogo/${demo!.institutionSlug}/${demo!.catalogCourseId}`);
    gallery.finish();
  });

  test("operador", async ({ page }, info) => {
    test.skip(!demo?.operatorEmail, "El job no define PLATFORM_OPERATOR_EMAILS.");
    const gallery = new Gallery(page, info, "operador");
    // El operador del job es una cuenta de la semilla pequeña, con su contraseña.
    if (await gallery.login(demo!.operatorEmail!, SMOKE_PASSWORD)) {
      await gallery.shot("tablero del negocio", "/operador/tablero", { title: "Tablero del negocio" });
      await gallery.shot("instituciones", "/operador");
      await gallery.shot("ficha institucion demo", `/operador/${demo!.institutionId}`, { title: "Instituto Técnico Demo" });
      await gallery.shot("facturacion", "/operador/facturacion?estado=ALL", { title: "Facturación" });
    }
    gallery.finish();
  });
});
