import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type ConsoleMessage, type Page, type Response, type TestInfo } from "@playwright/test";
import { SMOKE_DIR, SMOKE_PASSWORD } from "./shared";

export type ScreenStatus = "OK" | "FALLA" | "ADVERTENCIA";
export type ScreenRecord = { project: string; role: string; order: number; screen: string; url: string; status: ScreenStatus; detail: string; screenshot: string };

/**
 * Ruido conocido de consola que NO cuenta como defecto. Mantener corta y explicada:
 * - Recursos de terceros (YouTube y sus dominios): el contenedor de CI puede bloquearlos y escriben sus propios avisos.
 * - «favicon.ico» ausente.
 * - Avisos del navegador sobre funciones bloqueadas por Permissions-Policy dentro del iframe de YouTube.
 * - Fallos de red hacia fuera del contenedor (sin internet, DNS, peticiones canceladas al cambiar de página).
 */
const IGNORED_CONSOLE: RegExp[] = [
  /youtube|ytimg|googlevideo|doubleclick|google\.com|gstatic|ggpht/i,
  /favicon\.ico/i,
  /Permissions-Policy|Permissions policy violation/i,
  /net::ERR_(INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|BLOCKED_BY_CLIENT|TUNNEL_CONNECTION_FAILED|ABORTED)/i,
];

