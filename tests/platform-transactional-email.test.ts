import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createRequire } from "node:module";
import { applicationEmailLink } from "../src/server/email/links";
const { loadWithStubs } = createRequire(import.meta.url)("./helpers/load-with-stubs.cjs");
const stubs = { "@/lib/db": { db: new Proxy({}, { get() { throw new Error("Email composition must not query DB"); } }) } };
const { transactionalEmail }: typeof import("../src/server/email/layout") = loadWithStubs("src/server/email/layout.ts", stubs);
const { invitationEmail, resetEmail }: typeof import("../src/server/email/access") = loadWithStubs("src/server/email/access.ts", stubs);
const { catalogEmail }: typeof import("../src/server/email/catalog") = loadWithStubs("src/server/email/catalog.ts", stubs);
const { noticeEmail }: typeof import("../src/server/email/notice") = loadWithStubs("src/server/email/notice.ts", stubs);
const brand = { name: "Instituto de Formación", domain: "campus.example.test", settings: {} };
const message = { to: "persona@example.test", subject: "Tu acceso", text: "Texto original de prueba.\nSegunda línea." };
const href = "https://campus.example.test/restablecer/FICTICIO-no-utilizable_123";
const publicLogo = "https://raw.githubusercontent.com/cank3r/edukana/673bb72eec620ddf6a3290b8f394b70ef11e23e9/public/logos/edukana_email.png";
const view = { category: "Tu cuenta", heading: "Una acción", preheader: "Resumen", name: "Andrea" };
beforeEach(() => {
  process.env.APP_URL = "https://platform.example.test";
  for (const key of ["AUTH_URL", "NEXTAUTH_URL", "PLATFORM_ROOT_DOMAIN", "ROOT_DOMAIN", "NEXT_PUBLIC_ROOT_DOMAIN"])
    delete process.env[key];
});

test("platform logo is public and commit-pinned independently of preview and institution origins", () => {
  process.env.APP_URL = "https://protected-preview.example.test";
  for (const context of [null, { name: "Instituto", settings: {} }, brand]) {
    const result = transactionalEmail(context, message, { ...view, action: { label: "Continuar", href: "/dashboard" }, preferences: true });
    assert.ok(result.html!.includes(`src="${publicLogo}" alt="Edukana"`));
    const origin = context && "domain" in context ? "https://campus.example.test" : process.env.APP_URL;
    assert.ok(result.html!.includes(`href="${origin}/dashboard"`));
    assert.ok(result.html!.includes(`href="${origin}/dashboard/notificaciones/preferencias"`));
    assert.equal(result.to, message.to); assert.equal(result.subject, message.subject);
  }
});

test("institutional logos retain their validated origins while platform branding uses the public asset", () => {
  for (const logoUrl of ["/api/public-images/custom_logo", "https://institution.example.test/custom.png"]) {
    const html = transactionalEmail({ ...brand, logoUrl }, message, view).html!;
    const expected = logoUrl.startsWith("/") ? `https://campus.example.test${logoUrl}` : logoUrl;
    assert.ok(html.includes(`src="${expected}"`)); assert.ok(html.includes(`src="${publicLogo}"`));
  }
});

