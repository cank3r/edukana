import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, test } from "node:test";
import { NextRequest } from "next/server";
import { encode } from "next-auth/jwt";
const require = createRequire(import.meta.url);
const { loadWithStubs } = require("./helpers/load-with-stubs.cjs");
// Synthetic signing key scoped to this test process; never a deployment credential.
const secret = "host-isolation-test-key-not-a-deployment-secret";
const savedAuthEnv = { AUTH_SECRET: process.env.AUTH_SECRET, AUTH_URL: process.env.AUTH_URL, NEXTAUTH_URL: process.env.NEXTAUTH_URL };
process.env.AUTH_SECRET = secret;
// CI runs its app over HTTP. This fixture intentionally signs HTTPS secure
// cookies, so do not let an inherited URL silently change the cookie policy.
delete process.env.AUTH_URL;
delete process.env.NEXTAUTH_URL;
after(() => {
  for (const [key, value] of Object.entries(savedAuthEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
let host = "a.test";
const { handlers }: typeof import("@/lib/auth") = loadWithStubs("src/lib/auth.ts", {
  "next/headers": { headers: async () => new Headers({ host }) },
  "@/server/platform/domains": {
    getRequestInstitution: async () => host === "a.test" ? { id: "a", slug: "alpha", domain: "a.test" } : null,
    resolveInstitutionHost: async () => null,
  },
  "@/server/identity": { findOwnMembership: async () => null },
  "@/server/login": { authenticateCredentialsWithStatus: async () => ({ user: null }), rejectCredentials: () => null },
  "@/server/session": { resolveLiveIdentity: async () => null },
});
async function sessionResponse(institutionId: string) {
  const cookieName = "__Secure-authjs.session-token";
  const token = await encode({ secret, salt: cookieName, token: {
    sub: `user-${institutionId}`, name: `Person ${institutionId}`, email: `${institutionId}@example.test`,
    institutionId, institutionSlug: institutionId, role: "ADMIN", sv: 1, idn: "identity", institutionCount: 2,
  } });
  return handlers.GET(new NextRequest(`https://${host}/api/auth/session`, {
    headers: { host, cookie: `${cookieName}=${token}`, "x-forwarded-host": "b.test" },
  }));
}

test("host HTTP: actual Auth.js encrypted B cookie returns null JSON on A, never B identity fields", async () => {
  const response = await sessionResponse("b");
  assert.equal(response.status, 200);
  assert.equal(await response.json(), null);
});

test("host HTTP: same-institution encrypted cookie and central host retain session behavior", async () => {
  const own = await sessionResponse("a");
  assert.equal((await own.json()).user.institutionId, "a");
  host = "central.test";
  const central = await sessionResponse("b");
  assert.equal((await central.json()).user.institutionId, "b");
});
