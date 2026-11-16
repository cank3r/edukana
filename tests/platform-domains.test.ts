import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { afterEach, test } from "node:test";
import {
  normalizeInstitutionDomain, validateInstitutionDomain, requestHostname, requestOrigin, institutionBaseUrl, sanitizeHostHeaders,
} from "@/server/platform/domain-policy";
const require = createRequire(import.meta.url);
const { loadWithStubs } = require("./helpers/load-with-stubs.cjs");
const originalEnv = { ...process.env };
afterEach(() => { process.env = { ...originalEnv }; });

test("domains: strict canonical hostnames reject schemes, paths, credentials, ports and malformed names", () => {
  assert.equal(normalizeInstitutionDomain(" School.Example.com "), "school.example.com");
  assert.equal(normalizeInstitutionDomain(""), null);
  for (const input of ["https://school.test", "school.test/", "school.test:443", "u@school.test", "a..test", "-a.test",
    "a-.test", "a.test.", "a.test?x=1", "a.test#x", "127.0.0.1", "localhost", "a.localhost", "a_1.test", {}, "a".repeat(64) + ".test"]) {
    assert.throws(() => normalizeInstitutionDomain(input), String(input));
  }
  assert.equal(requestHostname("School.test:443"), "school.test");
  assert.equal(requestHostname("School.test.:443"), "school.test");
  assert.equal(requestOrigin("School.test.:443"), "https://school.test");
  for (const host of ["school.test,evil.test", "school.test:65536", "school.test:0", "https://school.test", "school.test "]) {
    assert.equal(requestHostname(host), null);
  }
});

test("domains: central hosts and root subdomains cannot be assigned to a different institution", () => {
  process.env.PLATFORM_ROOT_DOMAIN = "edukana.test";
  process.env.APP_URL = "https://app.edukana.test";
  assert.equal(validateInstitutionDomain("a.edukana.test", "a"), "a.edukana.test");
  for (const host of ["edukana.test", "b.edukana.test", "app.edukana.test", "nested.a.edukana.test"]) {
    assert.throws(() => validateInstitutionDomain(host, "a"));
  }
  delete process.env.PLATFORM_ROOT_DOMAIN;
  assert.throws(() => validateInstitutionDomain("app.edukana.test", "a"));
});

test("domains: canonical links use validated stored domain, root slug, then configured origin", () => {
  process.env.PLATFORM_ROOT_DOMAIN = "edukana.test";
  process.env.APP_URL = "https://app.edukana.test/";
  assert.equal(institutionBaseUrl({ domain: "School.Example.com", slug: "a" }), "https://school.example.com");
  assert.equal(institutionBaseUrl({ domain: null, slug: "a" }), "https://a.edukana.test");
  assert.equal(institutionBaseUrl({}), "https://app.edukana.test");
  assert.throws(() => institutionBaseUrl({ domain: "https://evil.test/path" }));
  process.env.APP_URL = "https://user:secret@evil.test";
  assert.throws(() => institutionBaseUrl({}));
});

test("domains: spoofed tenant/forwarded headers are replaced before Auth.js and downstream", () => {
  const result = sanitizeHostHeaders(new Headers({ host: "a.test", "x-forwarded-host": "b.test",
    "x-forwarded-proto": "http", forwarded: "host=b.test", "x-institution-id": "b", "x-tenant-slug": "b" }));
  assert.equal(result.get("host"), "a.test");
  assert.equal(result.get("x-forwarded-host"), "a.test");
  assert.equal(result.get("x-forwarded-proto"), "https");
  assert.equal(result.get("forwarded"), null);
  assert.equal(result.get("x-institution-id"), null);
  assert.equal(result.get("x-tenant-slug"), null);
  assert.equal(sanitizeHostHeaders(new Headers({ host: "localhost:3100" }), "http:").get("x-forwarded-proto"), "http");
});

const institution = (id: string, domain: string) => ({ id, slug: id, domain, name: id, logoUrl: null, brandColor: null, settings: {} });
let calls: Array<{ where: { slug?: string; domain?: string } }> = [];
let records = [institution("a", "a.test"), institution("b", "b.test")];
let requestHeaders = new Headers();
const domains: typeof import("@/server/platform/domains") = loadWithStubs("src/server/platform/domains.ts", {
  "react": { cache: (fn: unknown) => fn },
  "next/headers": { headers: async () => requestHeaders },
  "@/lib/db": { db: { institution: { findUnique: async (query: { where: { slug?: string; domain?: string } }) => {
    calls.push(query);
    return records.find((row) => query.where.slug ? row.slug === query.where.slug : row.domain === query.where.domain) ?? null;
  } } } },
});

test("domains: resolver handles exact, slug, unknown and reserved roots without tenant header trust", async () => {
  process.env.PLATFORM_ROOT_DOMAIN = "edukana.test";
  process.env.APP_URL = "https://app.edukana.test";
  domains.invalidateInstitutionHostCache(); calls = [];
  assert.equal((await domains.resolveInstitutionHost("A.test:443"))?.id, "a");
  assert.equal((await domains.resolveInstitutionHost("A.test.:443"))?.id, "a");
  await assert.rejects(domains.resolveInstitutionHost("a.test,evil.test"), /Invalid request host/);
  assert.equal((await domains.resolveInstitutionHost("b.edukana.test"))?.id, "b");
  assert.equal(await domains.resolveInstitutionHost("unknown.test"), null);
  assert.equal(await domains.resolveInstitutionHost("app.edukana.test"), null);
  assert.equal(await domains.resolveInstitutionHost("edukana.test"), null);
  assert.equal(calls.length, 3);
  requestHeaders = new Headers({ host: "a.test", "x-institution-id": "b", "x-forwarded-host": "b.test" });
  assert.equal((await domains.getRequestInstitution())?.id, "a");
  records.push(institution("malicious", "b.edukana.test"));
  assert.equal((await domains.resolveInstitutionHost("b.edukana.test", { fresh: true }))?.id, "b");
  records = records.filter((row) => row.id !== "malicious");
});

test("domains: bounded cache, expiry, explicit invalidation and fresh security lookup", async () => {
  delete process.env.PLATFORM_ROOT_DOMAIN;
  domains.invalidateInstitutionHostCache(); calls = [];
  await domains.resolveInstitutionHost("a.test"); await domains.resolveInstitutionHost("a.test");
  assert.equal(calls.length, 1);
  records[0].domain = "changed.test";
  requestHeaders = new Headers({ host: "a.test" });
  assert.equal(await domains.getRequestInstitution(), null, "security bypasses stale cached domain");
  records[0].domain = "a.test";
  domains.invalidateInstitutionHostCache();
  await domains.resolveInstitutionHost("a.test");
  assert.equal(calls.length, 3);
  for (let index = 0; index < 256; index++) await domains.resolveInstitutionHost(`x${index}.test`);
  const count = calls.length;
  await domains.resolveInstitutionHost("a.test");
  assert.equal(calls.length, count + 1, "oldest entry evicted at bounded capacity");
  const now = Date.now;
  try {
    Date.now = () => now() + 16_000;
    await domains.resolveInstitutionHost("a.test");
    assert.equal(calls.length, count + 2);
  } finally { Date.now = now; }
});
