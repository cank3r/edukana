import assert from "node:assert/strict";
import test from "node:test";
import { getPreviewProtectionHeaders, loadCanonicalPilotConfig } from "../scripts/canonical-pilot-config.mjs";

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

test("acepta un host Preview explícito y cuatro identidades distintas", () => {
  const config = loadCanonicalPilotConfig(valid);
  assert.equal(config.baseUrl, valid.PILOT_BASE_URL);
  assert.equal(config.users.teacher.email, valid.PILOT_TEACHER_EMAIL);
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
