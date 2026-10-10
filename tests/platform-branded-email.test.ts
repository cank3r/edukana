import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createRequire } from "node:module";
import { MemoryEmailProvider, ResendEmailProvider, emailSender, setEmailProviderForTests } from "../src/server/integrations/email";
const require = createRequire(import.meta.url);
const { loadWithStubs } = require("./helpers/load-with-stubs.cjs");
const brandA = {
  name: "Colegio A", domain: "a.colegio.test", slug: "a", logoUrl: "/api/public-images/logo_a", brandColor: "#0F766E",
  settings: {}, platformSubscription: { plan: { features: { whiteLabel: false } } },
};
const brandB = { ...brandA, name: "Colegio B", domain: "b.colegio.test", slug: "b" };
const brands = { a: brandA, b: brandB };
const member = (id: "a" | "b") => ({ id: `user-${id}`, institutionId: id, name: "Persona", institution: brands[id] });
let memberships = [member("a"), member("b")];
let known = true;
let userRows: object[] = [];
let userQuery: unknown;
const tokens: { userId: string }[] = [];
const mail = new MemoryEmailProvider();
const fakeDb = {
  institution: { findUnique: async ({ where }: { where: { id: "a" | "b" } }) => brands[where.id] ?? null },
  identity: { findUnique: async () => known ? { id: "identity", status: "ACTIVE" } : null },
  user: { findMany: async (query: unknown) => { userQuery = query; return userRows; } },
  passwordResetToken: { create: async ({ data }: { data: { userId: string } }) => tokens.push(data), deleteMany: async () => ({ count: 1 }) },
  auditLog: { create: async () => ({}) },
  notificationPreference: { findMany: async () => [] },
};
const stubs = {
  "@/lib/db": { db: fakeDb },
  "@/server/identity": { normalizeEmail: (value: string) => value.trim().toLowerCase(), listActiveMemberships: async () => memberships },
  "@/server/security/login-throttle": { isAttemptAllowed: async () => true, recordAttempt: async () => {} },
};
const branding: typeof import("../src/server/platform/branded-email") = loadWithStubs("src/server/platform/branded-email.ts", stubs);
const reset: typeof import("../src/server/password-reset") = loadWithStubs("src/server/password-reset.ts", stubs);
const invitations: typeof import("../src/server/people/invitations") = loadWithStubs("src/server/people/invitations.ts", stubs);
const notifications: typeof import("../src/server/notifications") = loadWithStubs("src/server/notifications/index.ts", stubs);
beforeEach(() => {
  process.env.APP_URL = "https://platform.test";
  delete process.env.PLATFORM_ROOT_DOMAIN; delete process.env.ROOT_DOMAIN; delete process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  mail.sent.length = 0; tokens.length = 0; memberships = [member("a"), member("b")]; known = true; userRows = [];
  setEmailProviderForTests(mail);
});
const message = { to: "person@example.test", subject: "Aviso", text: "Hola\nhttps://a.colegio.test/dashboard" };

