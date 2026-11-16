import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, test } from "node:test";
import { NextRequest } from "next/server";
import { encode } from "next-auth/jwt";
import { SUSPENDED_CREDENTIAL_CODE, suspendedCredentialMessage } from "@/server/platform/suspension-policy";
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
let suspendedName: string | undefined;
let credentialChecks = 0;
const { handlers }: typeof import("@/lib/auth") = loadWithStubs("src/lib/auth.ts", {
  "next/headers": { headers: async () => new Headers({ host }) },
  "@/server/platform/domains": {
    getRequestInstitution: async () => host === "a.test" ? { id: "a", slug: "alpha", domain: "a.test" } : null,
    resolveInstitutionHost: async () => null,
  },
  "@/server/identity": { findOwnMembership: async () => null },
  "@/server/login": {
    authenticateCredentialsWithStatus: async () => {
      credentialChecks++;
      return { user: null, suspendedInstitutionName: suspendedName };
    },
    rejectCredentials: () => null,
  },
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

async function postCredentials(origin: string, csrfToken: string, cookie: string) {
  return handlers.POST(new NextRequest(`${origin}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { host, cookie, "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" },
    body: new URLSearchParams({
      email: "person@example.test", password: "synthetic-password123", institutionSlug: "colegio",
      csrfToken, callbackUrl: `${origin}/login?institucion=colegio`,
    }),
  }));
}

for (const origin of ["https://central.test", "http://127.0.0.1:3000"]) {
  test(`credentials HTTP: real CSRF/callback preserves suspended code and client message on ${origin}`, async () => {
    host = new URL(origin).host;
    suspendedName = "Colegio Peña & Hijos";
    const csrf = await handlers.GET(new NextRequest(`${origin}/api/auth/csrf`, { headers: { host } }));
    assert.equal(csrf.status, 200);
    const { csrfToken } = await csrf.json();
    const cookie = csrf.headers.getSetCookie().map((entry) => entry.split(";")[0]).join("; ");
    const response = await postCredentials(origin, csrfToken, cookie);
    assert.equal(response.status, 200);
    const payload = await response.json();
    // Same parsing performed by next-auth/react signIn({ redirect: false }).
    const result = new URL(payload.url).searchParams;
    assert.equal(result.get("error"), "CredentialsSignin");
    assert.equal(result.get("code"), `${SUSPENDED_CREDENTIAL_CODE}${encodeURIComponent(suspendedName)}`);
    assert.equal(suspendedCredentialMessage(result.get("code") ?? undefined),
      "El acceso de Colegio Peña & Hijos está pausado. Contacta a tu administración.");
    assert.equal(response.headers.getSetCookie().some((entry) => entry.includes("authjs.session-token=")), false);
    suspendedName = undefined;
  });
}

test("credentials HTTP: missing CSRF cannot reach credential validation or disclose institution status", async () => {
  host = "central.test";
  suspendedName = "Private fixture institution";
  const checksBefore = credentialChecks;
  const response = await postCredentials("https://central.test", "invalid-csrf", "");
  const payload = await response.json();
  assert.equal(credentialChecks, checksBefore);
  assert.equal(new URL(payload.url).searchParams.has("code"), false);
  assert.equal(payload.url.includes("Private"), false);
  suspendedName = undefined;
});
