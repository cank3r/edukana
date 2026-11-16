import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { loadWithStubs } = require("./helpers/load-with-stubs.cjs");
let email: string | null = null;
let authCalls = 0;
let serviceCalls = 0;
const cookiesSet: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
const boundary = {
  "@/server/platform/operator-session": { getOperatorEmail: async () => { authCalls++; return email; } },
  "next/navigation": {
    notFound: () => { throw new Error("NOT_FOUND"); }, redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); },
  },
  "next/headers": { cookies: async () => ({ get: () => undefined,
    set: (name: string, value: string, options: Record<string, unknown>) => cookiesSet.push({ name, value, options }),
  }) },
  "@/server/platform/support": {
    SUPPORT_COOKIE: "edukana-support-view",
    startSupportView: async () => { serviceCalls++; return { ok: true, ticket: "ticket", expiresAt: new Date() }; },
    stopSupportView: async () => { serviceCalls++; return "a"; },
    readSupportView: async () => { serviceCalls++; return null; },
  },
  "@/lib/db": { db: { institution: { findUnique: async () => { serviceCalls++; return null; } } } },
  "@/server/platform/audit-log": { listAuditLog: async () => { serviceCalls++; return null; } },
};
const actions: typeof import("@/app/operador/[institutionId]/vista/actions") = loadWithStubs("src/app/operador/[institutionId]/vista/actions.ts", boundary);
const supportPage = loadWithStubs("src/app/operador/[institutionId]/vista/page.tsx", boundary).default;
const auditPage = loadWithStubs("src/app/operador/bitacora/page.tsx", boundary).default;
const { SupportSection } = loadWithStubs("src/app/operador/[institutionId]/SupportSection.tsx", boundary);
beforeEach(() => { email = null; authCalls = 0; serviceCalls = 0; cookiesSet.length = 0; });

test("both support pages and audit page deny non-operators before reading data", async () => {
  await assert.rejects(() => supportPage({ params: Promise.resolve({ institutionId: "a" }) }), /NOT_FOUND/);
  await assert.rejects(() => auditPage({ searchParams: Promise.resolve({}) }), /NOT_FOUND/);
  await assert.rejects(() => SupportSection({ institutionId: "a" }), /NOT_FOUND/);
  assert.equal(authCalls, 3);
  assert.equal(serviceCalls, 0);
});
test("direct forged support action requests recheck the operator independently of the page", async () => {
  const data = new FormData();
  data.set("institutionId", "a"); data.set("confirmation", "A"); data.set("operatorEmail", "operator@test.com");
  const result = await actions.enterSupportAction({ message: "" }, data);
  assert.match(result.message, /permiso/);
  await assert.rejects(() => actions.exitSupportAction(), /permiso/);
  assert.equal(authCalls, 2);
  assert.equal(serviceCalls, 0);
  assert.equal(cookiesSet.length, 0);
});
test("support action issues only a scoped HttpOnly cookie after authenticated entry", async () => {
  email = "operator@test.com";
  const data = new FormData(); data.set("institutionId", "a"); data.set("confirmation", "A");
  await assert.rejects(() => actions.enterSupportAction({ message: "" }, data), /REDIRECT:\/operador\/a\/vista/);
  assert.equal(authCalls, 1);
  assert.equal(serviceCalls, 2);
  assert.equal(cookiesSet[0].options.httpOnly, true);
  assert.equal(cookiesSet[0].options.path, "/operador");
  assert.equal(cookiesSet[0].options.sameSite, "strict");
});
