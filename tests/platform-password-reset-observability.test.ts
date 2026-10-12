import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { getEmailProvider, setEmailProviderForTests, type EmailMessage } from "../src/server/integrations/email";
import type { PasswordResetStage } from "../src/server/security/password-reset-observability";
import { reportPasswordResetFailure } from "../src/server/security/password-reset-observability";

const require = createRequire(import.meta.url);
const { loadWithStubs } = require("./helpers/load-with-stubs.cjs");
const publicResponse = {
  ok: true,
  message: "Solicitud recibida. Si podemos procesarla, recibirás un enlace para cambiar tu contraseña. Si no llega, inténtalo más tarde.",
};
const initial = { ok: false, message: "" };
const privateData = "person@example.test 203.0.113.12 fake-password /restablecer/fake-token postgresql://private-connection";
const sensitiveError = Object.assign(new Error(privateData), { code: "P1001", meta: { privateData }, cause: new Error(privateData) });
let failureAt: PasswordResetStage | null;
let failure: unknown;
let known: boolean;
let active: boolean;
let hasMembership: boolean;
let hasDomain: boolean;
let attempts: number;
let tokenCount: number;
let calls: string[];
let sent: EmailMessage[];
let logs: unknown[][];
let returned: boolean;
let completion: "success" | "invalid" | "throw";
let completedWrites: number;
let originalError: typeof console.error;
const envNames = ["AUTH_SECRET", "NEXTAUTH_SECRET", "APP_URL", "AUTH_URL", "NEXTAUTH_URL", "PLATFORM_ROOT_DOMAIN", "RESEND_API_KEY", "EMAIL_FROM"];
let originalEnv: Record<string, string | undefined>;

function step(stage: PasswordResetStage) {
  calls.push(stage);
  if (failureAt === stage) throw failure;
}
const fakeDb = {
  loginAttempt: {
    count: async () => { step("rate_limit_check"); return attempts; },
    deleteMany: async () => { step("attempt_record"); return { count: 0 }; },
    create: async () => { step("attempt_record"); attempts++; return {}; },
  },
  $transaction: (operations: Promise<unknown>[]) => Promise.all(operations),
  identity: { findUnique: async () => {
    step("identity_lookup"); return known ? { id: "private-identity", status: active ? "ACTIVE" : "SUSPENDED" } : null;
  } },
  passwordResetToken: { create: async () => { step("token_create"); tokenCount++; return {}; } },
};
const throttle: typeof import("../src/server/security/login-throttle") = loadWithStubs("src/server/security/login-throttle.ts", {
  "@/lib/db": { db: fakeDb },
});
const service: typeof import("../src/server/password-reset") = loadWithStubs("src/server/password-reset.ts", {
  "@/lib/db": { db: fakeDb },
  "@/server/identity": {
    normalizeEmail: (email: string) => email.trim().toLowerCase(),
    listActiveMemberships: async () => {
      step("membership_lookup");
      return hasMembership ? [{ id: "private-user", institutionId: "private-institution", name: "Private Person" }] : [];
    },
  },
  "@/server/security/login-throttle": throttle,
  "@/server/integrations/email": { getEmailProvider: () => { step("provider_setup"); return getEmailProvider(); } },
  "@/server/platform/branded-email": {
    loadEmailBrand: async () => { step("branding_lookup"); return { name: "Private School", domain: hasDomain ? "school.example.test" : null }; },
    brandedEmail: (_brand: unknown, message: EmailMessage) => message,
  },
});
const actions: typeof import("../src/server/actions/password-reset") = loadWithStubs("src/server/actions/password-reset.ts", {
  "next/headers": { headers: async () => { step("request_context"); return new Headers({ "x-forwarded-for": "203.0.113.12" }); } },
  "@/server/platform/domains": { getRequestInstitution: async () => { step("host_resolution"); return null; } },
  "@/server/security/login-throttle": throttle,
  "@/server/password-reset": {
    requestPasswordReset: async (input: Parameters<typeof service.requestPasswordReset>[0]) => {
      const result = await service.requestPasswordReset(input);
      assert.equal(result, undefined); returned = true;
    },
    resetPasswordWithToken: async () => {
      if (completion === "throw") throw sensitiveError;
      if (completion === "invalid") return { ok: false, reason: "invalid_token", message: "Enlace inválido." };
      completedWrites++; return { ok: true };
    },
  },
});

