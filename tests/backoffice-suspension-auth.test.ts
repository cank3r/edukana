import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { beforeEach, test } from "node:test";

const require = createRequire(import.meta.url);
const { loadWithStubs } = require("./helpers/load-with-stubs.cjs");
let passwordMatches = true;
let allowed = true;
let identityStatus = "ACTIVE";
let statuses = ["SUSPENDED", "ACTIVE"];
const attempts: boolean[] = [];
const audits: unknown[] = [];
const login: typeof import("@/server/login") = loadWithStubs("src/server/login.ts", {
  bcryptjs: { compare: async () => passwordMatches, hashSync: () => "dummy" },
  "@/lib/db": { db: {
    identity: { findUnique: async () => ({ id: "identity", passwordHash: "hash", sessionVersion: 0, status: identityStatus }) },
    auditLog: { create: async (args: unknown) => { audits.push(args); } },
  } },
  "@/server/identity": {
    normalizeEmail: (value: string) => value.trim().toLowerCase(),
    listActiveMemberships: async () => statuses.map((status, index) => ({
      id: `membership-${index}`, identityId: "identity", name: "Person", role: "ADMIN", institutionId: `institution-${index}`,
      institution: { slug: `school-${index}`, status, name: `School ${index}` },
    })),
  },
  "@/server/security/login-throttle": {
    isAttemptAllowed: async () => allowed,
    recordAttempt: async (_subject: unknown, succeeded: boolean) => { attempts.push(succeeded); },
  },
});
let userState = {
  id: "membership", institutionId: "school", role: "TEACHER", status: "ACTIVE", sessionVersion: 0,
  identity: { id: "identity", status: "ACTIVE", sessionVersion: 0 },
  institution: { slug: "school", name: "Colegio Pausado", status: "SUSPENDED" },
};
const session: typeof import("@/server/session") = loadWithStubs("src/server/session.ts", {
  "@/lib/db": { db: { user: { findUnique: async () => userState } } },
});
const credentials = { email: "person@test.test", password: "password", ip: "127.0.0.1" };
const claims = { userId: "membership", identityId: "identity", sessionVersion: 0 };
beforeEach(() => {
  passwordMatches = true; allowed = true; identityStatus = "ACTIVE"; statuses = ["SUSPENDED", "ACTIVE"];
  attempts.length = 0; audits.length = 0;
  userState = { ...userState, status: "ACTIVE", institution: { ...userState.institution, status: "SUSPENDED" } };
});

test("BO-B auth: login global elige membresía activa sin invalidar identidad ni contar la pausada", async () => {
  const user = await login.authenticateCredentials(credentials);
  assert.equal(user?.institutionId, "institution-1");
  assert.equal(user?.institutionCount, 1);
  assert.equal(user?.sessionVersion, 0);
  assert.deepEqual(attempts, [true]);
  assert.deepEqual(audits, [{ data: {
    institutionId: "institution-1", userId: "membership-1",
    action: "LOGIN_SUCCEEDED", entity: "User", entityId: "membership-1", changes: {},
  } }]);
});

test("BO-B auth: slug suspendido rechaza sin fallback ni fallo del limitador", async () => {
  const result = await login.authenticateCredentialsWithStatus({ ...credentials, institutionSlug: "school-0" });
  assert.deepEqual(result, { user: null, suspendedInstitutionName: "School 0" });
  assert.deepEqual(attempts, [true]);
  assert.equal(audits.length, 0);
});

test("BO-B auth: no filtra suspensión antes de contraseña y cuenta válidas", async () => {
  passwordMatches = false;
  assert.deepEqual(await login.authenticateCredentialsWithStatus({ ...credentials, institutionSlug: "school-0" }), { user: null });
  passwordMatches = true; identityStatus = "SUSPENDED";
  assert.deepEqual(await login.authenticateCredentialsWithStatus(credentials), { user: null });
  assert.deepEqual(attempts, [false, false]);
  assert.equal(audits.length, 0);
});

test("BO-B auth: límite de intentos sigue rechazando incluso contraseña correcta", async () => {
  allowed = false;
  assert.deepEqual(await login.authenticateCredentialsWithStatus(credentials), { user: null });
  assert.equal(attempts.length, 0);
  assert.equal(audits.length, 0);
});

test("BO-B auth: la sesión viva corta institución suspendida y se restaura al reactivar", async () => {
  assert.equal(await session.resolveLiveIdentity(claims), null);
  assert.deepEqual(await session.resolveSessionAccess(claims), { identity: null, suspendedInstitutionName: "Colegio Pausado" });
  userState.institution.status = "ACTIVE";
  assert.equal((await session.resolveLiveIdentity(claims))?.institutionId, "school");
});

test("BO-B auth: token vencido, identidad ajena o miembro suspendido no revelan nombre", async () => {
  assert.equal(await session.resolveSessionAccess({ ...claims, sessionVersion: 1 }), null);
  assert.equal(await session.resolveSessionAccess({ ...claims, identityId: "foreign" }), null);
  userState.status = "SUSPENDED";
  assert.equal(await session.resolveSessionAccess(claims), null);
});
