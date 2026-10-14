import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { chromium, firefox } from "@playwright/test";
import type { EmailBrand } from "../src/server/platform/branded-email";

// Synthetic fixtures only. No env files, database, provider, credential or remote page is opened.
const { loadWithStubs } = createRequire(import.meta.url)("../tests/helpers/load-with-stubs.cjs");
const { notificationEmail }: typeof import("../src/server/notifications/email-template") = loadWithStubs(
  "src/server/notifications/email-template.ts", { "@/lib/db": { db: new Proxy({}, { get() { throw new Error("Preview cannot use DB"); } }) } },
);
async function main() {
process.env.APP_URL = "https://platform.example.test";
delete process.env.PLATFORM_ROOT_DOMAIN;
delete process.env.AUTH_URL;
delete process.env.NEXTAUTH_URL;
const output = resolve("docs/email-preview");
await mkdir(output, { recursive: true });
const brand: EmailBrand = { name: "Instituto Demo Edukana", domain: "campus.example.test", settings: {} };
const notice = { kind: "grade", name: "Andrea", title: "Ya tienes nota en «Actividad de práctica»",
  body: "Curso: Introducción a la informática. Abre la tarea para ver tu nota y los comentarios.",
  href: "/dashboard/aula/curso-demo/tareas/actividad-demo" };
const whiteLabel = { ...brand, name: "Instituto de Formación", brandColor: "#0F766E",
  platformSubscription: { plan: { features: { whiteLabel: true } } } };
const fixtures = [
  { id: "grade", label: "Nota publicada", brand, notice },
  { id: "corrected", label: "Nota corregida", brand,
    notice: { ...notice, title: "Se corrigió tu nota en «Actividad de práctica»" } },
  { id: "white-label", label: "Marca blanca sin logo propio configurado", brand: whiteLabel, notice },
  { id: "announcement", label: "Aviso", brand,
    notice: { ...notice, kind: "announcement", title: "El curso comienza el lunes", body: "El material de bienvenida ya está disponible.",
      href: "/dashboard/notificaciones" } },
  { id: "long", label: "Nombres largos", brand: { ...brand, name: "Instituto de Formación Profesional y Educación Continua" },
    notice: { ...notice, name: "María de los Ángeles", title: `Ya tienes nota en «${"ActividadSinEspacios".repeat(8)}»`,
      body: "Curso: Fundamentos de investigación, análisis y presentación de proyectos. Abre la tarea para ver tu nota y los comentarios." } },
];
const logo = await readFile("public/logos/edukana_email.png");
const embeddedLogo = `data:image/png;base64,${logo.toString("base64")}`;
const rendered: Array<{ id: string; html: string; label: string }> = [];
for (const fixture of fixtures) {
  const message = notificationEmail(fixture.brand, { to: "andrea@example.test", subject: fixture.notice.title,
    text: `Hola, Andrea:\n\n${fixture.notice.title}\n\n${fixture.notice.body}\n\nhttps://campus.example.test${fixture.notice.href}` }, fixture.notice);
  const html = message.html!;
  rendered.push({ id: fixture.id, html, label: fixture.label });
  await writeFile(`${output}/${fixture.id}.source.html`, html);
  // Portable review copy. Only the image URL is embedded; production uses the absolute public PNG URL.
  await writeFile(`${output}/${fixture.id}.html`, html.replaceAll("https://campus.example.test/logos/edukana_email.png", embeddedLogo));
}
await writeFile(`${output}/index.html`, `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Vista previa · Correos Edukana</title><body style="font-family:Arial,sans-serif;margin:32px;color:#101B3F;background:#F4F7FC">
<h1>Correos Edukana</h1><p>Datos ficticios. HTML real de la plantilla, con el logo incrustado solo para abrirlo sin conexión.</p>
<p>Las capturas verifican Chromium y Firefox locales; no acreditan Gmail ni Outlook.</p>
<ul>${rendered.map(({ id, label }) => `<li style="margin:16px 0"><a href="${id}.html">${label}</a> · <a href="${id}.source.html">HTML de envío</a></li>`).join("")}</ul>
<p><a href="grade-chromium-360.png">Captura móvil 360 px</a> · <a href="grade-chromium-1280.png">Captura escritorio 1280 px</a></p></body></html>`);

if (process.argv.includes("--render")) {
  const evidence: object[] = [];
  for (const [engine, browserType] of [["chromium", chromium], ["firefox", firefox]] as const) {
    const browser = await browserType.launch({ headless: true });
    try {
      for (const width of [320, 360, 600, 1280]) {
        const page = await browser.newPage({ viewport: { width, height: 1000 } });
        // Never fetch anything: the exact static production asset is fulfilled locally, everything else is blocked.
        await page.route("**/*", async (route) => {
          if (route.request().url() === "https://campus.example.test/logos/edukana_email.png")
            await route.fulfill({ body: logo, contentType: "image/png" });
          else await route.abort();
        });
        for (const fixture of rendered) {
          await page.setContent(fixture.html, { waitUntil: "load" });
          const metrics = await page.evaluate(() => {
            const cta = document.querySelector<HTMLAnchorElement>('a[style*="inline-block"]')!;
            const rect = cta.getBoundingClientRect();
            const image = document.querySelector<HTMLImageElement>("img");
            return { viewport: innerWidth, width: document.documentElement.scrollWidth, ctaHeight: rect.height,
              ctaRight: rect.right, ctaText: cta.textContent, logoLoaded: image ? image.naturalWidth > 0 : null,
              preferencesHeight: document.querySelector('a[href$="/preferencias"]')!.getBoundingClientRect().height,
              tablesArePresentational: [...document.querySelectorAll("table")].every((table) => table.getAttribute("role") === "presentation"),
              headings: document.querySelectorAll("h1").length,
              preheaderHidden: getComputedStyle(document.body.firstElementChild!).display === "none" };
          });
          assert.ok(metrics.width <= width, `${engine}/${width}/${fixture.id}: horizontal overflow`);
          assert.ok(metrics.ctaHeight >= 44 && metrics.ctaRight <= width, `${fixture.id}: CTA size`);
          assert.ok(metrics.preferencesHeight >= 44, `${fixture.id}: preferences touch target`);
          assert.notEqual(metrics.logoLoaded, false); assert.ok(metrics.tablesArePresentational);
          assert.equal(metrics.headings, 1); assert.ok(metrics.preheaderHidden);
          evidence.push({ engine, version: browser.version(), fixture: fixture.id, ...metrics });
          if ((width === 360 || width === 1280) && (fixture.id === "grade" || width === 360))
            await page.screenshot({ path: `${output}/${fixture.id}-${engine}-${width}.png`, fullPage: true });
          await page.keyboard.press("Tab");
          assert.equal(await page.evaluate(() => document.activeElement?.textContent), metrics.ctaText);
        }
        await page.close();
        // A new context prevents Firefox from reusing the decoded image from the preceding fixture.
        const blockedPage = await browser.newPage({ viewport: { width, height: 1000 } });
        await blockedPage.route("**/*", (route) => route.abort());
        await blockedPage.setContent(rendered[0].html, { waitUntil: "load" });
        assert.equal(await blockedPage.locator("img").getAttribute("alt"), "Edukana");
        assert.equal(await blockedPage.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth), 0);
        assert.ok(await blockedPage.getByRole("heading", { name: "Tu tarea ya fue calificada" }).isVisible());
        assert.ok(await blockedPage.getByRole("link", { name: "Ver nota y comentarios" }).isVisible());
        assert.ok(await blockedPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        evidence.push({ engine, version: browser.version(), width, imagesBlocked: true, naturalWidth: 0, readable: true });
        if (width === 360) await blockedPage.screenshot({ path: `${output}/images-blocked-${engine}-360.png`, fullPage: true });
        await blockedPage.close();
      }
    } finally { await browser.close(); }
  }
  await writeFile(`${output}/render-evidence.json`, JSON.stringify(evidence, null, 2) + "\n");
  console.log(`PASS: ${evidence.length} local rendering scenarios. No email sent, no external request allowed.`);
}
console.log(`Preview: ${output}/index.html`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
