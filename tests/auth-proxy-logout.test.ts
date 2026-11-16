import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { decode, encode } from "next-auth/jwt";
import { NextRequest, type NextFetchEvent } from "next/server";

// Public, synthetic fixtures only. No application DB, browser, or network access.
const origin = "http://localhost:3200";
const secret = "auth-proxy-test-public-fixture-secret-only";
const sessionName = "authjs.session-token";
const maxAge = 60 * 60;
const event = {} as NextFetchEvent;
const fixtureAuth = NextAuth({
  secret,
  trustHost: true,
  useSecureCookies: false,
  basePath: "/api/auth",
  session: { strategy: "jwt", maxAge },
  providers: [Credentials({
    credentials: {},
    authorize: () => ({ id: "fixture-user", name: "Fixture", institutionId: "a", role: "ADMIN",
      institutionSlug: "alpha", sessionVersion: 1, identityId: "fixture-identity", institutionCount: 2 }),
  })],
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) token.institutionId = user.institutionId;
      if (trigger === "update") token.institutionId = session.institutionId;
      return token;
    },
    session({ session, token }) {
      session.user.institutionId = token.institutionId as string;
      return session;
    },
  },
});

let hostInstitution: { id: string } | null = null;
let beforeHostResolution: (() => Promise<void>) | undefined;
const require = createRequire(import.meta.url);
const { loadWithStubs } = require("./helpers/load-with-stubs.cjs");
const { default: proxy }: typeof import("../src/proxy") = loadWithStubs("src/proxy.ts", {
  "@/lib/auth": { authFromToken: fixtureAuth.auth },
  "@/server/platform/domains": {
    resolveInstitutionHost: async () => {
      await beforeHostResolution?.();
      return hostInstitution;
    },
  },
});

class CookieJar {
  values = new Map<string, string>();
  apply(response: Response) {
    for (const cookie of response.headers.getSetCookie()) {
      const [pair, ...attributes] = cookie.split(";");
      const equals = pair.indexOf("=");
      const name = pair.slice(0, equals);
      const value = pair.slice(equals + 1);
      if (attributes.some((attribute) => /^\s*Max-Age=0\s*$/i.test(attribute))) this.values.delete(name);
      else this.values.set(name, value);
    }
  }
  header() { return [...this.values].map(([name, value]) => `${name}=${value}`).join("; "); }
  hasSession() { return [...this.values.keys()].some((name) => name.startsWith(sessionName)); }
}

function request(path: string, jar = new CookieJar(), init: NonNullable<ConstructorParameters<typeof NextRequest>[1]> = {}) {
  const headers = new Headers(init.headers);
  headers.set("host", "localhost:3200");
  if (jar.values.size) headers.set("cookie", jar.header());
  return new NextRequest(`${origin}${path}`, { ...init, headers });
}

async function authenticatedJar(extra = {}) {
  const jar = new CookieJar();
  const token = await encode({
    secret, salt: sessionName, maxAge,
    token: { sub: "fixture-user", institutionId: "a", ...extra },
  });
  if (token.length <= 3800) jar.values.set(sessionName, token);
  else for (let offset = 0; offset < token.length; offset += 3800) {
    jar.values.set(`${sessionName}.${offset / 3800}`, token.slice(offset, offset + 3800));
  }
  return jar;
}

async function csrf(jar: CookieJar) {
  const response = await fixtureAuth.handlers.GET(request("/api/auth/csrf", jar));
  jar.apply(response);
  return (await response.json()).csrfToken as string;
}

async function signout(jar: CookieJar) {
  const csrfToken = await csrf(jar);
  const response = await fixtureAuth.handlers.POST(request("/api/auth/signout", jar, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-auth-return-redirect": "1" },
    body: new URLSearchParams({ csrfToken, callbackUrl: `${origin}/login` }),
  }));
  assert.equal(response.status, 200);
  jar.apply(response);
  assert.equal(jar.hasSession(), false, "the real signout handler must clear the session");
}

