import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createRequire } from "node:module";
import { Prisma } from "@prisma/client";
import { contrastWithWhite } from "../src/server/platform/brand-color";
const require = createRequire(import.meta.url);
const { loadWithStubs } = require("./helpers/load-with-stubs.cjs");
const OPERATOR = "operator@example.test";
let calls = 0; let invalidations = 0; let foreignAsset = false; let duplicate = false;
let update: Record<string, unknown> | null = null;
let audit: Record<string, unknown> | null = null;
const existing = { name: "Institución A", slug: "alpha", logoUrl: "/api/public-images/old", domain: null, brandColor: "#2457F5",
  settings: { unchanged: true, platform: { aiLocked: true, hideEdukanaBrand: false } } };
const tx = {
  $queryRaw: async () => { calls++; },
  institution: { findUnique: async () => { calls++; return existing; }, update: async ({ data }: { data: Record<string, unknown> }) => {
    if (duplicate) throw new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "5" });
    update = data;
  } },
  storageAsset: { findFirst: async ({ where }: { where: Record<string, unknown> }) => {
    assert.equal(where.institutionId, "a"); assert.equal(where.uploaderId, "operator-user");
    assert.deepEqual(where.objectPath, { startsWith: "a/public/logo/a/" });
    assert.deepEqual(where.confirmedAt, { not: null }); return foreignAsset ? null : { id: "logo" };
  } },
  auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => { audit = data; } },
};
const service: typeof import("../src/server/platform/operator-branding") = loadWithStubs("src/server/platform/operator-branding.ts", {
  "@/lib/db": { db: { $transaction: async (fn: (value: typeof tx) => unknown) => fn(tx) } },
  "./institutions": { isPlatformOperator: (email: string) => email === OPERATOR },
  "@/server/identity": { normalizeEmail: (email: string) => email.toLowerCase() },
  "./features": { lockInstitutionSettings: async () => { calls++; } },
  "./domains": {
    normalizeInstitutionDomain: (value: unknown) => {
      if (!value) return null;
      if (typeof value !== "string" || !/^[a-z0-9.-]+$/i.test(value)) throw new Error("Dominio inválido");
      return value.toLowerCase();
    },
    validateInstitutionDomain: (value: unknown) => { if (value === "edukana.test") throw new Error("Dominio reservado"); return value; },
    invalidateInstitutionHostCache: () => { invalidations++; },
  },
});
const policy: typeof import("../src/server/platform/white-label") = loadWithStubs("src/server/platform/white-label.ts", {
  "@/lib/db": { db: {} },
});
let resolvedHost: { id: string; slug: string; name: string } | null = { id: "a", slug: "alpha", name: "A" };
let loginReads = 0;
const login: typeof import("../src/server/platform/login-branding") = loadWithStubs("src/server/platform/login-branding.ts", {
  "@/lib/db": { db: { institution: { findUnique: async () => { loginReads++; return { id: "b", slug: "beta", name: "B" }; } } } },
  "./domains": { getRequestInstitution: async () => resolvedHost },
});
beforeEach(() => { calls = 0; invalidations = 0; update = null; audit = null; foreignAsset = false; duplicate = false; });
const input = { confirmation: "Institución A", brandColor: "#fff", domain: "AULA.EXAMPLE.TEST", hideEdukanaBrand: true, assetId: "logo" };
test("white-label plan boolean takes precedence; malformed/missing features fall back safely", () => {
  assert.equal(policy.resolveWhiteLabel({ platform: { hideEdukanaBrand: true } }, { whiteLabel: false }), false);
  assert.equal(policy.resolveWhiteLabel({}, { whiteLabel: true }), true);
  assert.equal(policy.resolveWhiteLabel({ platform: { hideEdukanaBrand: true } }), true);
  for (const value of [undefined, null, [], "bad", { whiteLabel: "true" }]) assert.equal(policy.resolveWhiteLabel({}, value), false);
});
test("white-label logos reject scripts, protocol-relative, credentials and private asset URLs", () => {
  for (const value of ["javascript:alert(1)", "//evil.test/a", "http://evil.test/a", "/api/assets/private", "https://u:p@evil.test/a"]) {
    assert.equal(policy.safeBrandLogoUrl(value), null);
  }
  assert.equal(policy.safeBrandLogoUrl("/api/public-images/logo"), "/api/public-images/logo");
});
test("host institution wins over a query institution without querying the other tenant", async () => {
  assert.equal((await login.getLoginInstitution("beta"))?.id, "a");
  assert.equal(loginReads, 0);
  resolvedHost = null;
  assert.equal(await login.getLoginInstitution(), null);
  assert.equal(await login.getLoginInstitution("https://bad.test"), null);
  assert.equal(loginReads, 0);
  assert.equal((await login.getLoginInstitution("beta"))?.id, "b");
  assert.equal(loginReads, 1);
});
test("ordinary admin cannot change domain or any operator branding and causes no database work", async () => {
  assert.equal((await service.updateOperatorBrand("admin@example.test", "operator-user", "a", input)).ok, false);
  assert.equal(calls, 0); assert.equal(audit, null); assert.equal(update, null);
});
test("operator brand adjusts readability, preserves other settings, audits before/after and invalidates hosts", async () => {
  assert.equal((await service.updateOperatorBrand(OPERATOR, "operator-user", "a", input)).ok, true);
  const saved = update as unknown as { brandColor: string; domain: string; logoUrl: string; settings: typeof existing.settings };
  assert.ok(contrastWithWhite(saved.brandColor) >= 4.5); assert.equal(saved.domain, "aula.example.test");
  assert.equal(saved.logoUrl, "/api/public-images/logo"); assert.equal(saved.settings.platform.aiLocked, true);
  assert.equal(saved.settings.unchanged, true); assert.equal(saved.settings.platform.hideEdukanaBrand, true);
  const event = audit as unknown as { action: string; changes: { operator: string; before: object; after: object } };
  assert.equal(event.action, "PLATFORM_BRANDING_UPDATED"); assert.equal(event.changes.operator, OPERATOR);
  assert.ok(event.changes.before); assert.ok(event.changes.after); assert.equal(invalidations, 1);
});
test("logo from another uploader or institution is rejected before writes", async () => {
  foreignAsset = true;
  assert.equal((await service.updateOperatorBrand(OPERATOR, "operator-user", "a", input)).ok, false);
  assert.equal(update, null); assert.equal(audit, null); assert.equal(invalidations, 0);
});
test("duplicate and reserved domains produce friendly errors without cache invalidation", async () => {
  duplicate = true;
  const result = await service.updateOperatorBrand(OPERATOR, "operator-user", "a", input);
  assert.equal(result.ok, false); assert.match(result.message, /otra institución/); assert.equal(invalidations, 0);
  duplicate = false;
  assert.equal((await service.updateOperatorBrand(OPERATOR, "operator-user", "a", { ...input, domain: "edukana.test" })).ok, false);
  assert.equal(update, null);
});
test("malformed color and domain fail before transaction; empty clears optional branding", async () => {
  assert.equal((await service.updateOperatorBrand(OPERATOR, "operator-user", "a", { ...input, brandColor: "red" })).ok, false);
  assert.equal((await service.updateOperatorBrand(OPERATOR, "operator-user", "a", { ...input, domain: "https://bad.test" })).ok, false);
  assert.equal(calls, 0);
  assert.equal((await service.updateOperatorBrand(OPERATOR, "operator-user", "a", {
    brandColor: "", domain: "", hideEdukanaBrand: false, removeLogo: true,
  })).ok, true);
  assert.deepEqual(Object.assign({}, update, { settings: undefined }), { brandColor: null, domain: null, logoUrl: null, settings: undefined });
});

