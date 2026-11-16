import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import type { NextAuthConfig, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
const require = createRequire(import.meta.url);
const { loadWithStubs } = require("./helpers/load-with-stubs.cjs");
let config: NextAuthConfig;
let hostInstitution: { id: string; slug: string; domain: string } | null = { id: "a", slug: "alpha", domain: "alpha.test" };
const session: Session | null = { user: { id: "user-b", institutionId: "b", institutionSlug: "beta", identityId: "identity",
  role: "ADMIN", sessionVersion: 1, institutionCount: 2 }, expires: "2099-01-01" };
const membership = { id: "user-b", institutionId: "b", institution: { slug: "beta" }, name: "B", role: "ADMIN" };
let submittedSlug: unknown;
let requestHostOverride: string | null = null;
const factory = Object.assign((input: NextAuthConfig) => {
  config = input;
  return { auth: async () => session, handlers: {}, unstable_update: async () => {}, signIn: async () => {}, signOut: async () => {} };
}, { CredentialsSignin: class extends Error { code = ""; } });
const authModule: typeof import("@/lib/auth") = loadWithStubs("src/lib/auth.ts", {
  "react": { cache: (fn: unknown) => fn },
  "next/headers": { headers: async () => new Headers({ host: requestHostOverride ?? hostInstitution?.domain ?? "central.test" }) },
  "next-auth": factory,
  "next-auth/providers/credentials": (input: unknown) => input,
  "@/server/platform/domains": {
    getRequestInstitution: async () => hostInstitution, resolveInstitutionHost: async () => hostInstitution,
    institutionBaseUrl: (institution: { domain: string }) => `https://${institution.domain}`,
  },
  "@/server/identity": { findOwnMembership: async () => membership },
  "@/server/login": {
    authenticateCredentialsWithStatus: async (input: { institutionSlug: unknown }) => { submittedSlug = input.institutionSlug; return { user: null }; },
    rejectCredentials: () => null,
  },
  "@/server/session": { resolveLiveIdentity: async () => session?.user },
});
const jwt = (token: Partial<JWT>, extra = {}) => config.callbacks!.jwt!({ token, account: null, user: undefined, ...extra } as unknown as
  Parameters<NonNullable<NonNullable<NextAuthConfig["callbacks"]>["jwt"]>>[0]);

test("host auth: live auth rejects B session under A, permits same institution and central host", async () => {
  assert.equal(await authModule.auth(), null);
  hostInstitution = { id: "b", slug: "beta", domain: "beta.test" };
  assert.equal((await authModule.auth())?.user.institutionId, "b");
  hostInstitution = null;
  assert.equal((await authModule.auth())?.user.institutionId, "b");
});

test("host auth: Auth.js JWT session path discards a replayed other-institution cookie", async () => {
  hostInstitution = { id: "a", slug: "alpha", domain: "alpha.test" };
  assert.equal(await jwt({ sub: "user-b", institutionId: "b" }), null);
  assert.equal((await jwt({ sub: "user-a", institutionId: "a" }))?.sub, "user-a");
});

test("host auth: credentials use host institution regardless of submitted slug", async () => {
  const credentials = config.providers[0] as unknown as { authorize: (credentials: unknown, request: Request) => Promise<unknown> };
  await credentials.authorize({ email: "member@example.test", password: "password123", institutionSlug: "beta" },
    new Request("https://alpha.test/api/auth/callback/credentials", { headers: { host: "alpha.test" } }));
  assert.equal(submittedSlug, "alpha");
});

test("host auth: client JWT update cannot switch to another institution; central can", async () => {
  const token = { sub: "user-a", institutionId: "a", idn: "identity" };
  const retained = await jwt(token, { trigger: "update", session: { activeUserId: "user-b" } });
  assert.equal(retained?.institutionId, "a");
  assert.equal(retained?.sub, "user-a");
  hostInstitution = null;
  assert.equal((await jwt({ ...token }, { trigger: "update", session: { activeUserId: "user-b" } }))?.institutionId, "b");
});

test("host auth: redirects stay on canonical tenant despite central AUTH_URL or malicious callback", async () => {
  hostInstitution = { id: "a", slug: "alpha", domain: "alpha.test" };
  const redirect = config.callbacks!.redirect!;
  assert.equal(await redirect({ url: "/dashboard", baseUrl: "https://central.test" }), "https://alpha.test/dashboard");
  assert.equal(await redirect({ url: "https://evil.test", baseUrl: "https://central.test" }), "https://alpha.test");
  assert.equal(await redirect({ url: "//evil.test", baseUrl: "https://central.test" }), "https://alpha.test");
});

test("host auth: login on root-subdomain alias stays there when canonical email domain differs", async () => {
  hostInstitution = { id: "a", slug: "alpha", domain: "custom.test" };
  requestHostOverride = "alpha.platform.test";
  assert.equal(await config.callbacks!.redirect!({ url: "/dashboard", baseUrl: "https://central.test" }),
    "https://alpha.platform.test/dashboard");
  requestHostOverride = null;
});
