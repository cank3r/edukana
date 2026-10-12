import { spawn } from "node:child_process";
import { mkdirSync, createWriteStream, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join, basename } from "node:path";
import { createServer } from "node:net";
import { canonicalConfig, fixtureEnvironment, sourceMetadata } from "./canonical-mvp-config.mjs";

const stage = process.argv[2];
if (!["prepare", "test"].includes(stage) || process.env.CANONICAL_MVP_ISOLATED !== "1") {
  throw new Error("Usage in a newly owned disposable PostgreSQL container: CANONICAL_MVP_ISOLATED=1 node scripts/canonical-mvp-run.mjs prepare|test");
}
const root = process.env.CANONICAL_MVP_RUN_DIR;
if (!root || !root.startsWith("/")) throw new Error("Provide an absolute isolated CANONICAL_MVP_RUN_DIR.");
for (const part of ["private/storage", "private/mailbox", "public"]) mkdirSync(join(root, part), { recursive: true, mode: 0o700 });
const env = fixtureEnvironment(process.env, root);
const config = canonicalConfig(env);
const node = process.execPath;
const { sourceSha, sourceDirty } = sourceMetadata();

function execute(name, script, args = []) {
  console.log(`Canonical MVP: ${name}`);
  return new Promise((resolveRun, reject) => {
    const log = createWriteStream(join(config.privateDir, `${name}.log`));
    const child = spawn(node, [script, ...args], { env, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
    child.on("error", reject);
    child.on("close", (code) => {
      log.end(() => {
        if (code === 0) resolveRun();
        else reject(new Error(`${name} exited ${code}; inspect the private run log.`));
      });
    });
  });
}

async function assertEmpty(beforeMigration = false) {
  // Read-only check. Migrations are the only SQL writes made by the harness itself.
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } }, log: [] });
  try {
    if (beforeMigration) {
      const tables = await db.$queryRaw`
        SELECT count(*)::integer AS count FROM information_schema.tables
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')`;
      if (tables[0].count !== 0) throw new Error("Canonical MVP refuses an initialized database before migration; create a new container.");
      return;
    }
    const [institutions, users, identities] = await Promise.all([db.institution.count(), db.user.count(), db.identity.count()]);
    if (institutions || users || identities) throw new Error("Canonical MVP refuses a nonempty database; create a new disposable container.");
  } finally { await db.$disconnect(); }
}

function writePublicResult(outcome) {
  const report = join(config.privateDir, "results.json");
  const manifestPath = join(config.privateDir, "manifest.json");
  const completedBlocks = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, "utf8")).completedBlocks.filter((block) => [1, 2, 3, 4, 5, 6].includes(block)) : [];
  const tests = [];
  function collect(suite) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        tests.push({ title: spec.title, project: test.projectName, status: test.status,
          results: test.results?.map((result) => ({ status: result.status, duration: result.duration })) });
      }
    }
    for (const child of suite.suites ?? []) collect(child);
  }
  if (existsSync(report)) for (const suite of JSON.parse(readFileSync(report, "utf8")).suites ?? []) collect(suite);
  writeFileSync(join(config.publicDir, "summary.json"), JSON.stringify({
    sourceSha, sourceDirty, runId: basename(config.runDir), baseUrl: config.baseURL, completedAt: new Date().toISOString(),
    outcome, backend: "disposable PostgreSQL + local private storage", preparation: "UI; no seed",
    email: "captured locally; no provider delivery", preview: "not exercised", completedBlocks, tests,
  }, null, 2));
}

if (stage === "prepare") {
  await assertEmpty(true);
  await execute("migrations", "node_modules/prisma/build/index.js", ["migrate", "deploy"]);
  await assertEmpty();
  await execute("build", "node_modules/next/dist/bin/next", ["build"]);
} else {
  if (existsSync(join(config.privateDir, "results.json")) || existsSync(join(config.privateDir, "manifest.json"))) {
    throw new Error("Canonical MVP refuses reused browser evidence; provide a fresh run directory and database.");
  }
  await assertEmpty();
  await new Promise((done, reject) => {
    const probe = createServer();
    probe.once("error", () => reject(new Error("Canonical MVP refuses an occupied loopback port.")));
    probe.listen(3160, "127.0.0.1", () => probe.close(done));
  });
  const log = createWriteStream(join(config.privateDir, "server.log"));
  const server = spawn(node, ["--import", resolve("scripts/canonical-mvp-mail-preload.mjs"),
    "node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3160"], {
    env: { ...env, CANONICAL_MVP_MAIL_PRELOAD: "1" }, stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.pipe(log, { end: false }); server.stderr.pipe(log, { end: false });
  let serverError;
  server.on("error", (error) => { serverError = error; });
  const serverClosed = new Promise((done) => server.once("close", done));
  let outcome = "failed";
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (serverError) throw serverError;
      if (server.exitCode !== null) throw new Error(`Canonical Next server exited ${server.exitCode}.`);
      try { ready = (await fetch(`${config.baseURL}/login`, { signal: AbortSignal.timeout(1000) })).ok; } catch { /* startup */ }
      if (ready) break;
      await new Promise((done) => setTimeout(done, 1000));
    }
    if (!ready) throw new Error("Canonical Next server did not become ready on loopback.");
    await execute("browser", "node_modules/@playwright/test/cli.js", ["test", "--config=playwright.canonical-mvp.config.ts"]);
    outcome = "passed";
  } finally {
    if (server.exitCode === null && !serverError) {
      const timeout = setTimeout(() => server.kill("SIGKILL"), 5000);
      server.kill("SIGTERM");
      await serverClosed;
      clearTimeout(timeout);
    }
    await serverClosed;
    await new Promise((done) => log.end(done));
    writePublicResult(outcome);
  }
}
