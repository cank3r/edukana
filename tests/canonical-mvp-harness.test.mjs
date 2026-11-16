import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalConfig, fixtureEnvironment, sourceMetadata } from "../scripts/canonical-mvp-config.mjs";
import { interceptedFetch } from "../scripts/canonical-mvp-mail-preload.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "canonical-mvp-harness-"));
  mkdirSync(join(root, "private", "storage"), { recursive: true });
  const cwd = join(root, "checkout"); mkdirSync(cwd);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, cwd, env: fixtureEnvironment({}, root) };
}

test("missing or invalid evidence metadata never claims a clean worktree", () => {
  const sourceSha = "a".repeat(40);
  assert.deepEqual(sourceMetadata({}), { sourceSha: null, sourceDirty: null });
  assert.deepEqual(sourceMetadata({ CANONICAL_MVP_SOURCE_SHA: sourceSha }), { sourceSha, sourceDirty: null });
  assert.deepEqual(sourceMetadata({ CANONICAL_MVP_SOURCE_SHA: sourceSha, CANONICAL_MVP_SOURCE_DIRTY: "0" }),
    { sourceSha, sourceDirty: false });
  assert.equal(sourceMetadata({ CANONICAL_MVP_SOURCE_DIRTY: "1" }).sourceDirty, true);
  for (const dirty of ["", "false", "no", "invalid", " 0"]) {
    assert.throws(() => sourceMetadata({ CANONICAL_MVP_SOURCE_DIRTY: dirty }), /Invalid source dirty/);
  }
  assert.throws(() => sourceMetadata({ CANONICAL_MVP_SOURCE_SHA: "abc123" }), /Invalid source SHA/);
});

test("accepts only the exact fixture and strips inherited provider/options", (t) => {
  const f = fixture(t);
  const env = fixtureEnvironment({ PATH: "safe", DATABASE_URL: "remote", RESEND_API_KEY: "real", NODE_OPTIONS: "unsafe" }, f.root);
  assert.equal(canonicalConfig(env, f.cwd).baseURL, "http://127.0.0.1:3160");
  assert.equal(env.NODE_OPTIONS, undefined); assert.equal(env.PATH, "safe");
  assert.equal(env.RESEND_API_KEY, "canonical-mail-intercept-only");
});

for (const [name, value] of [
  ["CANONICAL_MVP_ISOLATED", "0"], ["DATABASE_URL", "postgresql://canonical:canonical_fixture_only@example.test:5432/canonical_mvp"],
  ["DIRECT_URL", "postgresql://canonical:canonical_fixture_only@localhost:5432/canonical_mvp"],
  ["DATABASE_URL", "postgresql://canonical:canonical_fixture_only@127.0.0.1:5432/other"],
  ["APP_URL", "https://example.vercel.app"], ["AUTH_URL", "http://127.0.0.1:3161"],
  ["CANONICAL_MVP_BASE_URL", "http://127.0.0.1:3160@evil.test"], ["SUPABASE_URL", "https://example.test"],
  ["SUPABASE_SERVICE_ROLE_KEY", "unexpected"], ["VERCEL_AUTOMATION_BYPASS_SECRET", "unexpected"],
  ["SETUP_TOKEN", "unexpected"], ["RESEND_API_KEY", "unexpected"], ["EMAIL_FROM", "real@example.com"],
  ["CANONICAL_MVP_PRIVATE_DIR", tmpdir()], ["LOCAL_STORAGE_ROOT", tmpdir()],
]) {
  test(`refuses changed ${name}: ${value.includes("postgresql:") ? "database identity" : "unexpected fixture"}`, (t) => {
    const f = fixture(t); assert.throws(() => canonicalConfig({ ...f.env, [name]: value }, f.cwd));
  });
}

test("refuses runtime .env without reading its contents", (t) => {
  const f = fixture(t); writeFileSync(join(f.cwd, ".env.local"), "DO_NOT_READ=sentinel");
  assert.throws(() => canonicalConfig(f.env, f.cwd), /runtime .env/);
});

test("captures only synthetic invitation mail without calling the provider", async (t) => {
  const f = fixture(t); let calls = 0;
  const intercept = interceptedFetch(async () => { calls += 1; return new Response("local"); }, f.env);
  const message = { from: '"Instituto de prueba" <canonical@example.test>', to: ["teacher@example.test"], subject: "Invitación", text: "fixture" };
  const response = await intercept("https://api.resend.com/emails", {
    method: "POST", headers: { authorization: "Bearer canonical-mail-intercept-only" }, body: JSON.stringify(message),
  });
  assert.equal(response.status, 200); assert.equal(calls, 0);
  const mailbox = join(f.root, "private", "mailbox"); const files = readdirSync(mailbox);
  assert.equal(files.length, 1); assert.deepEqual(JSON.parse(readFileSync(join(mailbox, files[0]), "utf8")), message);
  await intercept("http://127.0.0.1:3160/login"); assert.equal(calls, 1);
});

test("rejects external HTTP, different email endpoint and real recipients before network", async (t) => {
  const f = fixture(t); let calls = 0;
  const intercept = interceptedFetch(async () => { calls += 1; return new Response(); }, f.env);
  for (const url of ["https://example.test", "https://api.resend.com/emails?x=1", "https://api.resend.com/emails"]) {
    await assert.rejects(() => intercept(url), /outbound HTTP/);
  }
  for (const patch of [{ to: ["person@example.com"] }, { cc: ["person@example.com"] }, { bcc: ["person@example.com"] }]) {
    await assert.rejects(() => intercept("https://api.resend.com/emails", {
      method: "POST", headers: { authorization: "Bearer canonical-mail-intercept-only" },
      body: JSON.stringify({ from: "canonical@example.test", to: ["teacher@example.test"], ...patch }),
    }), /refuses/);
  }
  assert.equal(calls, 0);
});

test("loopback fetch cannot automatically follow an external redirect", async (t) => {
  const f = fixture(t); let policy;
  const intercept = interceptedFetch(async (_input, init) => { policy = init.redirect; return new Response(); }, f.env);
  await intercept("http://127.0.0.1:3160/redirect", { redirect: "follow" });
  assert.equal(policy, "error");
});

test("preserves a local Request body without consuming it twice", async (t) => {
  const f = fixture(t);
  const intercept = interceptedFetch(async (input, init) => {
    const delegated = new Request(input, init);
    assert.equal(await delegated.text(), "local-fixture-body");
    return new Response("ok");
  }, f.env);
  const response = await intercept(new Request("http://127.0.0.1:3160/action", { method: "POST", body: "local-fixture-body" }));
  assert.equal(response.status, 200);
});
