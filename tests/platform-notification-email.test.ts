import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createRequire } from "node:module";
import { MemoryEmailProvider, setEmailProviderForTests } from "../src/server/integrations/email";
import { contrastWithWhite } from "../src/server/platform/brand-color";
const { loadWithStubs } = createRequire(import.meta.url)("./helpers/load-with-stubs.cjs");
const brand = { name: "Instituto Demo Edukana", domain: "campus.example.test", settings: {} };
const message = { to: "persona@example.test", subject: "Instituto: nueva nota", text: "Contenido original\n\nSin cambios." };
const notice = { kind: "grade", name: "Andrea", title: "Ya tienes nota en «Actividad 1»",
  body: "Curso: Matemáticas. Abre la tarea para ver tu nota y los comentarios.", href: "/dashboard/aula/curso/tareas/tarea" };
let userQuery: unknown;
let wanted: Array<{ userId: string; email: boolean }> = [];
let people: object[] = [];
let submission: object | null = null;
let published = true;
const requests: unknown[] = [];
const mail = new MemoryEmailProvider();
const fakeDb = {
  notificationPreference: { findMany: async () => wanted },
  user: { findMany: async (query: unknown) => { userQuery = query; return people; } },
  submission: { findFirst: async () => submission },
  gradeEntry: { findMany: async () => [{ score: 97.31, feedback: "PRIVATE-FEEDBACK", isExcused: false }] },
};
const stubs = { "@/lib/db": { db: fakeDb } };
const { notificationEmail }: typeof import("../src/server/notifications/email-template") =
  loadWithStubs("src/server/notifications/email-template.ts", stubs);
const notifications: typeof import("../src/server/notifications") = loadWithStubs("src/server/notifications/index.ts", stubs);
const events: typeof import("../src/server/notifications/events") = loadWithStubs("src/server/notifications/events.ts", {
  ...stubs, "./index": { notifySafely: async (input: unknown) => { requests.push(input); } },
});

beforeEach(() => {
  process.env.APP_URL = "https://platform.example.test";
  delete process.env.PLATFORM_ROOT_DOMAIN; delete process.env.AUTH_URL; delete process.env.NEXTAUTH_URL;
  wanted = []; people = []; userQuery = undefined; requests.length = 0; published = true;
  mail.sent.length = 0; setEmailProviderForTests(mail);
  submission = { studentId: "student", enrollmentId: "enrollment", status: "GRADED", score: 97.31,
    feedback: "PRIVATE-FEEDBACK", assignment: { id: "task", title: "Actividad 1", courseId: "course",
      isPublished: true, course: { name: "Matemáticas" }, gradeItem: { get isPublished() { return published; }, id: "grade" } } };
});

test("grade has official logo, separate task/course, one CTA, compact preferences and unchanged text/headers", () => {
  const result = notificationEmail(brand, message, notice);
  assert.equal(result.to, message.to); assert.equal(result.subject, message.subject);
  assert.equal(result.fromName, `${brand.name} vía Edukana`);
  assert.equal(result.text, `${message.text}\n\nHecho con Edukana`);
  assert.match(result.html!, /src="https:\/\/campus.example.test\/logos\/edukana_email.png" alt="Edukana"/);
  for (const copy of ["Tu tarea ya fue calificada", "Actividad 1", "Matemáticas", "Ver nota y comentarios", "Elegir qué correos recibo"])
    assert.ok(result.html!.includes(copy), copy);
  assert.match(result.html!, /href="https:\/\/campus.example.test\/dashboard\/aula\/curso\/tareas\/tarea"/);
  assert.doesNotMatch(result.html!, /<main|<script|<style|<svg|display:flex|display:grid|<p[^>]*>&nbsp;<\/p>/);
  assert.match(result.html!, /v:roundrect/); assert.match(result.html!, /width="600"/);
  assert.ok(Buffer.byteLength(result.html!) < 25_000);
});