test("operator logo action ignores extra runtime purpose and course fields", async () => {
  let actual: unknown;
  let allowed = true;
  const actions: typeof import("../src/server/actions/platform-branding") = loadWithStubs("src/server/actions/platform-branding.ts", {
    "next/cache": { revalidatePath: () => undefined },
    "@/lib/auth": { auth: async () => ({ user: { id: "operator-user", role: "ADMIN" } }) },
    "@/lib/db": { db: { institution: { findUnique: async () => ({ id: "a" }) } } },
    "@/server/platform/operator-session": { getOperatorEmail: async () => allowed ? OPERATOR : null },
    "@/server/platform/operator-branding": { updateOperatorBrand: async () => ({ ok: true }) },
    "@/server/courses/uploads": { prepareUpload: async (_actor: unknown, data: unknown) => {
      actual = data; return { ok: true, assetId: "logo", uploadUrl: "https://storage.example.test" };
    }, confirmUpload: async () => ({ ok: true }) },
  });
  await actions.prepareOperatorLogoAction("a", {
    name: "logo.png", type: "image/png", size: 16, purpose: "avatar", courseId: "b-course",
  } as { name: string; type: string; size: number });
  assert.deepEqual(actual, { purpose: "logo", name: "logo.png", type: "image/png", size: 16 });
  allowed = false; actual = null;
  assert.equal((await actions.prepareOperatorLogoAction("b", { name: "x.png", type: "image/png", size: 16 })).ok, false);
  assert.equal((await actions.confirmOperatorLogoAction("b", "foreign")).ok, false);
  assert.equal(actual, null);
});


test("changing a domain requires written institution-name confirmation before mutation", async () => {
  assert.equal((await service.updateOperatorBrand(OPERATOR, "operator-user", "a", { ...input, confirmation: "wrong" })).ok, false);
  assert.equal(update, null); assert.equal(audit, null); assert.equal(invalidations, 0);
});
