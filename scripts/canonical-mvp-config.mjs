import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";

export const fixtureDatabaseUrl = "postgresql://canonical:canonical_fixture_only@127.0.0.1:5432/canonical_mvp";
export const fixtureBaseUrl = "http://127.0.0.1:3160";
export const fixtureSetupToken = "canonical-mvp-local-setup-fixture-only";

export function sourceMetadata(env = process.env) {
  const sourceSha = env.CANONICAL_MVP_SOURCE_SHA ?? null;
  const dirty = env.CANONICAL_MVP_SOURCE_DIRTY;
  if (sourceSha !== null && !/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error("Invalid source SHA metadata.");
  if (dirty !== undefined && dirty !== "0" && dirty !== "1") throw new Error("Invalid source dirty metadata.");
  return { sourceSha, sourceDirty: dirty === undefined ? null : dirty === "1" };
}

function inside(root, target) {
  const part = relative(root, target);
  return part !== "" && !part.startsWith("..") && !isAbsolute(part);
}

/** This configuration has no remote mode. The launcher must own a new disposable database. */
export function canonicalConfig(env = process.env, cwd = process.cwd()) {
  if (env.CANONICAL_MVP_ISOLATED !== "1") throw new Error("Canonical MVP requires an isolated disposable environment.");
  for (const name of ["DATABASE_URL", "DIRECT_URL"]) {
    if (env[name] !== fixtureDatabaseUrl) throw new Error(`Canonical MVP refuses ${name}: expected the exact local fixture.`);
  }
  for (const name of ["APP_URL", "AUTH_URL", "CANONICAL_MVP_BASE_URL"]) {
    if (env[name] !== fixtureBaseUrl) throw new Error(`Canonical MVP refuses ${name}: expected the exact loopback origin.`);
  }
  for (const name of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "VERCEL_AUTOMATION_BYPASS_SECRET", "PILOT_BYPASS_SECRET"]) {
    if (env[name]) throw new Error(`Canonical MVP refuses provider configuration: ${name}.`);
  }
  for (const name of [".env", ".env.local", ".env.production", ".env.production.local", ".env.test", ".env.test.local"]) {
    if (existsSync(join(cwd, name))) throw new Error("Canonical MVP refuses a checkout containing runtime .env files.");
  }
  const root = env.CANONICAL_MVP_RUN_DIR;
  if (!root || !isAbsolute(root) || !existsSync(root)) throw new Error("Canonical MVP requires an existing absolute run directory.");
  const runDir = realpathSync(root);
  const privateDir = env.CANONICAL_MVP_PRIVATE_DIR;
  const storageDir = env.LOCAL_STORAGE_ROOT;
  if (!privateDir || !storageDir || !isAbsolute(privateDir) || !isAbsolute(storageDir)) {
    throw new Error("Canonical MVP requires absolute private and storage directories.");
  }
  for (const directory of [privateDir, storageDir]) {
    if (!existsSync(directory) || !inside(runDir, realpathSync(directory))) {
      throw new Error("Canonical MVP private data must remain inside its owned run directory.");
    }
  }
  if (env.SETUP_TOKEN !== fixtureSetupToken || env.RESEND_API_KEY !== "canonical-mail-intercept-only") {
    throw new Error("Canonical MVP refuses non-fixture setup or email configuration.");
  }
  if (env.EMAIL_FROM !== "canonical@example.test") throw new Error("Canonical MVP refuses a real sender.");
  return { baseURL: fixtureBaseUrl, runDir, privateDir, storageDir, publicDir: join(runDir, "public") };
}

/** Do not inherit .env, provider keys, NODE_OPTIONS, auth, proxy or cloud credentials. */
export function fixtureEnvironment(parent, runDir) {
  const env = {};
  for (const name of ["PATH", "Path", "SystemRoot", "ComSpec", "TEMP", "TMP", "TMPDIR", "HOME", "USERPROFILE", "LANG", "PLAYWRIGHT_BROWSERS_PATH"]) {
    if (parent[name]) env[name] = parent[name];
  }
  return {
    ...env,
    CI: "true", NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
    DATABASE_URL: fixtureDatabaseUrl, DIRECT_URL: fixtureDatabaseUrl,
    APP_URL: fixtureBaseUrl, AUTH_URL: fixtureBaseUrl, AUTH_TRUST_HOST: "true",
    AUTH_SECRET: "canonical-local-auth-fixture-at-least-32-characters",
    CERTIFICATE_SECRET: "canonical-local-certificate-fixture-at-least-32-characters",
    SETUP_TOKEN: fixtureSetupToken,
    LOCAL_STORAGE_SECRET: "canonical-local-storage-fixture-at-least-32-characters",
    LOCAL_STORAGE_ROOT: join(runDir, "private", "storage"),
    RESEND_API_KEY: "canonical-mail-intercept-only", EMAIL_FROM: "canonical@example.test",
    CANONICAL_MVP_ISOLATED: "1", CANONICAL_MVP_BASE_URL: fixtureBaseUrl,
    CANONICAL_MVP_RUN_DIR: runDir, CANONICAL_MVP_PRIVATE_DIR: join(runDir, "private"),
  };
}
