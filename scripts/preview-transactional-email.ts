import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import type { EmailBrand } from "../src/server/platform/branded-email";
import type { EmailMessage } from "../src/server/integrations/email";

// Synthetic data only. No env file, real token, database or provider is loaded.
const { loadWithStubs } = createRequire(import.meta.url)("../tests/helpers/load-with-stubs.cjs");
const stubs = { "@/lib/db": { db: new Proxy({}, { get() { throw new Error("Preview cannot use DB"); } }) } };
const { invitationEmail, resetEmail }: typeof import("../src/server/email/access") = loadWithStubs("src/server/email/access.ts", stubs);
const { catalogEmail }: typeof import("../src/server/email/catalog") = loadWithStubs("src/server/email/catalog.ts", stubs);
const { noticeEmail }: typeof import("../src/server/email/notice") = loadWithStubs("src/server/email/notice.ts", stubs);
const root = resolve("docs/transactional-email-preview");

async function main() {
  process.env.APP_URL = "https://platform.example.test";
  for (const key of ["AUTH_URL", "NEXTAUTH_URL", "PLATFORM_ROOT_DOMAIN", "ROOT_DOMAIN", "NEXT_PUBLIC_ROOT_DOMAIN"])
    delete process.env[key];
  const brand: EmailBrand = { name: "Instituto Demo Edukana", domain: "campus.example.test", settings: {} };
  const name = "Andrea";
  const href = "https://campus.example.test/restablecer/FICTICIO-SIN-VALIDEZ";
  const message = { to: "andrea@example.test", subject: `Tu acceso a ${brand.name}`,
    text: `Hola, Andrea:\n\n${brand.name} te dio acceso a su plataforma.\n\nCrea tu contraseña: ${href}\nVence en 7 días.\n\nhttps://campus.example.test/recuperar` };
  const fixtures: Array<{ id: string; label: string; message: EmailMessage; blocked?: boolean }> = [];
  const add = (id: string, label: string, mail: EmailMessage, blocked = false) => fixtures.push({ id, label, message: mail, blocked });
  const invite = invitationEmail(brand, message, { name, href, days: 7, existing: false });
  add("invitation", "Invitación · crear contraseña", invite);
  add("existing-account", "Invitación · cuenta existente", invitationEmail(brand,
    { ...message, text: "Entra con tu contraseña de siempre.\nhttps://campus.example.test/login" },
    { name, href: "https://campus.example.test/login", days: 7, existing: true }));
  add("reset", "Recuperación · 60 minutos", resetEmail(brand,
    { ...message, subject: "Restablece tu contraseña", text: `Recibimos tu solicitud.\n${href}\nVence en 60 minutos.\nSi no lo pediste, ignora este mensaje.` },
    { name, href, minutes: 60 }));
  const catalogMessage = { ...message, subject: "Tu pedido de Informática", text: "Pedido ficticio PED-000. Total: RD$ 1,500.00." };
  add("catalog-pending", "Catálogo · pedido pendiente", catalogEmail(brand, catalogMessage,
    { kind: "pending-order", name, course: "Introducción a la informática", number: "PED-000", total: "RD$ 1,500.00",
      instructions: "Contacta a la institución para recibir las instrucciones de pago.\nIndica el número de tu pedido." }));
  add("catalog-access", "Catálogo · ya inscrita", catalogEmail(brand,
    { ...catalogMessage, text: "Ya tienes acceso. No necesitas pagar.\nhttps://platform.example.test/login" },
    { kind: "already-enrolled", name, course: "Introducción a la informática", loginHref: "https://platform.example.test/login" }));
  add("catalog-role", "Catálogo · contactar institución", catalogEmail(brand,
    { ...catalogMessage, subject: "Tu solicitud", text: "Tu cuenta no es de estudiante. Pide a la institución que te inscriba." },
    { kind: "role-mismatch", name, course: "Introducción a la informática" }));
  const notices = [
    ["grade", "Ya tienes nota en «Actividad de práctica»", "Curso: Introducción a la informática. Abre la tarea para ver tu nota y los comentarios."],
    ["announcement", "El curso comienza el lunes", "El material de bienvenida ya está disponible."],
    ["assignment", "Nueva tarea: actividad de práctica", "Entrega tu actividad antes del viernes a las 17:00."],
    ["submission", "Andrea entregó su actividad", "Ya puedes revisar la entrega de Actividad de práctica."],
    ["exam", "Ya está disponible el examen", "Revisa las instrucciones y el horario en la plataforma."],
    ["live_class", "Tu próxima clase en vivo", "La clase comienza el lunes a las 18:00."],
    ["certificate", "Tu certificado está listo", "Puedes consultarlo en la plataforma."],
    ["charge", "Nuevo cargo en tu cuenta", "Importe: RD$ 1,500.00. Revisa los detalles y el vencimiento en Mi cuenta."],
  ];
  for (const [kind, title, body] of notices) {
    add(kind, `Notificación · ${kind}`, noticeEmail(brand,
      { ...message, subject: title, text: `${title}\n${body}\nhttps://campus.example.test/dashboard\nhttps://campus.example.test/dashboard/notificaciones/preferencias` },
      { kind, title, body, href: "/dashboard", name }));
  }
  add("corrected", "Nota corregida", noticeEmail(brand, { ...message, subject: "Se corrigió tu nota", text: "Consulta tu nota en la plataforma." },
    { kind: "grade", title: "Se corrigió tu nota en «Actividad de práctica»", body: notices[0][2], href: "/dashboard", name }));
  const whiteLabel = { ...brand, name: "Instituto de Formación", brandColor: "#0F766E",
    platformSubscription: { plan: { features: { whiteLabel: true } } } };
  add("white-label", "Marca blanca · sin logo propio", invitationEmail(whiteLabel,
    { ...message, subject: `Tu acceso a ${whiteLabel.name}`, text: `Tu institución te dio acceso.\n${href}\nVence en 7 días.` },
    { name, href, days: 7, existing: false }));
  add("long-names", "Nombres largos", invitationEmail({ ...brand, name: "Instituto de Formación Profesional y Educación Continua" }, message,
    { name: "María de los Ángeles", href, days: 7, existing: false }));
  add("images-blocked", "Imágenes bloqueadas", invite, true);
  delete process.env.APP_URL;
  add("missing-url", "Sin origen ni logo institucional", invitationEmail({ name: "Instituto de Formación", settings: {} }, message,
    { name, href, days: 7, existing: false }));
  process.env.APP_URL = "https://platform.example.test";
  const logo = await readFile("public/logos/edukana_email.png");
  const embedded = `data:image/png;base64,${logo.toString("base64")}`;
  await mkdir(root, { recursive: true });
  for (const fixture of fixtures) {
    await writeFile(`${root}/${fixture.id}.source.html`, fixture.message.html!);
    await writeFile(`${root}/${fixture.id}.txt`, `Asunto: ${fixture.message.subject}\n\n${fixture.message.text}`);
    await writeFile(`${root}/${fixture.id}.html`, fixture.message.html!
      .replaceAll("https://campus.example.test/logos/edukana_email.png", fixture.blocked ? "data:image/png;base64,AA==" : embedded)
      .replace(/href="[^"]+"/gu, 'href="#vista-previa"'));
  }
  await writeFile(`${root}/index.html`, `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Correos Edukana · revisión</title><body style="font:16px/1.5 Arial,sans-serif;margin:32px;background:#F4F7FC;color:#101B3F;">
<h1>Correos transaccionales de Edukana</h1><p>Datos ficticios. Enlaces inertes en las vistas portátiles. No se envió ningún mensaje.</p>
<p>Las capturas locales no acreditan Gmail, Outlook, VML ni modo oscuro.</p><ul>
${fixtures.map((f) => `<li style="margin:12px 0;"><a href="${f.id}.html">${f.label}</a> · <a href="${f.id}.txt">Texto</a> · <a href="${f.id}.source.html">HTML fuente</a></li>`).join("")}
</ul><p><a href="invitation-360.png">Invitación móvil</a> · <a href="invitation-1280.png">Invitación escritorio</a> · <a href="render-evidence.json">Medidas de render</a></p></body></html>`);
  if (!process.argv.includes("--render")) return;
  const executablePath = process.argv.find((arg) => arg.startsWith("--chromium="))?.slice("--chromium=".length);
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const evidence = [];
  try {
    for (const width of [320, 360, 600, 1280]) for (const fixture of fixtures) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, serviceWorkers: "block" });
      await page.route("**/*", async (route) => {
        if (!fixture.blocked && route.request().url() === "https://campus.example.test/logos/edukana_email.png")
          await route.fulfill({ body: logo, contentType: "image/png" });
        else await route.abort();
      });
      await page.setContent(fixture.message.html!, { waitUntil: "load" });
      const metrics = await page.evaluate(() => {
        const anchors = [...document.querySelectorAll("a")];
        const images = [...document.querySelectorAll("img")];
        return { width: innerWidth, documentWidth: document.documentElement.scrollWidth,
          links: anchors.map((a) => ({ text: a.textContent, height: a.getBoundingClientRect().height, right: a.getBoundingClientRect().right })),
          images: images.map((img) => ({ alt: img.alt, loaded: img.naturalWidth > 0 })),
          headingCount: document.querySelectorAll("h1").length,
          preheaderHidden: getComputedStyle(document.body.firstElementChild!).display === "none",
          presentational: [...document.querySelectorAll("table")].every((t) => t.getAttribute("role") === "presentation") };
      });
      assert.ok(metrics.documentWidth <= width, `${fixture.id}/${width}: overflow`);
      assert.ok(metrics.links.every((a) => a.height >= 44 && a.right <= width), `${fixture.id}: link size`);
      assert.equal(metrics.headingCount, 1); assert.ok(metrics.preheaderHidden && metrics.presentational);
      assert.ok(metrics.images.every((img) => img.alt && img.loaded === !fixture.blocked));
      if (metrics.links.length) {
        await page.keyboard.press("Tab");
        assert.equal(await page.evaluate(() => document.activeElement?.textContent), metrics.links[0].text);
        await page.evaluate(() => (document.activeElement as HTMLElement).blur());
      }
      evidence.push({ engine: "chromium", version: browser.version(), fixture: fixture.id, status: "PASS", ...metrics });
      if ([360, 1280].includes(width)) await page.screenshot({ path: `${root}/${fixture.id}-${width}.png`, fullPage: true });
      await page.close();
    }
  } finally { await browser.close(); }
  await writeFile(`${root}/render-evidence.json`, JSON.stringify({ externalRequestsAllowed: 0, count: evidence.length, evidence }, null, 2));
  console.log(`PASS ${evidence.length} local renders; external requests allowed: 0.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