beforeEach(() => {
  originalEnv = Object.fromEntries(envNames.map(key => [key, process.env[key]]));
  envNames.forEach(key => delete process.env[key]);
  process.env.AUTH_SECRET = "isolated-recovery-test-secret";
  process.env.APP_URL = "https://platform.example.test";
  failureAt = null; failure = sensitiveError; known = true; active = true; hasMembership = true; hasDomain = true;
  attempts = 0; tokenCount = 0; calls = []; sent = []; logs = []; returned = false;
  completion = "throw"; completedWrites = 0;
  originalError = console.error;
  console.error = (...args: unknown[]) => { logs.push(args); };
  setEmailProviderForTests({ send: async message => { step("provider_send"); sent.push(message); } });
});
afterEach(() => {
  console.error = originalError;
  setEmailProviderForTests(null);
  for (const key of envNames) {
    if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key];
  }
});
async function request(email = "person@example.test") {
  const form = new FormData(); form.set("email", email);
  return actions.requestPasswordResetAction(initial, form);
}
function assertSafeFailure(stage: PasswordResetStage, code: string) {
  assert.equal(logs.length, 1, "one operational failure produces one sanitized event");
  const [event, value] = logs[0] as [string, Record<string, unknown>];
  assert.equal(event, "password_reset_failure");
  assert.equal(value.stage, stage); assert.equal(value.code, code);
  assert.match(String(value.correlationId), /^[0-9a-f-]{36}$/);
  assert.deepEqual(Object.keys(value).sort(), (value.databaseCode
    ? ["code", "correlationId", "databaseCode", "stage"] : ["code", "correlationId", "stage"]).sort());
  const serialized = JSON.stringify(logs);
  for (const fragment of ["person@example.test", "203.0.113.12", "fake-password", "fake-token", "private-",
    "Private Person", "Private School", "stack", "meta", "cause", "postgresql://"]) {
    assert.equal(serialized.includes(fragment), false, "diagnostic contains no request, account or exception data");
  }
  for (const message of sent) assert.equal(serialized.includes(message.text), false);
}

