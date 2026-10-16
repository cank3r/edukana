import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { validateDemoTarget, type ApprovedDemoTarget, type DemoTargetEnv } from "../scripts/demo/target-policy";
import { APPROVED_DEMO_TARGETS } from "../scripts/demo/approved-targets";

const password = "public-fixture-password";
const localUrl = `postgresql://demo:${password}@127.0.0.1:5544/edukana_demo_test?schema=public`;
const local = { DEMO_TARGET: "isolated-local", DATABASE_URL: localUrl, DIRECT_URL: localUrl };
const poolUrl = `postgresql://postgres.fixture:${password}@pool.example.invalid:6543/postgres?schema=public&sslmode=require`;
const directUrl = poolUrl.replace(":6543", ":5432");
const remote = { DEMO_TARGET: "isolated-preview", DEMO_TARGET_ID: "fixture-preview", DATABASE_URL: poolUrl, DIRECT_URL: directUrl };
const database = { hostname: "pool.example.invalid", port: "6543", database: "postgres", username: "postgres.fixture", schema: "public" };
const approved: ApprovedDemoTarget[] = [{
  id: "fixture-preview", environment: "isolated-preview", database, direct: { ...database, port: "5432" },
}];

function denied(env: DemoTargetEnv, entries: readonly ApprovedDemoTarget[] = approved) {
  assert.throws(() => validateDemoTarget(env, entries), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /Destino de demo no autorizado/);
    assert.doesNotMatch(error.message, /public-fixture-password|postgres(?:ql)?:\/\//);
    return true;
  });
}

for (const name of ["NODE_ENV", "VERCEL_ENV", "VERCEL_TARGET_ENV"]) {
  test(`demo target: ${name} rejects production, noncanonical and unknown labels`, () => {
    for (const value of ["production", "PRODUCTION", " production ", "production\n", "", " ", "unknown"]) {
      denied({ ...local, [name]: value });
      denied({ ...remote, [name]: value });
    }
  });
}

test("demo target: conflicting environment and target metadata fail closed", () => {
  denied({ ...remote, VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "development" });
  denied({ ...remote, VERCEL_ENV: "development", VERCEL_TARGET_ENV: "preview" });
  denied({ ...local, DEMO_TARGET_ID: "fixture-preview" });
  denied({ ...remote, DEMO_TARGET_ID: undefined });
  denied({ ...remote, DEMO_TARGET_ID: "" }, [{ ...approved[0], id: "" }]);
  denied({ ...remote, DEMO_TARGET_ID: " fixture-preview " });
  denied(remote, [approved[0], { ...approved[0], direct: database }]);
});

test("demo target: both explicit connection URLs and credentials are mandatory", () => {
  for (const env of [local, remote]) {
    for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
      for (const missing of [undefined, "", " ", "postgresql://"]) denied({ ...env, [key]: missing });
      denied({ ...env, [key]: env[key as "DATABASE_URL"].replace(`:${password}@`, "@") });
      denied({ ...env, [key]: env[key as "DATABASE_URL"].replace(password, "%ZZ") });
    }
  }
});

test("demo target: URL normalization cannot hide path traversal or encoded identities", () => {
  for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
    for (const url of [
      localUrl.replace("/edukana_demo_test", "/other/../edukana_demo_test"),
      localUrl.replace("/edukana_demo_test", "/other/%2e%2e/edukana_demo_test"),
      localUrl.replace("demo:", "%64emo:"),
      localUrl.replace(":5544", ":0"),
      localUrl + "&%68ost=production.example.invalid",
      localUrl + "&%73chema=public",
      localUrl + "&sslmode=require&sslmode=require",
      localUrl + "&options=--host%3Dproduction.example.invalid",
      localUrl.replace("127.0.0.1", "127.0.0.1.example.invalid"),
    ]) denied({ ...local, [key]: url });
  }
});

test("demo target: every identity component must match on both remote endpoints", () => {
  for (const key of ["DATABASE_URL", "DIRECT_URL"] as const) {
    for (const [before, after] of [
      ["pool.example.invalid", "other.example.invalid"], ["postgres.fixture", "postgres.otherproject"],
      [key === "DATABASE_URL" ? ":6543" : ":5432", ":5444"], ["/postgres?", "/other?"],
      ["schema=public", "schema=private"], ["&sslmode=require", ""], ["sslmode=require", "sslmode=disable"],
    ]) denied({ ...remote, [key]: remote[key].replace(before, after) });
  }
  denied({ ...remote, DATABASE_URL: directUrl, DIRECT_URL: poolUrl });
});

