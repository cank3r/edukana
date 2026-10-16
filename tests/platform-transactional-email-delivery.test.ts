import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { MemoryEmailProvider, setEmailProviderForTests } from "../src/server/integrations/email";

const { loadWithStubs } = createRequire(import.meta.url)("./helpers/load-with-stubs.cjs");
const mail = new MemoryEmailProvider();
const brand = { id: "campus", slug: "campus", name: "Instituto de Prueba", domain: "campus.example.test",
  settings: {}, platformSubscription: { plan: { features: { whiteLabel: true } } } };
const buyer = { id: "student", email: "persona@example.test", name: "Andrea", role: "STUDENT", status: "ACTIVE" };
let users: object[] = [];
let currentBuyer = { ...buyer };
let course = { id: "course", name: "Curso de Prueba", priceCents: 250000, currency: "DOP", maxStudents: null };
let enrolled = 0;
let brandingFails = false;
let brandingMissing = false;
let known = true;
let allowed = true;
const tokens: { userId: string; tokenHash: string; expiresAt: Date }[] = [];
const deletions: unknown[] = [];
const audits: unknown[] = [];
const queries: unknown[] = [];
const brandQueries: unknown[] = [];
const orders: unknown[] = [];
const failures: string[] = [];
const tx = {
  courseOrder: {
    findFirst: async () => null,
    create: async (query: unknown) => { orders.push(query); return { id: "order-12345678" }; },
  },
  auditLog: { create: async (query: unknown) => { audits.push(query); } },
};
const fakeDb = {
  ...tx,
  $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx),
  course: { findFirst: async () => course },
  enrollment: { count: async () => enrolled },
  institution: { findUnique: async (query: unknown) => {
    brandQueries.push(query);
    if (brandingFails) throw new Error("Synthetic branding failure");
    return brandingMissing ? null : brand;
  } },
  identity: { findUnique: async () => known ? { id: "identity", status: "ACTIVE" } : null },
  user: { findMany: async (query: unknown) => { queries.push(query); return users; } },
  passwordResetToken: {
    create: async ({ data }: { data: typeof tokens[number] }) => { tokens.push(data); },
    deleteMany: async (query: unknown) => { deletions.push(query); return { count: 1 }; },
  },
};
const stubs = {
  "@/lib/db": { db: fakeDb },
  "@/server/identity": { normalizeEmail: (value: string) => value.trim().toLowerCase(),
    listActiveMemberships: async () => [{ id: buyer.id, institutionId: brand.id, name: buyer.name }] },
  "@/server/security/login-throttle": { isAttemptAllowed: async () => allowed, recordAttempt: async () => {} },
  "@/server/security/password-reset-observability": { reportPasswordResetFailure: (stage: string) => { failures.push(stage); } },
  "@/server/platform/features": { lockInstitutionSettings: async () => {}, isInstitutionCatalogAvailable: async () => true },
  "./public": { findBrand: async () => brand, publicCourseWhere: () => ({ institutionId: brand.id }) },
  "./throttle": { takeCatalogAttempt: async () => true },
  "./buyer": { ensureBuyer: async () => ({ buyer: currentBuyer }), rowLocked: {} },
};
const invitations: typeof import("../src/server/people/invitations") = loadWithStubs("src/server/people/invitations.ts", stubs);
const reset: typeof import("../src/server/password-reset") = loadWithStubs("src/server/password-reset.ts", stubs);
const checkout: typeof import("../src/server/catalog/checkout") = loadWithStubs("src/server/catalog/checkout.ts", stubs);
const now = new Date("2026-10-16T12:00:00Z");
const input = { slug: brand.slug, courseId: course.id, name: buyer.name, email: buyer.email, ip: "fixture" };
beforeEach(() => {
  process.env.APP_URL = "https://platform.example.test";
  for (const key of ["AUTH_URL", "NEXTAUTH_URL", "PLATFORM_ROOT_DOMAIN", "ROOT_DOMAIN", "NEXT_PUBLIC_ROOT_DOMAIN"]) delete process.env[key];
  for (const rows of [mail.sent, tokens, deletions, audits, queries, brandQueries, orders, failures]) rows.length = 0;
  users = []; currentBuyer = { ...buyer }; course = { ...course, priceCents: 250000 };
  enrolled = 0; brandingFails = false; brandingMissing = false; known = true; allowed = true;
  setEmailProviderForTests(mail);
});
const invitedUser = (existing: boolean) => ({ ...buyer, institution: brand,
  identity: { status: "ACTIVE", passwordHash: existing ? "synthetic-hash" : null } });
function assertToken(minutes: number) {
  const href = mail.sent[0].text.match(/https:\/\/campus\.example\.test\/restablecer\/([\w-]+)/);
  assert.ok(href); assert.equal(tokens.length, 1); assert.equal(tokens[0].userId, buyer.id);
  assert.equal(tokens[0].tokenHash, createHash("sha256").update(href[1]).digest("hex"));
  assert.equal(tokens[0].expiresAt.getTime(), now.getTime() + minutes * 60000);
  assert.ok(mail.sent[0].html!.includes(`href="${href[0]}"`));
  assert.equal(mail.sent[0].to, buyer.email);
}

test("real invitation emitter retains token hash, seven-day expiry, recipient scope and audit", async () => {
  users = [invitedUser(false)];
  assert.deepEqual(await invitations.sendInvitations({ id: "admin", institutionId: brand.id }, [buyer.id], now),
    { sent: 1, failed: 0, skipped: 0, remaining: 0 });
  assertToken(7 * 24 * 60);
  assert.match(mail.sent[0].html!, /Crear mi contraseña/);
  assert.doesNotMatch(mail.sent[0].text + mail.sent[0].html + mail.sent[0].fromName, /Edukana/);
  assert.match(JSON.stringify(queries), /"institutionId":"campus"/);
  assert.match(JSON.stringify(audits), /PEOPLE_INVITED/);
});