/** Textos de las pantallas de error: Next («This page couldn't load», «Application error») y el `error.tsx` del dashboard. */
const ERROR_TEXTS = [/This page couldn[’']t load/i, /Application error/i, /No pudimos cargar esta sección/i, /Internal Server Error/i];
/** 404: `not-found.tsx` del dashboard y el 404 de Next. */
const NOT_FOUND_TEXTS = [/Recurso no encontrado/i, /This page could not be found/i];

const slug = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * Recorre pantallas de un rol. Cada pantalla se revisa y se captura aunque la anterior haya fallado;
 * al final `finish()` hace fallar la prueba si hubo algún defecto.
 */
export class Tour {
  private readonly records: ScreenRecord[] = [];
  private consoleErrors: string[] = [];
  private serverErrors: string[] = [];
  private missing: string[] = [];
  private order: number;
  private readonly project: string;
  private readonly isMobile: boolean;
  private readonly origin: string;
  private readonly page: Page;
  private readonly info: TestInfo;
  private readonly role: string;

  constructor(page: Page, info: TestInfo, role: string, firstNumber: number) {
    this.page = page;
    this.info = info;
    this.role = role;
    this.order = firstNumber;
    this.project = info.project.name;
    this.isMobile = (info.project.use.viewport?.width ?? 1280) < 600;
    this.origin = new URL(info.project.use.baseURL ?? "http://127.0.0.1:3000").origin;
    page.on("console", (message: ConsoleMessage) => {
      if (message.type() !== "error") return;
      const text = `${message.text()} ${message.location().url ?? ""}`;
      if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return;
      this.consoleErrors.push(`consola: ${message.text().slice(0, 300)}`);
    });
    page.on("pageerror", (error) => {
      if (IGNORED_CONSOLE.some((pattern) => pattern.test(error.message))) return;
      this.consoleErrors.push(`error de página: ${error.message.slice(0, 300)}`);
    });
    page.on("response", (response: Response) => {
      if (!response.url().startsWith(this.origin)) return;
      const where = `${response.request().method()} ${new URL(response.url()).pathname}`;
      if (response.status() >= 500) this.serverErrors.push(`${response.status()} en ${where}`);
      // Los 4xx solo se anotan para explicar un «Failed to load resource» de la consola (dice el estado, no la dirección).
      else if (response.status() >= 400) this.missing.push(`${response.status()} en ${where}`);
    });
  }

  async login(email: string) {
    await this.page.goto("/login");
    await this.page.getByLabel("Correo electrónico").fill(email);
    await this.page.getByLabel("Contraseña").fill(SMOKE_PASSWORD);
    await this.page.getByRole("button", { name: "Ingresar" }).click();
    await this.page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  }

  /** Abre una ruta y la revisa. `ready` puede esperar algo propio de la pantalla. */
  async open(screen: string, path: string, ready?: () => Promise<void>) {
    await this.step(screen, async () => {
      const response = await this.page.goto(path, { waitUntil: "domcontentloaded" });
      const status = response?.status() ?? 0;
      if (status >= 400) throw new Error(`La respuesta principal fue ${status}.`);
      if (ready) await ready();
    });
  }

  /** Ejecuta una interacción y revisa cómo quedó la pantalla. Nunca lanza: lo que falle queda en el informe. */
  async step(screen: string, action: () => Promise<void>) {
    this.consoleErrors = [];
    this.serverErrors = [];
    this.missing = [];
    const problems: string[] = [];
    const warnings: string[] = [];
    try {
      await action();
    } catch (error) {
      problems.push((error instanceof Error ? error.message : String(error)).split("\n").slice(0, 3).join(" ").slice(0, 400));
    }
    await this.page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);

    try {
      const body = await this.page.locator("body").innerText({ timeout: 5_000 });
      for (const pattern of ERROR_TEXTS) if (pattern.test(body)) problems.push(`Pantalla de error visible: «${body.match(pattern)?.[0]}».`);
      for (const pattern of NOT_FOUND_TEXTS) if (pattern.test(body)) problems.push(`404 inesperado: «${body.match(pattern)?.[0]}».`);
      const leaked = body.match(/Código: [0-9a-f-]{8,}/i);
      if (leaked) problems.push(`La pantalla muestra un error del servidor («${leaked[0]}»).`);
    } catch (error) {
      problems.push(`No se pudo leer la pantalla: ${error instanceof Error ? error.message.slice(0, 200) : String(error)}`);
    }
    problems.push(...new Set(this.serverErrors), ...new Set(this.consoleErrors));
    if (this.consoleErrors.some((text) => /Failed to load resource/.test(text)) && this.missing.length) {
      problems.push(`Respuestas con error: ${[...new Set(this.missing)].join(", ")}`);
    }

    if (this.isMobile) {
      const overflow = await this.page
        .evaluate(() => {
          const found: string[] = [];
          const root = document.documentElement;
          if (root.scrollWidth > root.clientWidth + 1) found.push(`la página mide ${root.scrollWidth}px de ancho en una pantalla de ${root.clientWidth}px`);
          for (const element of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
            if (element.clientWidth < window.innerWidth * 0.9) continue;
            const overflowX = getComputedStyle(element).overflowX;
            if ((overflowX === "auto" || overflowX === "scroll") && element.scrollWidth > element.clientWidth + 1) {
              found.push(`el contenido mide ${element.scrollWidth}px de ancho dentro de ${element.clientWidth}px`);
              break;
            }
          }
          return found;
        })
        .catch(() => [] as string[]);
      if (overflow.length) warnings.push(`Desbordamiento horizontal: ${overflow.join("; ")}.`);
    }

    const file = `${String(this.order).padStart(3, "0")}-${slug(this.role)}-${slug(screen)}.jpg`;
    const directory = join(process.cwd(), SMOKE_DIR, "screenshots", this.project);
    mkdirSync(directory, { recursive: true });
    await this.capture(join(directory, file)).catch((error) => {
      warnings.push(`No se pudo guardar la captura: ${String(error).slice(0, 150)}`);
    });

    // El texto visible de la pantalla también se guarda: sirve para revisar redacción y términos internos.
    const textDirectory = join(process.cwd(), SMOKE_DIR, "texts", this.project);
    mkdirSync(textDirectory, { recursive: true });
    const text = await this.page.locator("body").innerText({ timeout: 5_000 }).catch(() => "(no se pudo leer el texto)");
    writeFileSync(join(textDirectory, file.replace(/\.jpg$/, ".txt")), `${this.page.url()}\n\n${text.replace(/\n{3,}/g, "\n\n")}\n`);

    const url = new URL(this.page.url());
    this.records.push({
      project: this.project,
      role: this.role,
      order: this.order,
      screen,
      url: url.pathname + url.search,
      status: problems.length ? "FALLA" : warnings.length ? "ADVERTENCIA" : "OK",
      detail: [...problems, ...warnings].join(" · ").replace(/\|/g, "/").replace(/\s+/g, " "),
      screenshot: `screenshots/${this.project}/${file}`,
    });
    this.order += 1;
    this.save();
  }

  /**
   * Captura de la pantalla completa. El panel desliza su contenido dentro de un contenedor de alto fijo,
   * así que `fullPage` solo no basta: se agranda la ventana lo necesario para que quepa todo y luego se restaura.
   */
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
      await this.page.screenshot({ path, fullPage: true, animations: "disabled", type: "jpeg", quality: 55 });
    } finally {
      if (grow && original) await this.page.setViewportSize(original);
    }
  }

  private save() {
    const directory = join(process.cwd(), SMOKE_DIR, "results");
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, `${this.project}-${slug(this.role)}.json`), JSON.stringify(this.records, null, 2));
  }

  /** Registra que el recorrido del rol no pudo empezar o se cortó. */
  async aborted(reason: string) {
    await this.step("recorrido interrumpido", async () => {
      throw new Error(reason);
    });
  }

  finish() {
    const failures = this.records.filter((record) => record.status === "FALLA").map((record) => `${record.screen}: ${record.detail}`);
    this.info.annotations.push({ type: "pantallas", description: `${this.records.length} revisadas, ${failures.length} con defectos` });
    expect(failures, `Defectos encontrados en el recorrido de ${this.role}`).toEqual([]);
  }
}