test("demo target: only a reviewed fixture pair passes, and safe passwords/options keep their original encoding", () => {
  const result = validateDemoTarget({ ...remote, VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "preview" }, approved);
  assert.equal(result.databaseUrl, poolUrl);
  assert.equal(result.directUrl, directUrl);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.target));
  const encoded = poolUrl.replace(password, "fixture%40%3A%2F%3F%23%25") + "&pgbouncer=true&connection_limit=1&connect_timeout=10";
  assert.equal(validateDemoTarget({ ...remote, DATABASE_URL: encoded }, approved).databaseUrl, encoded);
  for (const env of [{}, { NODE_ENV: "test" }, { NODE_ENV: "development", VERCEL_ENV: "development" }]) {
    assert.equal(validateDemoTarget({ ...local, ...env }, []).target.hostname, "127.0.0.1");
  }
});

test("demo target: the requested Preview identifiers are not silently activated or inferred from the pooler host", () => {
  // Non-secret identifiers supplied by the owner; password is a public fixture. No connection is made.
  const requested = poolUrl.replace("postgres.fixture", "postgres.qlussqleqypubgljjtwc")
    .replace("pool.example.invalid", "aws-0-us-east-1.pooler.supabase.com");
  const env = { ...remote, DEMO_TARGET_ID: "qlussqleqypubgljjtwc", DATABASE_URL: requested, DIRECT_URL: requested.replace(":6543", ":5432") };
  assert.equal(APPROVED_DEMO_TARGETS.length, 0);
  denied(env, APPROVED_DEMO_TARGETS);
  const identity = { ...database, hostname: "aws-0-us-east-1.pooler.supabase.com", username: "postgres.qlussqleqypubgljjtwc" };
  const fixtureEntry: ApprovedDemoTarget[] = [{
    id: env.DEMO_TARGET_ID, environment: "isolated-preview", database: identity, direct: { ...identity, port: "5432" },
  }];
  assert.equal(validateDemoTarget(env, fixtureEntry).target.username, identity.username);
  for (const key of ["DATABASE_URL", "DIRECT_URL"] as const) {
    denied({ ...env, [key]: env[key].replace("qlussqleqypubgljjtwc", "otherprojectfixture") }, fixtureEntry);
  }
});

const unsafe: DemoTargetEnv[] = [
  { ...local, NODE_ENV: " production " }, { ...local, VERCEL_ENV: "production " },
  { ...local, VERCEL_TARGET_ENV: "production" }, { ...local, NODE_ENV: "unknown" },
  { ...local, VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "development" },
  { ...local, DIRECT_URL: undefined }, { ...local, DIRECT_URL: "" },
  { ...local, DEMO_TARGET_ID: "leftover-preview" },
  { ...local, DATABASE_URL: localUrl.replace("/edukana_demo_test", "/other/../edukana_demo_test") },
  { ...local, DIRECT_URL: localUrl.replace(password, "") },
  { ...local, DATABASE_URL: localUrl + "&%68ost=production.example.invalid" },
  { ...local, DIRECT_URL: poolUrl }, remote,
];
for (const action of ["create", "remove", "reset"]) {
  test(`demo CLI: ${action} rejects ambiguous inputs before countdown, DB imports or writes`, () => {
    for (const candidate of unsafe) {
      const result = spawnSync(process.execPath, ["--require", "./tests/helpers/forbid-demo-db.cjs", "--import", "tsx",
        "scripts/demo/seed-demo.ts", ...(action === "remove" ? ["--remove"] : [])], {
        cwd: process.cwd(), encoding: "utf8", timeout: 10_000, windowsHide: true,
        env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, NODE_ENV: "test",
          DEMO_PASSWORD: password, DEMO_CONFIRM: action === "remove" ? "borrar-demo" : "crear-demo",
          ...(action === "reset" ? { DEMO_RESET: "1" } : {}), ...candidate },
      });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1);
      const output = result.stdout + result.stderr;
      assert.match(output, /Destino de demo no autorizado/);
      assert.doesNotMatch(output, /Empieza en|Base de datos:|PrismaClient|UNEXPECTED_DATABASE_IMPORT|public-fixture-password/);
      assert.doesNotMatch(output, /postgres(?:ql)?:\/\/|se borró|quedó cargada/);
    }
  });
}