test("existing identity receives login only; suspended identity receives nothing", async () => {
  users = [invitedUser(true), { ...invitedUser(false), id: "blocked", identity: { status: "SUSPENDED", passwordHash: null } }];
  const result = await invitations.sendInvitations({ id: "admin", institutionId: brand.id }, [buyer.id, "blocked"], now);
  assert.equal(result.sent, 1); assert.equal(result.skipped, 1); assert.equal(tokens.length, 0);
  assert.match(mail.sent[0].html!, /href="https:\/\/campus.example.test\/login"/);
  assert.doesNotMatch(mail.sent[0].html!, /restablecer|recuperar/);
});

test("failed invitation still removes only its newly issued token and records no success audit", async () => {
  users = [invitedUser(false)];
  setEmailProviderForTests({ send: async () => { throw new Error("Synthetic delivery failure"); } });
  const log = console.error; console.error = () => {};
  try {
    const result = await invitations.sendInvitations({ id: "admin", institutionId: brand.id }, [buyer.id], now);
    assert.equal(result.failed, 1); assert.equal(result.sent, 0);
    assert.deepEqual(deletions, [{ where: { tokenHash: tokens[0].tokenHash } }]); assert.equal(audits.length, 0);
  } finally { console.error = log; }
});

test("real reset emitter preserves exact token/60-minute expiry and silent eligibility response", async () => {
  assert.equal(await reset.requestPasswordReset({ email: buyer.email, ip: "fixture", institutionId: brand.id }, now), undefined);
  assertToken(60); assert.match(mail.sent[0].html!, /60 minutos/);
  assert.match(mail.sent[0].html!, /Si no lo pediste/);
  known = false; await reset.requestPasswordReset({ email: "unknown@example.test", ip: "fixture" }, now);
  known = true; allowed = false; await reset.requestPasswordReset({ email: buyer.email, ip: "fixture" }, now);
  assert.equal(mail.sent.length, 1); assert.equal(tokens.length, 1);
});

test("reset delivery failures preserve observability stage and void contract", async () => {
  setEmailProviderForTests({ send: async () => { throw new Error("Synthetic delivery failure"); } });
  assert.equal(await reset.requestPasswordReset({ email: buyer.email, ip: "fixture" }, now), undefined);
  assert.deepEqual(failures, ["provider_send"]);
});

test("paid checkout emits complete branded order summary without changing order data or adding payment links", async () => {
  const result = await checkout.requestCourse(input, now);
  assert.equal(result.ok, true); assert.equal(mail.sent.length, 1); assert.equal(mail.sent[0].to, buyer.email);
  assert.equal(mail.sent[0].subject, "Pedido 12345678: Curso de Prueba");
  assert.match(mail.sent[0].html!, /Recibimos tu pedido/); assert.match(mail.sent[0].html!, /12345678/);
  assert.match(mail.sent[0].html!, /Total a pagar/); assert.doesNotMatch(mail.sent[0].html!, /href=|Edukana/);
  assert.equal(mail.sent[0].fromName, brand.name);
  assert.match(JSON.stringify(brandQueries), /platformSubscription/); assert.match(JSON.stringify(brandQueries), /"id":"campus"/);
  assert.match(JSON.stringify(orders), /"amountCents":250000/); assert.match(JSON.stringify(orders), /"status":"PENDING"/);
});

test("already enrolled checkout retains the platform login and does not ask to pay", async () => {
  enrolled = 1; await checkout.requestCourse(input, now);
  assert.match(mail.sent[0].text, /no necesitas pagar/); assert.match(mail.sent[0].html!, /no necesitas pagar/);
  assert.match(mail.sent[0].html!, /href="https:\/\/platform.example.test\/login"/);
  assert.doesNotMatch(mail.sent[0].html!, /href="https:\/\/campus.example.test\/login"/);
});

test("role mismatch uses the existing recipient and generic response without enrolling or offering a link", async () => {
  currentBuyer.role = "TEACHER"; course.priceCents = 0;
  const result = await checkout.requestCourse(input, now);
  assert.deepEqual(result, { ok: true, kind: "enrolled", message: checkout.ENROLLED_MESSAGE });
  assert.equal(mail.sent[0].to, buyer.email); assert.match(mail.sent[0].html!, /no es de estudiante/);
  assert.doesNotMatch(mail.sent[0].html!, /href=/); assert.equal(orders.length, 0); assert.equal(tokens.length, 0);
});

test("suspended buyer produces no message or branding lookup", async () => {
  currentBuyer.status = "SUSPENDED"; await checkout.requestCourse(input, now);
  assert.equal(mail.sent.length, 0); assert.equal(brandQueries.length, 0);
});

test("catalog branding failure or absence retains one original text delivery", async () => {
  brandingFails = true; await checkout.requestCourse(input, now);
  brandingFails = false; brandingMissing = true; await checkout.requestCourse(input, now);
  assert.equal(mail.sent.length, 2);
  for (const message of mail.sent) {
    assert.equal(message.html, undefined); assert.equal(message.to, buyer.email);
    assert.match(message.text, /Recibimos tu pedido/); assert.match(message.text, /Número de pedido: 12345678/);
    assert.doesNotMatch(message.text, /Hecho con Edukana/);
  }
});