test("new invitation preserves recipient, subject, exact token URL and expiration in both alternatives", () => {
  const result = invitationEmail(brand, { ...message, text: `${message.text}\n${href}` },
    { name: "Andrea", href, days: 7, existing: false });
  assert.equal(result.to, message.to); assert.equal(result.subject, message.subject);
  assert.ok(result.text.includes(href)); assert.match(result.text, /7 días|solo funciona una vez/);
  assert.match(result.text, /https:\/\/campus.example.test\/recuperar/);
  assert.match(result.html!, /Crear mi contraseña/); assert.match(result.html!, /7 días/);
  assert.ok(result.html!.includes(`href="${href}"`)); assert.ok(result.html!.includes('href="https://campus.example.test/recuperar"'));
  assert.doesNotMatch(result.html!, /preferencias/);
  assert.match(result.html!, /lang="es"/); assert.match(result.html!, /edukana_email\.png/);
});
test("existing-account invitation only links to login and never offers password creation", () => {
  const result = invitationEmail(brand, message,
    { name: "Andrea", href: "https://campus.example.test/login", days: 7, existing: true });
  assert.match(result.html!, /Entrar a la plataforma/); assert.match(result.html!, /contraseña de siempre/);
  assert.doesNotMatch(result.html!, /Crear mi contraseña|7 días|restablecer|recuperar|preferencias/);
});
test("password recovery retains 60 minutes, one use, original token and unsolicited-request copy", () => {
  const result = resetEmail(brand, message, { name: "Andrea", href, minutes: 60 });
  assert.match(result.html!, /60 minutos/); assert.match(result.html!, /una sola vez/);
  assert.match(result.html!, /Si no lo pediste/); assert.ok(result.html!.includes(`href="${href}"`));
  assert.doesNotMatch(result.html!, /preferencias|7 días/);
});
test("neutral recovery uses only the platform context", () => {
  const result = resetEmail(null, message,
    { name: "Andrea", href: "https://platform.example.test/restablecer/FICTICIO", minutes: 60 });
  assert.equal(result.fromName, "Edukana"); assert.match(result.html!, /https:\/\/platform.example.test\/restablecer/);
  assert.doesNotMatch(result.html!, /Instituto de Formación|campus.example.test/);
});
test("pending order preserves summary/instructions, with no invented pay or access CTA", () => {
  const result = catalogEmail(brand, message, { kind: "pending-order", name: "Andrea", course: "Informática",
    number: "PED-FICTICIO", total: "RD$ 1,500.00", instructions: "Primera instrucción.\nSegunda <script>instrucción</script>.\nhttps://outside.example.test" });
  for (const text of ["Informática", "PED-FICTICIO", "RD$ 1,500.00", "Primera instrucción.", "Segunda &lt;script&gt;"])
    assert.ok(result.html!.includes(text));
  assert.doesNotMatch(result.html!, /<script>|href=|preferencias/);
  assert.equal(result.text, `${message.text}\n\nHecho con Edukana`);
});
test("already-enrolled order retains its existing platform login even for a custom institution domain", () => {
  const result = catalogEmail(brand, message, { kind: "already-enrolled", name: "Andrea", course: "Informática",
    loginHref: "https://platform.example.test/login" });
  assert.match(result.html!, /no necesitas pagar/i);
  assert.ok(result.html!.includes('href="https://platform.example.test/login"'));
  assert.ok(!result.html!.includes('href="https://campus.example.test/login"'));
});
test("catalog role mismatch explains the next step without a fabricated link or changed role", () => {
  const result = catalogEmail(brand, message, { kind: "role-mismatch", name: "Andrea", course: "Informática" });
  assert.match(result.html!, /no es de estudiante/); assert.match(result.html!, /Pide a la institución/);
  assert.doesNotMatch(result.html!, /href=|preferencias/);
});
test("all eight notification families preserve the event body, delivery fields and preferences", () => {
  const kinds = ["grade", "announcement", "assignment", "submission", "exam", "live_class", "certificate", "charge"];
  for (const kind of kinds) {
    const result = noticeEmail(brand, message,
      { kind, title: "Título original", body: "Resumen & detalles", href: "/dashboard/recurso", name: "Andrea" });
    assert.equal(result.to, message.to); assert.equal(result.subject, message.subject);
    assert.equal(result.text, `${message.text}\n\nHecho con Edukana`);
    assert.match(result.html!, /Resumen &amp; detalles/); assert.match(result.html!, /Elegir qué correos recibo/);
    assert.match(result.html!, /href="https:\/\/campus.example.test\/dashboard\/recurso"/);
  }
});
test("grade new/corrected summaries preserve privacy and do not invent scores or feedback", () => {
  for (const prefix of ["Ya tienes nota en", "Se corrigió tu nota en"]) {
    const result = noticeEmail(brand, message, { kind: "grade", title: `${prefix} «Actividad»`,
      body: "Curso: Informática. Abre la tarea para ver tu nota y los comentarios.", href: "/dashboard/tarea", name: "Andrea" });
    assert.match(result.html!, /Actividad/); assert.match(result.html!, /Informática/);
    assert.match(result.html!, /Tu nota y los comentarios se consultan dentro de la plataforma/);
    assert.doesNotMatch(result.html!, /100\/100|90 puntos|Excelente trabajo/);
    assert.ok(result.html!.includes(prefix.startsWith("Se") ? "Tu nota fue actualizada" : "Tu tarea ya fue calificada"));
  }
});
test("notification without a target retains the platform instruction from PR125", () => {
  const result = noticeEmail(brand, message, { kind: "announcement", title: "Aviso", body: "Resumen", href: null, name: "Andrea" });
  assert.match(result.html!, /Entra a la plataforma de Instituto de Formación para continuar/);
});
test("invitation white-label is consistent across HTML, plain text and display name", () => {
  const custom = { ...brand, platformSubscription: { plan: { features: { whiteLabel: true } } } };
  for (const existing of [true, false]) {
    const action = existing ? "https://campus.example.test/login" : href;
    const result = invitationEmail(custom, { ...message, text: `${brand.name} te dio acceso a Edukana.` },
      { name: "Andrea", href: action, days: 7, existing });
    assert.doesNotMatch(result.html!, /Edukana/); assert.doesNotMatch(result.text, /Edukana/);
    assert.equal(result.fromName, brand.name); assert.ok(result.text.includes(action));
    assert.match(result.text, existing ? /contraseña de siempre/ : /7 días/);
  }
});
test("plan white-label hides platform logo, footer and sender attribution; explicit false wins", () => {
  const custom = { ...brand, logoUrl: "/api/public-images/custom_logo", brandColor: "#0F766E",
    settings: { platform: { hideEdukanaBrand: false } }, platformSubscription: { plan: { features: { whiteLabel: true } } } };
  const hidden = transactionalEmail(custom, message, view);
  assert.doesNotMatch(hidden.html!, /Edukana|edukana_email/); assert.doesNotMatch(hidden.text, /Edukana/);
  assert.equal(hidden.fromName, brand.name); assert.match(hidden.html!, /custom_logo/); assert.match(hidden.html!, /#0F766E/);
  const visible = transactionalEmail({ ...custom, settings: { platform: { hideEdukanaBrand: true } },
    platformSubscription: { plan: { features: { whiteLabel: false } } } }, message, view);
  assert.match(visible.html!, /edukana_email/); assert.equal(visible.fromName, `${brand.name} vía Edukana`);
});
test("all visible fields are escaped and unsafe logos are discarded", () => {
  const malicious = '<img src=x onerror="attack()"><script>attack()</script>';
  const result = transactionalEmail({ ...brand, name: malicious, logoUrl: "javascript:attack()", brandColor: "red;background:url(x)" },
    { ...message, subject: "Aviso\r\nBcc: somebody@example.test" }, { ...view, name: malicious, heading: malicious,
      paragraphs: [malicious], summary: [{ label: malicious, value: malicious }],
      callout: { title: malicious, text: malicious }, action: { label: malicious, href: "/dashboard" } });
  assert.doesNotMatch(result.html!, /<script>|<img src=x|javascript:|background:url/);
  assert.match(result.html!, /&lt;img/); assert.match(result.html!, /edukana_email\.png/);
  assert.doesNotMatch(result.subject, /[\r\n]/); assert.doesNotMatch(result.fromName!, /[\r\n]/);
});
test("application links reject cross-origin, credentials, unsafe schemes and control characters", () => {
  for (const path of ["//evil.test", "https://evil.test", "javascript:alert(1)", "/\\evil", "/\nfoo", "https://x@y.test",
    "https://user@campus.example.test/private", "data:text/html,x", "relative-path"]) {
    assert.equal(applicationEmailLink("https://campus.example.test", path), null, path);
  }
  assert.equal(applicationEmailLink("http://campus.example.test", "/login"), null);
  assert.equal(applicationEmailLink("http://localhost:3000", "/login"), "http://localhost:3000/login");
  assert.equal(applicationEmailLink("https://campus.example.test", href), href);
});
test("invalid CTA never renders, while query characters in a valid CTA are escaped", () => {
  const invalid = transactionalEmail(brand, message, { ...view, action: { label: "Continuar", href: "https://evil.test" } });
  assert.doesNotMatch(invalid.html!, /href=|evil.test/); assert.match(invalid.html!, /Entra a la plataforma/);
  const valid = transactionalEmail(brand, message, { ...view, action: { label: "Continuar", href: "/dashboard?a=1&b=2" } });
  assert.match(valid.html!, /a=1&amp;b=2/);
});
test("missing application URL retains the public logo and omits unavailable actions", () => {
  delete process.env.APP_URL;
  const result = transactionalEmail({ name: "Instituto", settings: {} }, message,
    { ...view, action: { label: "Continuar", href: "/login" }, preferences: true });
  assert.doesNotMatch(result.html!, /href=|null\/|undefined/);
  assert.ok(result.html!.includes(`src="${publicLogo}" alt="Edukana"`));
  assert.match(result.html!, /Entra a la plataforma/); assert.match(result.html!, /Puedes elegir qué correos recibes/);
});