test("provider acceptance stays internal; public response never asserts delivery", async () => {
  assert.deepEqual(await request(), publicResponse);
  assert.equal(returned, true);
  assert.equal(attempts, 1); assert.equal(tokenCount, 1); assert.equal(sent.length, 1);
  assert.equal(logs.length, 0);
});
for (const eligibility of ["missing", "suspended", "no-membership"] as const) {
  test(`${eligibility}: same public response, attempt retained, no eligibility log or mail`, async () => {
    if (eligibility === "missing") known = false;
    if (eligibility === "suspended") active = false;
    if (eligibility === "no-membership") hasMembership = false;
    assert.deepEqual(await request(), publicResponse);
    assert.equal(returned, true);
    assert.equal(attempts, 1); assert.equal(tokenCount, 0); assert.equal(sent.length, 0); assert.equal(logs.length, 0);
  });
}
test("real throttle stops the sixth email request without exposing the limit", async () => {
  for (let i = 0; i < throttle.MAX_FAILURES_PER_EMAIL; i++) assert.deepEqual(await request(), publicResponse);
  assert.equal(sent.length, throttle.MAX_FAILURES_PER_EMAIL);
  assert.deepEqual(await request(), publicResponse);
  assert.equal(returned, true);
  assert.equal(attempts, throttle.MAX_FAILURES_PER_EMAIL);
  assert.equal(tokenCount, throttle.MAX_FAILURES_PER_EMAIL);
  assert.equal(sent.length, throttle.MAX_FAILURES_PER_EMAIL); assert.equal(logs.length, 0);
});
for (const stage of ["rate_limit_check", "attempt_record", "identity_lookup", "membership_lookup", "branding_lookup", "token_create"] as const) {
  test(`database failure at ${stage}: sanitized diagnostic, identical public response, no send`, async () => {
    failureAt = stage;
    assert.deepEqual(await request(), publicResponse);
    const caughtInService = stage === "branding_lookup" || stage === "token_create";
    assert.equal(returned, caughtInService);
    assert.equal(tokenCount, 0); assert.equal(sent.length, 0);
    assertSafeFailure(caughtInService ? stage : "request", "DATABASE_ERROR");
    assert.equal((logs[0][1] as { databaseCode: string }).databaseCode, "P1001");
  });
}
for (const stage of ["request_context", "host_resolution"] as const) {
  test(`action boundary ${stage}: operational failure cannot leak through the neutral response`, async () => {
    failureAt = stage;
    assert.deepEqual(await request(), publicResponse);
    assert.equal(returned, false); assert.equal(attempts, 0); assert.equal(tokenCount, 0);
    assertSafeFailure(stage, "DATABASE_ERROR");
  });
}
test("missing auth secret is identified before any write, without logging its value", async () => {
  delete process.env.AUTH_SECRET;
  assert.deepEqual(await request(), publicResponse);
  assert.equal(returned, false); assert.equal(attempts, 0); assert.equal(tokenCount, 0);
  assertSafeFailure("request", "AUTH_CONFIGURATION");
});
test("missing email configuration is distinguished from provider rejection", async () => {
  setEmailProviderForTests(null);
  assert.deepEqual(await request(), publicResponse);
  assert.equal(returned, true); assert.equal(attempts, 1); assert.equal(tokenCount, 1); assert.equal(sent.length, 0);
  assertSafeFailure("provider_setup", "MAIL_CONFIGURATION");
});
test("provider rejection never confirms delivery or logs provider response contents", async () => {
  failureAt = "provider_send"; failure = new Error(privateData);
  assert.deepEqual(await request(), publicResponse);
  assert.equal(returned, true); assert.equal(attempts, 1); assert.equal(tokenCount, 1); assert.equal(sent.length, 0);
  assertSafeFailure("provider_send", "MAIL_PROVIDER");
});
test("missing link origin is diagnosed separately without printing the link or token", async () => {
  hasDomain = false; delete process.env.APP_URL;
  assert.deepEqual(await request(), publicResponse);
  assert.equal(returned, true); assert.equal(sent.length, 0);
  assertSafeFailure("message_build", "MESSAGE_CONFIGURATION");
});
test("untrusted exception codes cannot inject data into diagnostics", async () => {
  failureAt = "host_resolution"; failure = Object.assign(new Error(privateData), { code: `P1001 ${privateData}` });
  assert.deepEqual(await request(), publicResponse);
  assertSafeFailure("host_resolution", "UNEXPECTED_ERROR");
});
test("password completion exception is sanitized too; no actual password update is called", async () => {
  const form = new FormData();
  form.set("token", "fake-token"); form.set("password", "fake-password"); form.set("confirmPassword", "fake-password");
  const response = await actions.resetPasswordAction(initial, form);
  assert.equal(response.ok, false);
  assert.equal(response.message.includes("fake-"), false);
  assertSafeFailure("password_update", "DATABASE_ERROR");
});
test("invalid email format is rejected before any account lookup", async () => {
  assert.deepEqual(await request("not-an-email"), { ok: false, message: "Escribe un correo válido." });
  assert.equal(calls.length, 0); assert.equal(logs.length, 0);
});
test("shared Prisma client suppresses raw errors but preserves the caller rejection", async () => {
  const globals = globalThis as typeof globalThis & { prisma?: unknown };
  const previous = globals.prisma; delete globals.prisma;
  let options: unknown;
  try {
    const { db } = loadWithStubs("src/lib/db.ts", { "@prisma/client": { PrismaClient: class {
      constructor(input: unknown) { options = input; }
      async query() {
        if ((options as { log: string[] }).log.includes("error")) console.error(sensitiveError);
        throw sensitiveError;
      }
    } } });
    assert.deepEqual(options, { log: [] });
    await assert.rejects(db.query(), (error: unknown) => error === sensitiveError);
    assert.equal(logs.length, 0);
  } finally {
    if (previous === undefined) delete globals.prisma; else globals.prisma = previous;
  }
});
test("service retains its pre-provider rejection contract and never logs eligibility", async () => {
  failureAt = "identity_lookup";
  await assert.rejects(service.requestPasswordReset({ email: "person@example.test", ip: "test" }), error => error === failure);
  assert.equal(logs.length, 0); assert.equal(sent.length, 0);
});
test("hostile exception values and getters cannot leak or interrupt the public response", async () => {
  const cyclic: Record<string, unknown> = { message: privateData }; cyclic.self = cyclic;
  const throwing = () => { throw new Error(privateData); };
  const variants: unknown[] = [undefined, null, privateData, cyclic, { code: privateData },
    new Proxy(new Error(privateData), { getPrototypeOf: throwing }),
    new Proxy(new Error(privateData), { has: throwing }),
    Object.defineProperty(new Error(privateData), "code", { get: throwing }),
    Object.defineProperty(new Error(privateData), "message", { get: throwing }),
    Object.assign(new Error(privateData), { code: { toString: throwing }, toJSON: throwing })];
  for (const value of variants) {
    logs = []; attempts = 0; failureAt = "provider_send"; failure = value;
    assert.deepEqual(await request(), publicResponse);
    assertSafeFailure("provider_send", "MAIL_PROVIDER");
  }
});
test("diagnostics constrain stage and code, including a changing accessor", () => {
  let reads = 0;
  const value = Object.defineProperty(new Error(privateData), "code", { get: () => ++reads === 1 ? "P1001" : privateData });
  const result = reportPasswordResetFailure(privateData as PasswordResetStage, value);
  assert.equal(reads, 1); assert.equal(result.databaseCode, "P1001");
  assertSafeFailure("request", "DATABASE_ERROR");
});
test("logger failure preserves request failure, rejection and completed write responses", async () => {
  let attemptsToLog = 0;
  console.error = () => { attemptsToLog++; throw new Error(privateData); };
  failureAt = "provider_send"; failure = sensitiveError;
  assert.deepEqual(await request(), publicResponse); assert.equal(attemptsToLog, 1);
  const form = new FormData(); form.set("token", "fake-token");
  form.set("password", "fake-password"); form.set("confirmPassword", "fake-password");
  assert.equal((await actions.resetPasswordAction(initial, form)).ok, false); assert.equal(attemptsToLog, 2);
  completion = "invalid";
  assert.deepEqual(await actions.resetPasswordAction(initial, form), { ok: false, message: "Enlace inválido." });
  completion = "success";
  assert.deepEqual(await actions.resetPasswordAction(initial, form), { ok: true, message: "Contraseña actualizada. Ya puedes iniciar sesión." });
  assert.equal(completedWrites, 1); assert.equal(attemptsToLog, 2);
});
test("correlation generator failure has a fixed fallback and cannot expose its exception", () => {
  const filename = require.resolve("../src/server/security/password-reset-observability.ts");
  const cached = require.cache[filename]; delete require.cache[filename];
  try {
    const isolated = loadWithStubs("src/server/security/password-reset-observability.ts", {
      "node:crypto": { randomUUID: () => { throw sensitiveError; } },
    });
    const result = isolated.reportPasswordResetFailure("provider_send", new Error(privateData));
    assert.equal(result.correlationId, "unavailable"); assert.equal(logs.length, 1);
    assert.equal(JSON.stringify(logs).includes(privateData), false);
  } finally { require.cache[filename] = cached; }
});
test("actual stdout and stderr contain fixed diagnostics only", () => {
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", ...Object.fromEntries(["PATH", "Path", "SystemRoot", "SYSTEMROOT", "TEMP", "TMP"]
    .flatMap(key => process.env[key] ? [[key, process.env[key]!]] : [])) };
  const script = `const { reportPasswordResetFailure: report } = require('./src/server/security/password-reset-observability.ts');
    const error = Object.assign(new Error(${JSON.stringify(privateData)}), { cause: ${JSON.stringify(privateData)} });
    report('provider_send', error);`;
  const result = spawnSync(process.execPath, ["--import", "tsx", "--eval", script], { env, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0); assert.equal(result.stdout, "");
  assert.match(result.stderr, /password_reset_failure/); assert.match(result.stderr, /MAIL_PROVIDER/);
  for (const fragment of privateData.split(" ")) assert.equal(result.stderr.includes(fragment), false);
});
