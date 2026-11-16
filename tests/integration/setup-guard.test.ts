import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { Prisma } from "@prisma/client";
import { checkSetupToken } from "../../src/server/setup-token";

const require = createRequire(import.meta.url);
const { loadWithStubs } = require("../helpers/load-with-stubs.cjs");
// Public fixtures only. Never read process.env or load the real database module.
const token = "setup-guard-public-fixture-123456";
const unavailable = { ok: false, message: "La puesta en marcha inicial no está disponible." };
let env: Record<string, string | undefined>;
let institutions: number;
let calls: string[];
let writes: Array<{ model: string; data: unknown }>;
let transactionError: Error | undefined;

const create = (model: string, id: string) => async ({ data }: { data: unknown }) => {
  calls.push(model);
  writes.push({ model, data });
  if (model === "institution") institutions += 1;
  return { id };
};
const tx = {
  institution: {
    count: async () => { calls.push("count"); return institutions; },
    create: create("institution", "fixture-institution"),
  },
  user: { create: create("user", "fixture-admin") },
  auditLog: { create: create("auditLog", "fixture-audit") },
};
const database = {
  institution: tx.institution,
  $transaction: async (callback: (client: typeof tx) => Promise<void>, options: unknown) => {
    calls.push("transaction");
    assert.deepEqual(options, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (transactionError) throw transactionError;
    await callback(tx);
  },
};
const stubs = {
  "@/lib/db": { db: database },
  "@/server/setup-token": { checkSetupToken: (value: string) => checkSetupToken(value, env) },
};
const { createFirstInstitution }: typeof import("../../src/app/setup/actions") = loadWithStubs("src/app/setup/actions.ts", {
  ...stubs,
  bcryptjs: { hash: async () => { calls.push("hash"); return "fixture-hash"; } },
  "@/server/identity": { ensureIdentity: async (client: unknown, input: unknown) => {
    assert.equal(client, tx);
    assert.deepEqual(input, { email: "admin@example.invalid", passwordHash: "fixture-hash" });
    calls.push("identity");
    return "fixture-identity";
  } },
});
// Real Next navigation exceptions, real guard and real page/action; only external boundaries are stubbed.
const { default: SetupPage }: typeof import("../../src/app/setup/page") = loadWithStubs("src/app/setup/page.tsx", {
  ...stubs,
  "./SetupForm": { SetupForm: () => null },
});
function form(provided: string | null = token) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    institutionName: "Institución Fixture", slug: "institucion-fixture", adminName: "Admin Fixture",
    adminEmail: "admin@example.invalid", password: "public-fixture-password-123",
  })) data.set(key, value);
  if (provided !== null) data.set("setupToken", provided);
  return data;
}
const submit = (provided: string | null = token) => createFirstInstitution({ ok: false, message: "" }, form(provided));
const page = (provided?: string | string[]) => SetupPage({ searchParams: Promise.resolve({ token: provided }) });
const isNotFound = (error: unknown) => (error as { digest?: string }).digest === "NEXT_HTTP_ERROR_FALLBACK;404";
const isLoginRedirect = (error: unknown) =>
  (error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT;replace;/login;") === true;

beforeEach(() => {
  env = { SETUP_TOKEN: token };
  institutions = 0; calls = []; writes = []; transactionError = undefined;
});

for (const [name, configured] of [
  ["ausente", undefined], ["vacío", ""], ["solo espacios", " \t\n "], ["demasiado corto", "corto"],
] as const) {
  test(`setup guard: configuración ${name} rechaza cualquier entrada`, () => {
    for (const provided of [undefined, null, "", "corto", token]) {
      assert.equal(checkSetupToken(provided, { SETUP_TOKEN: configured }), "invalid");
    }
  });
  test(`setup action: configuración ${name} impide un POST directo antes de hash o transacción`, async () => {
    env = { SETUP_TOKEN: configured };
    for (const provided of [null, "", "corto", token]) assert.deepEqual(await submit(provided), unavailable);
    assert.deepEqual(calls, []);
    assert.deepEqual(writes, []);
  });
  test(`setup page: configuración ${name} oculta el formulario con 404`, async () => {
    env = { SETUP_TOKEN: configured };
    await assert.rejects(page(token), isNotFound);
    assert.deepEqual(writes, []);
  });
}

test("setup guard: exige coincidencia exacta, longitud mínima y respeta el trim de configuración existente", () => {
  assert.equal(checkSetupToken(token, { SETUP_TOKEN: token }), "valid");
  assert.equal(checkSetupToken("x".repeat(24), { SETUP_TOKEN: "x".repeat(24) }), "valid");
  assert.equal(checkSetupToken("x".repeat(23), { SETUP_TOKEN: "x".repeat(23) }), "invalid");
  assert.equal(checkSetupToken(token, { SETUP_TOKEN: ` ${token}\n` }), "valid");
  for (const provided of [undefined, null, "", `${token}x`, token.slice(1), token.toUpperCase(), ` ${token}`, `${token} `]) {
    assert.equal(checkSetupToken(provided, { SETUP_TOKEN: token }), "invalid");
  }
});

test("setup action: token ausente o inválido impide escrituras aunque los datos de alta sean válidos", async () => {
  for (const provided of [null, "", "incorrecto", token.toUpperCase(), `${token} `]) {
    assert.deepEqual(await submit(provided), unavailable);
  }
  assert.deepEqual(calls, []);
  assert.deepEqual(writes, []);
});

test("setup page: token ausente, incorrecto o repetido se rechaza con 404", async () => {
  for (const provided of [undefined, "", "incorrecto", [token], [token, "incorrecto"]]) {
    await assert.rejects(page(provided), isNotFound);
  }
  assert.deepEqual(writes, []);
});

test("setup page: token válido permite renderizar el formulario en una base vacía", async () => {
  const result = await page(token);
  assert.match(renderToStaticMarkup(result), /Crea el primer espacio de Edukana/);
  assert.equal(result.props.children.props.children[1].props.token, token);
  assert.deepEqual(calls, ["count"]);
  assert.deepEqual(writes, []);
});

test("setup action: token válido crea institución, identidad, administrador y auditoría en transacción serializable", async () => {
  const result = await submit();
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["hash", "transaction", "count", "institution", "identity", "user", "auditLog"]);
  assert.deepEqual(writes[0], {
    model: "institution", data: { name: "Institución Fixture", slug: "institucion-fixture", type: "SCHOOL" },
  });
  assert.deepEqual(writes[1], { model: "user", data: {
    identityId: "fixture-identity", institutionId: "fixture-institution", name: "Admin Fixture",
    email: "admin@example.invalid", password: "fixture-hash", role: "ADMIN", status: "ACTIVE",
  } });
  assert.deepEqual(writes[2], { model: "auditLog", data: {
    institutionId: "fixture-institution", userId: "fixture-admin", action: "FIRST_INSTITUTION_CREATED",
    entity: "Institution", entityId: "fixture-institution",
    changes: { slug: "institucion-fixture", administratorId: "fixture-admin" },
  } });
});