test("corrected grade uses updated copy; unfamiliar or truncated copy is preserved", () => {
  assert.match(notificationEmail(brand, message, { ...notice, title: "Se corrigió tu nota en «Actividad 1»" }).html!, /Tu nota fue actualizada/);
  const html = notificationEmail(brand, message, { ...notice, title: "Nueva nota sin formato", body: "Resumen disponible" }).html!;
  assert.match(html, /Nueva nota sin formato/); assert.match(html, /Resumen disponible/);
  assert.doesNotMatch(html, /Tu tarea ya fue calificada/);
});

test("all notification types have their own action without changing the subject or text", () => {
  const types = { announcement: "Leer aviso", assignment: "Ver tarea", submission: "Revisar entrega", exam: "Ver examen",
    live_class: "Ver clase", certificate: "Ver certificado", charge: "Ver estado de cuenta", unknown: "Ver notificación" };
  for (const [kind, cta] of Object.entries(types)) {
    const result = notificationEmail(brand, message, { ...notice, kind, title: "Un aviso", body: "Uno\n\nDos" });
    assert.ok(result.html!.includes(cta)); assert.doesNotMatch(result.html!, /Tu tarea ya fue calificada/);
    assert.equal(result.subject, message.subject); assert.equal(result.text, `${message.text}\n\nHecho con Edukana`);
  }
});

