import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { validateDemoTarget, type ApprovedDemoTarget } from "../scripts/demo/target-policy";
import { APPROVED_DEMO_TARGETS } from "../scripts/demo/approved-targets";

const localUrl = "postgresql://demo:synthetic-test-value@127.0.0.1:5544/edukana_demo_test?schema=public";
const local = { DEMO_TARGET: "isolated-local", DATABASE_URL: localUrl };
const remoteUrl = "postgresql://demo.tenant:synthetic-test-value@pool.demo.invalid:6543/postgres?schema=public&sslmode=require";
const remote = { DEMO_TARGET: "isolated-preview", DEMO_TARGET_ID: "verified-fixture", DATABASE_URL: remoteUrl };
const target = { hostname: "pool.demo.invalid", port: "6543", database: "postgres", username: "demo.tenant", schema: "public" };
const approved: ApprovedDemoTarget[] = [{ id: "verified-fixture", environment: "isolated-preview", database: target, direct: target }];

test("demo target: local mode is explicit, frozen and limited to a dedicated loopback database", () => {
  const result = validateDemoTarget(local, []);
  assert.equal(result.databaseUrl, localUrl);
  assert.equal(result.directUrl, localUrl);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.target));
  for (const host of ["localhost", "[::1]"]) assert.equal(validateDemoTarget({ ...local, DATABASE_URL: localUrl.replace("127.0.0.1", host) }, []).target.hostname, host);
});

test("demo target: remote mode is closed until a reviewed allowlist entry pins both endpoints", () => {
  assert.equal(APPROVED_DEMO_TARGETS.length, 0, "no real remote database approved in this change");
  assert.throws(() => validateDemoTarget(remote, APPROVED_DEMO_TARGETS), /no autorizado/);
  assert.equal(validateDemoTarget(remote, approved).target.username, "demo.tenant");
  const direct = { ...target, hostname: "direct.demo.invalid", port: "5432" };
  const directUrl = remoteUrl.replace("pool.demo.invalid:6543", "direct.demo.invalid:5432");
  assert.equal(validateDemoTarget({ ...remote, DIRECT_URL: directUrl }, [{ ...approved[0], direct }]).directUrl, directUrl);
  assert.throws(() => validateDemoTarget({ ...remote, DIRECT_URL: directUrl }, approved), /no autorizado/);
  for (const changed of [remoteUrl.replace("demo.tenant", "demo.production"), remoteUrl.replace("schema=public", "schema=other"), remoteUrl.replace("sslmode=require", "sslmode=disable"), remoteUrl.replace(":6543", ":5432")]) {
    assert.throws(() => validateDemoTarget({ ...remote, DATABASE_URL: changed }, approved), /no autorizado/);
  }
});

test("demo target: production, implicit targets and URL routing escapes fail closed without secrets", () => {
  const cases = [
    { ...local, DEMO_TARGET: undefined }, { ...local, DATABASE_URL: localUrl.replace("127.0.0.1", "127.0.0.\t1") },
    { ...local, DATABASE_URL: localUrl + "\n" }, { ...local, NODE_ENV: "production" }, { ...remote, VERCEL_ENV: "production" },
    { ...local, DATABASE_URL: localUrl.replace("edukana_demo_test", "edukana") },
    { ...local, DATABASE_URL: localUrl.replace("127.0.0.1", "db.production.invalid") },
    { ...local, DIRECT_URL: remoteUrl }, { ...local, DATABASE_URL: remoteUrl, DIRECT_URL: localUrl },
    { ...local, DATABASE_URL: localUrl.replace("postgresql:", "https:") },
    ...["&host=production.invalid", "&hostaddr=8.8.8.8", "&options=-csearch_path=prod", "&service=prod", "&schema=other", "#fragment", "&unknown=x"].map((suffix) => ({ ...local, DATABASE_URL: localUrl + suffix })),
    { ...local, DATABASE_URL: localUrl.replace("edukana_demo_test", "edukana_demo_test%2Fother") },
    { ...local, DIRECT_URL: localUrl.replace("demo:", "other:") },
  ];
  for (const env of cases) assert.throws(() => validateDemoTarget(env, approved), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /no autorizado/);
    assert.doesNotMatch(error.message, /synthetic-test-value|postgresql:\/\//);
    return true;
  });
});

test("demo CLI: invalid create, remove and reset stop before countdown or Prisma import", () => {
  const unsafeTargets: Partial<NodeJS.ProcessEnv>[] = [{ ...remote }, { DATABASE_URL: localUrl, DEMO_TARGET: undefined }, { DATABASE_URL: remoteUrl }, { DATABASE_URL: localUrl, DIRECT_URL: remoteUrl }, { DATABASE_URL: localUrl, NODE_ENV: "production" }];
  for (const action of ["create", "remove", "reset"]) {
    for (const unsafe of unsafeTargets) {
      const result = spawnSync(process.execPath, ["--require", "./tests/helpers/forbid-demo-db.cjs", "--import", "tsx", "scripts/demo/seed-demo.ts", ...(action === "remove" ? ["--remove"] : [])], {
        cwd: process.cwd(), encoding: "utf8", timeout: 10_000,
        env: { NODE_ENV: "test", PATH: process.env.PATH, DEMO_TARGET: "isolated-local", DEMO_PASSWORD: "synthetic-test-value", DEMO_CONFIRM: action === "remove" ? "borrar-demo" : "crear-demo", ...(action === "reset" ? { DEMO_RESET: "1" } : {}), ...unsafe },
      });
      assert.equal(result.status, 1, result.stderr);
      const output = result.stdout + result.stderr;
      assert.match(output, /Destino de demo no autorizado/);
      assert.doesNotMatch(output, /Empieza en|Base de datos:|PrismaClient|UNEXPECTED_DATABASE_IMPORT|synthetic-test-value|postgresql:\/\//);
      assert.doesNotMatch(output, /se borró; las demás/);
    }
  }
});