test("late concurrent navigation responses cannot restore the session after real signout", { timeout: 5000 }, async () => {
  const jar = await authenticatedJar();
  const paths = ["/dashboard/aula", "/dashboard/comunidad", "/dashboard/notificaciones", "/dashboard/perfil"];
  let release!: () => void;
  let ready!: () => void;
  let entered = 0;
  const allEntered = new Promise<void>((resolve) => { ready = resolve; });
  const held = new Promise<void>((resolve) => { release = resolve; });
  beforeHostResolution = async () => {
    if (++entered === paths.length) ready();
    await held;
  };
  const pending = paths.map((path) => proxy(request(path, jar), event));
  try {
    await allEntered; // The real Auth.js wrapper has already read each JWT.
    await signout(jar);
  } finally {
    release();
    beforeHostResolution = undefined;
  }
  for (const response of await Promise.all(pending)) {
    assert.ok(response instanceof Response);
    assert.equal(response.status, 200);
    jar.apply(response);
  }
  assert.equal(jar.hasSession(), false);
  const protectedResponse = await proxy(request("/dashboard", jar), event);
  assert.equal(protectedResponse?.status, 307);
  assert.equal(new URL(protectedResponse!.headers.get("location")!).pathname, "/login");
});

test("normal, prefetch and API proxy responses cannot renew or chunk the session cookie", async () => {
  const jar = await authenticatedJar({ padding: "fixture".repeat(1200) });
  for (const path of ["/dashboard", "/dashboard/aula", "/api/auth/session", "/api/auth/signout"]) {
    const response = await proxy(request(path, jar, { headers: { "next-router-prefetch": "1" } }), event);
    assert.equal(response?.status, 200);
    assert.equal(response?.headers.has("set-cookie"), false);
    assert.equal(response?.headers.get("x-middleware-next"), "1");
  }
});

test("protected redirects, actual host and sanitized request headers are preserved", async () => {
  const denied = await proxy(request("/dashboard?tab=one"), event);
  assert.equal(denied?.status, 307);
  const location = new URL(denied!.headers.get("location")!);
  assert.equal(location.origin, origin);
  assert.equal(location.searchParams.get("callbackUrl"), "/dashboard?tab=one");
  const publicResponse = await proxy(request("/login"), event);
  assert.equal(publicResponse?.status, 200);
  const clean = await proxy(request("/api/auth/session", await authenticatedJar(), { headers: {
    "x-forwarded-host": "evil.test", "x-forwarded-proto": "https", "forwarded": "host=evil.test",
    "x-institution-id": "b", "x-tenant-id": "b",
  } }), event);
  assert.equal(clean?.headers.get("x-middleware-request-x-forwarded-host"), "localhost:3200");
  assert.equal(clean?.headers.get("x-middleware-request-x-forwarded-proto"), "http");
  for (const name of ["forwarded", "x-institution-id", "x-tenant-id"]) {
    assert.equal(clean?.headers.has(`x-middleware-request-${name}`), false);
  }
  const malformed = new NextRequest(`${origin}/dashboard`, { headers: { host: "bad/host" } });
  assert.equal((await proxy(malformed, event))?.status, 400);
});

test("other-institution navigation remains denied without refreshing its cookie", async () => {
  hostInstitution = { id: "b" };
  try {
    const response = await proxy(request("/dashboard", await authenticatedJar()), event);
    assert.equal(response?.status, 307);
    assert.equal(response?.headers.has("set-cookie"), false);
  } finally {
    hostInstitution = null;
  }
});

test("real Auth.js handlers still issue login cookies, renew explicitly, update and sign out", async () => {
  const jar = new CookieJar();
  const csrfToken = await csrf(jar);
  const login = await fixtureAuth.handlers.POST(request("/api/auth/callback/credentials", jar, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-auth-return-redirect": "1" },
    body: new URLSearchParams({ csrfToken, callbackUrl: `${origin}/dashboard` }),
  }));
  assert.equal(login.status, 200);
  jar.apply(login);
  assert.equal(jar.hasSession(), true);
  const renewal = await fixtureAuth.handlers.GET(request("/api/auth/session", jar));
  assert.equal(renewal.status, 200);
  assert.ok(renewal.headers.getSetCookie().some((cookie) => cookie.startsWith(`${sessionName}=`)));
  jar.apply(renewal);
  const updated = await fixtureAuth.handlers.POST(request("/api/auth/session", jar, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ csrfToken, data: { institutionId: "b" } }),
  }));
  assert.equal(updated.status, 200);
  jar.apply(updated);
  const token = await decode({ secret, salt: sessionName, token: jar.values.get(sessionName) });
  assert.equal(token?.institutionId, "b");
  const remaining = token!.exp! - Math.floor(Date.now() / 1000);
  assert.ok(remaining >= maxAge - 5 && remaining <= maxAge);
  await signout(jar);
});