test("white-label follows plan precedence and preserves institutional logo/color", () => {
  const custom = { ...brand, name: "Colegio A", logoUrl: "/api/public-images/logo_a", brandColor: "#0F766E",
    settings: { platform: { hideEdukanaBrand: true } } };
  const hidden = notificationEmail(custom, message, notice);
  assert.doesNotMatch(hidden.html!, /Edukana|edukana_email/);
  assert.match(hidden.html!, /alt="Colegio A"/); assert.match(hidden.html!, /#0F766E/);
  assert.doesNotMatch(hidden.text, /Hecho con Edukana/);
  const visible = notificationEmail({ ...custom, platformSubscription: { plan: { features: { whiteLabel: false } } } }, message, notice);
  assert.match(visible.html!, /alt="Edukana"/); assert.match(visible.text, /Hecho con Edukana/);
  const planHidden = notificationEmail({ ...custom, settings: {},
    platformSubscription: { plan: { features: { whiteLabel: true } } } }, message, notice);
  assert.doesNotMatch(planHidden.html!, /edukana_email|Hecho con Edukana/);
});

test("escapes all content and rejects malicious logo/color/header/link input", () => {
  const result = notificationEmail({ ...brand, name: '<script>"A"</script>', logoUrl: "javascript:alert(1)",
    brandColor: 'red;background:url("evil")' }, { ...message, subject: "Aviso\r\nBcc: injected" },
  { ...notice, name: '<img onerror="bad">', title: '<script>alert(1)</script>', body: '<a href="https://evil.test">text</a>',
    href: '//evil.test' });
  assert.doesNotMatch(result.html!, /<script|onerror="|javascript:|background:url|href="https:\/\/evil/);
  assert.match(result.html!, /&lt;script&gt;/); assert.match(result.html!, /&lt;img/);
  assert.doesNotMatch(result.subject, /[\r\n]/);
});

test("unsafe/missing action never creates a button; canonical tenant links never cross origins", () => {
  for (const href of [null, "//evil.test", "/\\evil.test", "/\nevil", "https://evil.test", "javascript:alert(1)"]) {
    const html = notificationEmail(brand, message, { ...notice, href }).html!;
    assert.doesNotMatch(html, /v:roundrect/); assert.match(html, /Entra a la plataforma/);
  }
  const other = notificationEmail({ ...brand, domain: "other.example.test" }, message, notice);
  assert.doesNotMatch(other.html!, /campus.example.test/);
  assert.match(other.html!, /https:\/\/other.example.test\/dashboard/);
  assert.match(notificationEmail(brand, message, { ...notice, href: "/dashboard?x=1&y=2" }).html!, /x=1&amp;y=2/);
});

test("no APP_URL preserves delivery and readable branding without broken or fabricated links", () => {
  delete process.env.APP_URL;
  const result = notificationEmail({ name: "Instituto", settings: {} }, message, notice);
  assert.doesNotMatch(result.html!, /href=|src=|null\/|undefined\//);
  assert.match(result.html!, /Edukana/); assert.match(result.html!, /Notificaciones/);
  assert.equal(result.text, `${message.text}\n\nHecho con Edukana`);
});

test("CTA and text colors meet AA contrast on their actual backgrounds", () => {
  for (const brandColor of [undefined, "#FFFFFF", "#ffff00", "#24C8E5", "#0F766E", "invalid"]) {
    const html = notificationEmail({ ...brand, brandColor }, message, notice).html!;
    const color = /fillcolor="(#[0-9A-F]{6})"/.exec(html)![1];
    assert.ok(contrastWithWhite(color) >= 4.5, color);
  }
  assert.ok(contrastWithWhite("#101B3F") / contrastWithWhite("#F4F7FC") >= 4.5);
});

test("preferences link meets AA against its rendered footer for borderline institutional colors", () => {
  for (const brandColor of ["#767676", "#24C8E5", "#2457F5"]) {
    const html = notificationEmail({ ...brand, brandColor }, message, notice).html!;
    const link = /<a href="[^"]+\/preferencias" style="([^"]+)"/.exec(html)!;
    const foreground = /(?:^|;)color:(#[0-9A-F]{6})/i.exec(link[1])![1];
    const beforeLink = html.slice(0, link.index);
    const background = [...beforeLink.matchAll(/<td\b[^>]*bgcolor="(#[0-9A-F]{6})"/gi)].at(-1)![1];
    const colors = [contrastWithWhite(foreground), contrastWithWhite(background)].sort((a, b) => a - b);
    const contrast = colors[1] / colors[0];
    assert.ok(contrast >= 4.5, `${brandColor}: ${foreground} on ${background} = ${contrast.toFixed(2)}:1`);
    assert.match(link[1], /text-decoration:underline/);
  }
});

test("delivery exercises real template with memory provider and retains recipient query and batch policy", async () => {
  const ids = Array.from({ length: 55 }, (_, i) => `user-${i}`);
  people = ids.slice(0, 50).map((id) => ({ id, name: "Andrea", email: `${id}@example.test`, institution: brand }));
  const result = await notifications.deliverEmails({ institutionId: "institution", userIds: ids,
    kind: "grade", title: notice.title, body: notice.body, href: notice.href });
  assert.deepEqual(result, { sent: 50, failed: 0, skipped: 5 }); assert.equal(mail.sent.length, 50);
  assert.deepEqual((userQuery as { where: unknown }).where, { id: { in: ids.slice(0, 50) }, institutionId: "institution",
    status: "ACTIVE", OR: [{ identityId: null }, { identity: { status: "ACTIVE" } }] });
  assert.ok(mail.sent.every((email) => email.html!.includes("Tu tarea ya fue calificada")));
  assert.ok(mail.sent.every((email) => email.text.includes("Curso: Matemáticas.")));
});

test("disabled preferences and absent requests never call the provider", async () => {
  wanted = [{ userId: "user", email: false }];
  assert.deepEqual(await notifications.deliverEmails({ institutionId: "institution", userIds: ["user"],
    kind: "grade", title: notice.title, body: notice.body, href: notice.href }), { sent: 0, failed: 0, skipped: 1 });
  assert.deepEqual(await notifications.deliverEmails(null), { sent: 0, failed: 0, skipped: 0 });
  assert.equal(mail.sent.length, 0); assert.equal(userQuery, undefined);
});

test("real grade event keeps scores/feedback private and hidden grades produce no notification", async () => {
  await events.notifyGradePosted("institution", { submissionId: "submission", corrected: false });
  assert.equal(requests.length, 1);
  const input = requests[0] as Parameters<typeof notifications.notifySafely>[0];
  assert.deepEqual(input.userIds, ["student"]);
  const result = notificationEmail(brand, message, { ...notice, title: input.title, body: input.body!, href: input.href! });
  assert.doesNotMatch(JSON.stringify(input) + result.html, /97\.31|PRIVATE-FEEDBACK/);
  published = false; requests.length = 0;
  await events.notifyGradePosted("institution", { submissionId: "submission", corrected: false });
  assert.equal(requests.length, 0);
});