test("branded message includes canonical logo, color, name, sender and footer", () => {
  const result = branding.brandedEmail(brandA, message);
  assert.equal(result.fromName, "Colegio A vía Edukana");
  assert.match(result.html!, /https:\/\/a.colegio.test\/api\/public-images\/logo_a/);
  assert.match(result.html!, /#0F766E/); assert.match(result.html!, /Colegio A/);
  assert.match(result.html!, /href="https:\/\/a.colegio.test\/dashboard"/);
  assert.match(result.text, /Hecho con Edukana/);
});
test("plan controls footer before legacy setting, including explicit false", () => {
  const legacy = { ...brandA, settings: { platform: { hideEdukanaBrand: true } } };
  assert.match(branding.brandedEmail(legacy, message).text, /Hecho con Edukana/);
  const hidden = branding.brandedEmail({ ...legacy, platformSubscription: null }, message);
  assert.doesNotMatch(hidden.text, /Hecho con Edukana/); assert.doesNotMatch(hidden.html!, /Hecho con Edukana/);
  assert.doesNotMatch(branding.brandedEmail({ ...brandA, platformSubscription: { plan: { features: { whiteLabel: true } } } }, message).text, /Hecho con Edukana/);
});
test("HTML and headers escape hostile names, bodies, logos and style values", () => {
  const result = branding.brandedEmail({ ...brandA, name: '<script>"A"</script>\r\nBcc: victim@test',
    logoUrl: "javascript:alert(1)", brandColor: 'red; background:url("evil")' },
  { ...message, subject: "Hello\r\nBcc: victim@test", text: '<img src=x onerror="alert(1)">' });
  assert.doesNotMatch(result.html!, /<script>|<img|javascript:|background:url/);
  assert.match(result.html!, /&lt;img/); assert.doesNotMatch(result.subject, /[\r\n]/);
  assert.doesNotMatch(result.fromName!, /[\r\n]/);
});
test("sender changes only display name and rejects configured header injection", () => {
  assert.equal(emailSender("Edukana <verified@platform.test>", 'A "B"\r\n<evil@test> vía Edukana'),
    '"A B  <evil@test> vía Edukana" <verified@platform.test>');
  assert.equal(emailSender("verified@platform.test", "Colegio A vía Edukana"), '"Colegio A vía Edukana" <verified@platform.test>');
  assert.throws(() => emailSender("bad\r\nBcc: victim@test", "A"));
});
test("Resend payload keeps verified address and adds HTML without a network call", async () => {
  const original = globalThis.fetch;
  let payload: Record<string, unknown> = {};
  globalThis.fetch = async (_input, init) => { payload = JSON.parse(String(init?.body)); return new Response("{}", { status: 200 }); };
  try {
    await new ResendEmailProvider("fake-test-key", "Edukana <verified@platform.test>").send(branding.brandedEmail(brandA, message));
    assert.equal(payload.from, '"Colegio A vía Edukana" <verified@platform.test>');
    assert.match(String(payload.html), /Colegio A/); assert.deepEqual(payload.to, [message.to]);
  } finally { globalThis.fetch = original; }
});
test("reset selects requested active own membership and never leaks other institutions", async () => {
  await reset.requestPasswordReset({ email: "person@example.test", ip: "test", institutionId: "b" });
  assert.equal(tokens[0].userId, "user-b"); assert.equal(mail.sent.length, 1);
  assert.equal(mail.sent[0].fromName, "Colegio B vía Edukana");
  assert.match(mail.sent[0].text, /https:\/\/b.colegio.test\/restablecer\//);
  assert.doesNotMatch(mail.sent[0].text, /Colegio A|a.colegio.test/);
});
test("foreign tenant reset uses only generic configured origin and branding", async () => {
  await reset.requestPasswordReset({ email: "person@example.test", ip: "test", institutionId: "foreign" });
  assert.equal(mail.sent[0].fromName, "Edukana");
  assert.match(mail.sent[0].text, /https:\/\/platform.test\/restablecer\//);
  assert.doesNotMatch(mail.sent[0].text, /Colegio A|Colegio B|foreign/);
});
test("generic reset retains first membership behavior; missing accounts/memberships remain silent", async () => {
  await reset.requestPasswordReset({ email: "person@example.test", ip: "test" });
  assert.equal(mail.sent[0].fromName, "Colegio A vía Edukana");
  mail.sent.length = 0; tokens.length = 0; known = false;
  assert.equal(await reset.requestPasswordReset({ email: "missing@example.test", ip: "test" }), undefined);
  known = true; memberships = [];
  assert.equal(await reset.requestPasswordReset({ email: "person@example.test", ip: "test" }), undefined);
  assert.equal(mail.sent.length, 0); assert.equal(tokens.length, 0);
});
test("invitations brand both existing-account and password setup links", async () => {
  userRows = [true, false].map((existing, i) => ({ ...member("b"), id: `user-${i}`, email: message.to,
    institution: brandB, identity: { status: "ACTIVE", passwordHash: existing ? "hash" : null } }));
  const result = await invitations.sendInvitations({ id: "admin-b", institutionId: "b" }, ["user-0", "user-1"]);
  assert.equal(result.sent, 2);
  assert.match(mail.sent[0].text, /https:\/\/b.colegio.test\/login/);
  assert.match(mail.sent[1].text, /https:\/\/b.colegio.test\/restablecer\//);
  assert.ok(mail.sent.every((item) => item.fromName === "Colegio B vía Edukana"));
  assert.match(JSON.stringify(userQuery), /"institutionId":"b"/);
});
test("notifications use tenant links/preferences, filter membership and escape content", async () => {
  userRows = [{ ...member("a"), email: message.to, institution: brandA }];
  const result = await notifications.deliverEmails({ institutionId: "a", userIds: ["user-a"], kind: "announcement",
    title: '<img onerror="bad">', body: "Body & detail", href: "/dashboard/notificaciones" });
  assert.equal(result.sent, 1); assert.equal(mail.sent[0].fromName, "Colegio A vía Edukana");
  assert.match(mail.sent[0].text, /https:\/\/a.colegio.test\/dashboard\/notificaciones\/preferencias/);
  assert.match(mail.sent[0].html!, /&lt;img/); assert.doesNotMatch(mail.sent[0].html!, /<img onerror/);
  assert.match(JSON.stringify(userQuery), /"institutionId":"a"/);
});
test("notification href rejects cross-origin and control-character paths", () => {
  for (const href of ["//evil.test", "/\\evil", "/\nevil", "https://evil.test"]) assert.equal(notifications.safeHref(href), null);
  assert.equal(notifications.safeHref("/dashboard?x=1"), "/dashboard?x=1");
});
test("legacy notifications without application URL retain text delivery", async () => {
  delete process.env.APP_URL; delete process.env.AUTH_URL; delete process.env.NEXTAUTH_URL;
  userRows = [{ ...member("a"), email: message.to, institution: { ...brandA, domain: null } }];
  const result = await notifications.deliverEmails({ institutionId: "a", userIds: ["user-a"], kind: "announcement",
    title: "Aviso", body: null, href: "/dashboard" });
  assert.equal(result.sent, 1);
  assert.doesNotMatch(mail.sent[0].text, /null\/dashboard/);
  assert.match(mail.sent[0].text, /Puedes elegir qué correos recibes/);
});
