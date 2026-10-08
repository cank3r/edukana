import assert from "node:assert/strict";
import test from "node:test";
import {
  getPreviewProtectionHeaders,
  getPreviewProtectionHeadersForUrl,
  handlePreviewProtectionRoute,
  loadCanonicalPilotConfig,
} from "../scripts/canonical-pilot-config.mjs";

const valid = {
  PILOT_BASE_URL: "https://edukana-git-feat-real-mvp-example.vercel.app",
  PILOT_EXPECTED_HOST: "edukana-git-feat-real-mvp-example.vercel.app",
  PILOT_CONFIRM: "PREVIEW_ONLY",
  PILOT_INSTITUTION_SLUG: "colegio-piloto",
  PILOT_ADMIN_EMAIL: "admin@pilot.test",
  PILOT_TEACHER_EMAIL: "teacher@pilot.test",
  PILOT_STUDENT_EMAIL: "student@pilot.test",
  PILOT_PARENT_EMAIL: "parent@pilot.test",
  PILOT_PASSWORD: "PilotPassword123",
  KIROCREW_SCRATCH: "C:\\scratch",
};

test("acepta bootstrap con un host Preview explícito y cuatro identidades distintas", () => {
  const config = loadCanonicalPilotConfig(valid);
  assert.equal(config.mode, "bootstrap");
  assert.equal(config.baseUrl, valid.PILOT_BASE_URL);
  assert.equal(config.users.teacher.email, valid.PILOT_TEACHER_EMAIL);
  assert.equal(config.artifacts.courseCode, "PIL-101");
  assert.equal(config.adminPassword, valid.PILOT_PASSWORD);
});

test("acepta staging aditivo con administrador existente y artefactos namespaced", () => {
  const config = loadCanonicalPilotConfig({
    ...valid,
    PILOT_PASSWORD: undefined,
    PILOT_MODE: "existing",
    PILOT_RUN_ID: "s0-20261008",
    PILOT_ADMIN_PASSWORD: "ExistingAdmin123",
    PILOT_USER_PASSWORD: "NewPilotUsers123",
  });
  assert.equal(config.mode, "existing");
  assert.equal(config.runId, "s0-20261008");
  assert.equal(config.adminPassword, "ExistingAdmin123");
  assert.equal(config.userPassword, "NewPilotUsers123");
  assert.equal(config.artifacts.courseCode, "PIL-S0-20261008");
  assert.equal(config.artifacts.unitName, "Departamento Académico s0-20261008");
  assert.equal(config.users.student.name, "Estudiante Piloto s0-20261008");
});

test("rechaza modo aditivo sin run ID o contraseña administrativa", () => {
  assert.throws(
    () => loadCanonicalPilotConfig({ ...valid, PILOT_MODE: "existing", PILOT_ADMIN_PASSWORD: "ExistingAdmin123" }),
    /PILOT_RUN_ID/,
  );
  assert.throws(
    () => loadCanonicalPilotConfig({ ...valid, PILOT_MODE: "existing", PILOT_RUN_ID: "s0-20261008" }),
    /PILOT_ADMIN_PASSWORD/,
  );
  assert.throws(
    () => loadCanonicalPilotConfig({ ...valid, PILOT_MODE: "existing", PILOT_RUN_ID: "INVALID_RUN", PILOT_ADMIN_PASSWORD: "ExistingAdmin123" }),
    /PILOT_RUN_ID debe usar/,
  );
});

test("rechaza producción aunque el host sea vercel.app", () => {
  assert.throws(() => loadCanonicalPilotConfig({
    ...valid,
    PILOT_BASE_URL: "https://edukana.vercel.app",
    PILOT_EXPECTED_HOST: "edukana.vercel.app",
  }), /solo admite deployments Preview/);
});

test("rechaza un host distinto al confirmado", () => {
  assert.throws(() => loadCanonicalPilotConfig({ ...valid, PILOT_EXPECTED_HOST: "otro-git-preview.vercel.app" }), /no coincide/);
});

test("rechaza confirmación, contraseña o identidades inseguras", () => {
  assert.throws(() => loadCanonicalPilotConfig({ ...valid, PILOT_CONFIRM: "YES" }), /PREVIEW_ONLY/);
  assert.throws(() => loadCanonicalPilotConfig({ ...valid, PILOT_PASSWORD: "solo-letras" }), /al menos 10 caracteres/);
  assert.throws(() => loadCanonicalPilotConfig({ ...valid, PILOT_PARENT_EMAIL: valid.PILOT_STUDENT_EMAIL }), /válidos y distintos/);
});


test("añade bypass de Vercel solo cuando existe y rechaza inyección de cabeceras", () => {
  assert.deepEqual(getPreviewProtectionHeaders({}), {});
  assert.deepEqual(getPreviewProtectionHeaders({ VERCEL_AUTOMATION_BYPASS_SECRET: "preview-secret" }), {
    "x-vercel-protection-bypass": "preview-secret",
  });
  assert.throws(
    () => getPreviewProtectionHeaders({ VERCEL_AUTOMATION_BYPASS_SECRET: "value\r\ninjected: true" }),
    /no es válido/,
  );
});


test("limita el bypass al host Preview confirmado", () => {
  const env = { VERCEL_AUTOMATION_BYPASS_SECRET: "preview-secret" };
  assert.deepEqual(
    getPreviewProtectionHeadersForUrl(`${valid.PILOT_BASE_URL}/login`, valid.PILOT_EXPECTED_HOST, env),
    { "x-vercel-protection-bypass": "preview-secret" },
  );
  assert.deepEqual(
    getPreviewProtectionHeadersForUrl("https://example.supabase.co/storage/v1/object/sign/file", valid.PILOT_EXPECTED_HOST, env),
    {},
  );
  assert.deepEqual(
    getPreviewProtectionHeadersForUrl(`http://${valid.PILOT_EXPECTED_HOST}/login`, valid.PILOT_EXPECTED_HOST, env),
    {},
  );
});


test("corta redirecciones antes de decidir el bypass del siguiente origen", async () => {
  const env = { VERCEL_AUTOMATION_BYPASS_SECRET: "preview-secret" };
  const response = { status: () => 302 };
  let previewFetchOptions;
  let fulfilledResponse;
  let previewContinues = 0;
  const previewRoute = {
    request: () => ({
      url: () => `${valid.PILOT_BASE_URL}/redirect`,
      headers: () => ({ accept: "text/html" }),
    }),
    continue: async () => { previewContinues += 1; },
    fetch: async (options) => { previewFetchOptions = options; return response; },
    fulfill: async ({ response: value }) => { fulfilledResponse = value; },
  };

  await handlePreviewProtectionRoute(previewRoute, valid.PILOT_EXPECTED_HOST, env);
  assert.equal(previewContinues, 0);
  assert.equal(previewFetchOptions.maxRedirects, 0);
  assert.equal(previewFetchOptions.headers["x-vercel-protection-bypass"], "preview-secret");
  assert.equal(fulfilledResponse, response);

  let externalContinues = 0;
  let externalFetches = 0;
  const externalRoute = {
    request: () => ({
      url: () => "https://example.supabase.co/storage/object",
      headers: () => ({}),
    }),
    continue: async () => { externalContinues += 1; },
    fetch: async () => { externalFetches += 1; },
    fulfill: async () => { throw new Error("No debe responder por el origen externo."); },
  };

  await handlePreviewProtectionRoute(externalRoute, valid.PILOT_EXPECTED_HOST, env);
  assert.equal(externalContinues, 1);
  assert.equal(externalFetches, 0);
});