test("setup action: token válido conserva la validación del formulario sin escribir", async () => {
  const data = form(); data.set("adminEmail", "inválido");
  assert.equal((await createFirstInstitution({ ok: false, message: "" }, data)).ok, false);
  assert.deepEqual(calls, []);
});

test("setup action: una base ya inicializada rechaza incluso el token válido sin crear ni modificar filas", async () => {
  institutions = 2;
  assert.deepEqual(await submit(), { ok: false, message: "La puesta en marcha inicial ya fue completada." });
  assert.deepEqual(calls, ["hash", "transaction", "count"]);
  assert.deepEqual(writes, []);
  assert.equal(institutions, 2);
});

test("setup page: una base inicializada conserva la redirección a login con cualquier token o configuración", async () => {
  institutions = 1;
  for (const configured of [undefined, token]) {
    env = { SETUP_TOKEN: configured };
    for (const provided of [undefined, "incorrecto", token]) await assert.rejects(page(provided), isLoginRedirect);
  }
  assert.deepEqual(writes, []);
});

test("setup action: repetir un alta válida no vuelve a escribir", async () => {
  assert.equal((await submit()).ok, true);
  const firstWrites = [...writes];
  assert.equal((await submit()).ok, false);
  assert.deepEqual(writes, firstWrites);
});

test("setup action: conflicto serializable conserva el rechazo sin reintentar el alta", async () => {
  transactionError = new Prisma.PrismaClientKnownRequestError("fixture conflict", { code: "P2034", clientVersion: "fixture" });
  const result = await submit();
  assert.equal(result.ok, false);
  assert.match(result.message, /Otra puesta en marcha/);
  assert.deepEqual(calls, ["hash", "transaction"]);
  assert.deepEqual(writes, []);
});
