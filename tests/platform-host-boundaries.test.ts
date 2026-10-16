import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { NextRequest, type NextFetchEvent } from "next/server";
const require = createRequire(import.meta.url);
const { loadWithStubs } = require("./helpers/load-with-stubs.cjs");
let hostInstitution: { id: string; slug: string } | null = { id: "a", slug: "alpha" };
const domains = { getRequestInstitution: async () => hostInstitution, resolveInstitutionHost: async () => hostInstitution };
let tokenInstitution = "b";
const { default: proxy }: typeof import("@/proxy") = loadWithStubs("src/proxy.ts", {
  "@/server/platform/domains": domains,
  "@/lib/auth": { authFromToken: (callback: (request: NextRequest, event: NextFetchEvent) => unknown) =>
    (request: NextRequest, event: NextFetchEvent) => {
      // Reproduce Auth.js reqWithEnvURL rewriting the nextUrl to a central AUTH_URL.
      const rewritten = new NextRequest(`https://central.test${request.nextUrl.pathname}${request.nextUrl.search}`, request);
      Object.assign(rewritten, { auth: { user: { institutionId: tokenInstitution } } });
      return callback(rewritten, event);
    } },
});

test("host proxy: AUTH_URL and mismatched URL cannot send tenant navigation to central/attacker", async () => {
  const response = await proxy(new NextRequest("https://evil.test/dashboard?a=1", { headers: {
    host: "alpha.test", "x-forwarded-host": "evil.test", "x-institution-id": "b",
  } }), {} as NextFetchEvent);
  assert.equal(response?.headers.get("location"), "https://alpha.test/login?callbackUrl=%2Fdashboard%3Fa%3D1");
  tokenInstitution = "a";
  const own = await proxy(new NextRequest("https://alpha.test/dashboard", { headers: { host: "alpha.test" } }), {} as NextFetchEvent);
  assert.equal(own?.headers.get("location"), null);
});

test("host proxy: API gets sanitized request headers with no login redirect; malformed authority fails closed", async () => {
  const response = await proxy(new NextRequest("https://alpha.test/api/auth/session", { headers: {
    host: "alpha.test", "x-forwarded-host": "evil.test", "x-tenant-id": "b",
  } }), {} as NextFetchEvent);
  assert.equal(response?.headers.get("x-middleware-request-x-forwarded-host"), "alpha.test");
  assert.equal(response?.headers.get("x-middleware-request-x-tenant-id"), null);
  assert.equal(response?.headers.get("location"), null);
  const invalid = await proxy(new NextRequest("https://alpha.test/", { headers: { host: "alpha.test,evil.test" } }), {} as NextFetchEvent);
  assert.equal(invalid?.status, 400);
});

let updates = 0;
const members = [{ id: "user-a", institutionId: "a", institution: { name: "A" }, role: "ADMIN" },
  { id: "user-b", institutionId: "b", institution: { name: "B" }, role: "ADMIN" }];
const actions: typeof import("@/server/actions/institutions") = loadWithStubs("src/server/actions/institutions.ts", {
  "@/server/platform/domains": domains,
  "@/lib/auth": { auth: async () => ({ user: { id: "user-a", identityId: "identity" } }), updateSession: async () => { updates++; } },
  "@/server/identity": { listActiveMemberships: async () => members,
    findOwnMembership: async (_identity: string, id: string) => members.find((member) => member.id === id) },
  "next/navigation": { redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } },
});

test("host actions: membership picker and switching cannot leave bound institution", async () => {
  assert.deepEqual((await actions.listMyInstitutions()).map((item) => item.userId), ["user-a"]);
  const form = new FormData(); form.set("userId", "user-b");
  await assert.rejects(actions.switchInstitutionAction(form), /REDIRECT/);
  assert.equal(updates, 0);
  hostInstitution = null;
  await assert.rejects(actions.switchInstitutionAction(form), /REDIRECT/);
  assert.equal(updates, 1);
  hostInstitution = { id: "a", slug: "alpha" };
});

let certificateQuery: { where: { institutionId?: string } };
const certificateApi: typeof import("@/app/api/certificados/[code]/route") = loadWithStubs("src/app/api/certificados/[code]/route.ts", {
  "@/server/platform/domains": domains,
  "@/lib/db": { db: { certificate: { findUnique: async (query: typeof certificateQuery) => { certificateQuery = query; return null; } } } },
});

test("host certificates: public API scopes certificate query to host before disclosing identity", async () => {
  const response = await certificateApi.GET(new Request("https://alpha.test/api/certificados/B"), { params: Promise.resolve({ code: "B" }) });
  assert.equal(certificateQuery.where.institutionId, "a");
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { valid: false, reason: "not_found" });
});

const catalog: typeof import("@/server/catalog/public") = loadWithStubs("src/server/catalog/public.ts", {
  "@/server/platform/domains": domains,
  "@/server/platform/features": { isInstitutionCatalogAvailable: async () => true },
  "@/lib/db": { db: { institution: { findUnique: async () => ({ id: "b", slug: "beta", logoUrl: null, brandColor: null }) } } },
});

test("host catalog: shared DAL rejects B brand under A before page or metadata can expose it", async () => {
  assert.equal(await catalog.findBrand("beta"), null);
  hostInstitution = null;
  assert.equal((await catalog.findBrand("beta"))?.id, "b");
});

let imageScope: string | undefined;
let byteReads = 0;
const images: typeof import("@/app/api/public-images/[assetId]/route") = loadWithStubs("src/app/api/public-images/[assetId]/route.ts", {
  "@/server/platform/domains": domains,
  "@/server/courses/uploads": { publicImageAsset: async (_id: string, institutionId?: string) => {
    imageScope = institutionId; return null;
  } },
  "@/lib/storage": { readPrivateAsset: async () => { byteReads++; return new Uint8Array(); } },
});
test("host public images: request passes only server-resolved institution and rejects before bytes", async () => {
  hostInstitution = { id: "a", slug: "alpha" };
  const response = await images.GET(new Request("https://alpha.test/api/public-images/other"), {
    params: Promise.resolve({ assetId: "other" }),
  });
  assert.equal(imageScope, "a");
  assert.equal(response.status, 404);
  assert.equal(byteReads, 0);
});

let operatorIdentityReads = 0;
const operator: typeof import("@/server/platform/operator-session") = loadWithStubs("src/server/platform/operator-session.ts", {
  "./domains": domains,
  "@/lib/auth": { auth: async () => ({ user: { identityId: "operator" } }) },
  "@/lib/db": { db: { identity: { findUnique: async () => { operatorIdentityReads++; return { email: "operator@example.test" }; } } } },
  "./institutions": { isPlatformOperator: () => true },
});
test("host operator: branded host cannot expose global operator even to an otherwise allowed account", async () => {
  assert.equal(await operator.getOperatorEmail(), null);
  assert.equal(operatorIdentityReads, 0);
  hostInstitution = null;
  assert.equal(await operator.getOperatorEmail(), "operator@example.test");
});
