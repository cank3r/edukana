import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { updateOperatorBrand } from "@/server/platform/operator-branding";
import { contrastWithWhite } from "@/server/platform/brand-color";
import { A, B, ensureSeed } from "./setup";

const OPERATOR = "white-label-operator@edukana.test";
const oldOperators = process.env.PLATFORM_OPERATOR_EMAILS;
const select = { id: true, logoUrl: true, domain: true, brandColor: true, settings: true } as const;
let saved: Array<{ id: string; logoUrl: string | null; domain: string | null; brandColor: string | null; settings: Prisma.JsonValue }> = [];
const prefix = "white_label_test_";
const input = { confirmation: "", brandColor: "#fff", domain: "white-label-a.example.test", hideEdukanaBrand: true };
const auditWhere = { action: "PLATFORM_BRANDING_UPDATED", changes: { path: ["operator"], equals: OPERATOR } };
before(async () => {
  await ensureSeed();
  saved = await db.institution.findMany({ where: { id: { in: [A.institutionId, B.institutionId] } }, select });
  process.env.PLATFORM_OPERATOR_EMAILS = OPERATOR;
  input.confirmation = (await db.institution.findUniqueOrThrow({ where: { id: A.institutionId } })).name;
});
beforeEach(async () => {
  await db.auditLog.deleteMany({ where: auditWhere });
  await db.storageAsset.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.institution.update({ where: { id: A.institutionId }, data: {
    logoUrl: null, domain: null, brandColor: null, settings: { keep: "yes", platform: { aiLocked: true } },
  } });
  await db.institution.update({ where: { id: B.institutionId }, data: { domain: "white-label-b.example.test" } });
});
after(async () => {
  await db.auditLog.deleteMany({ where: auditWhere });
  await db.storageAsset.deleteMany({ where: { id: { startsWith: prefix } } });
  // Clear temporary unique values before restoring both institutions.
  await db.institution.updateMany({ where: { id: { in: saved.map((row) => row.id) } }, data: { domain: null } });
  for (const { id, settings, ...data } of saved) await db.institution.update({ where: { id }, data: {
    ...data, settings: settings === null ? Prisma.JsonNull : settings,
  } });
  if (oldOperators === undefined) delete process.env.PLATFORM_OPERATOR_EMAILS;
  else process.env.PLATFORM_OPERATOR_EMAILS = oldOperators;
  await db.$disconnect();
});

test("branding PostgreSQL: institution administrator cannot change domain or create operator audit", async () => {
  assert.equal((await updateOperatorBrand("admin@a.test", A.admin.id, A.institutionId, input)).ok, false);
  assert.equal((await db.institution.findUniqueOrThrow({ where: { id: A.institutionId } })).domain, null);
  assert.equal(await db.auditLog.count({ where: { institutionId: A.institutionId, action: "PLATFORM_BRANDING_UPDATED" } }), 0);
});
test("branding PostgreSQL: operator mutation and before/after audit commit together and preserve settings", async () => {
  const other = await db.institution.findUniqueOrThrow({ where: { id: B.institutionId }, select });
  assert.equal((await updateOperatorBrand(OPERATOR, A.admin.id, A.institutionId, input)).ok, true);
  const institution = await db.institution.findUniqueOrThrow({ where: { id: A.institutionId }, select });
  assert.equal(institution.domain, input.domain); assert.ok(contrastWithWhite(institution.brandColor!) >= 4.5);
  assert.deepEqual(institution.settings, { keep: "yes", platform: { aiLocked: true, hideEdukanaBrand: true } });
  assert.deepEqual(await db.institution.findUniqueOrThrow({ where: { id: B.institutionId }, select }), other);
  const log = await db.auditLog.findFirstOrThrow({ where: auditWhere });
  const changes = log.changes as Prisma.JsonObject;
  assert.equal(changes.operator, OPERATOR);
  assert.deepEqual(changes.before, { logoUrl: null, domain: null, brandColor: null, hideEdukanaBrand: false });
  assert.deepEqual(changes.after, { logoUrl: null, domain: input.domain, brandColor: institution.brandColor, hideEdukanaBrand: true });
});
test("branding PostgreSQL: unique domain collision returns friendly message and rolls back every field", async () => {
  const before = await db.institution.findUniqueOrThrow({ where: { id: A.institutionId }, select });
  const result = await updateOperatorBrand(OPERATOR, A.admin.id, A.institutionId, { ...input, domain: "white-label-b.example.test" });
  assert.equal(result.ok, false); assert.match(result.message, /otra institución/);
  assert.deepEqual(await db.institution.findUniqueOrThrow({ where: { id: A.institutionId }, select }), before);
  assert.equal(await db.auditLog.count({ where: auditWhere }), 0);
});
test("branding PostgreSQL: foreign institution, foreign uploader and unconfirmed logo are rejected", async () => {
  const assets = [
    { id: `${prefix}foreign`, institutionId: B.institutionId, uploaderId: A.admin.id, confirmedAt: new Date() },
    { id: `${prefix}uploader`, institutionId: A.institutionId, uploaderId: B.admin.id, confirmedAt: new Date() },
    { id: `${prefix}pending`, institutionId: A.institutionId, uploaderId: A.admin.id, confirmedAt: null },
  ];
  for (const asset of assets) {
    await db.storageAsset.create({ data: { ...asset, objectPath: `${asset.institutionId}/public/logo/${asset.institutionId}/${asset.id}.png`,
      originalName: "logo.png", mimeType: "image/png", sizeBytes: 16, kind: "IMAGE", visibility: "INSTITUTION" } });
    assert.equal((await updateOperatorBrand(OPERATOR, A.admin.id, A.institutionId, { ...input, assetId: asset.id })).ok, false);
  }
  assert.equal((await db.institution.findUniqueOrThrow({ where: { id: A.institutionId } })).logoUrl, null);
  assert.equal(await db.auditLog.count({ where: auditWhere }), 0);
});
test("branding PostgreSQL: confirmed operator-uploaded target logo is stored through existing public asset route", async () => {
  const id = `${prefix}valid`;
  // Operator's account may belong to B; target logo and audit must still be scoped to A.
  await db.storageAsset.create({ data: { id, institutionId: A.institutionId, uploaderId: B.admin.id,
    objectPath: `${A.institutionId}/public/logo/${A.institutionId}/${id}.png`, confirmedAt: new Date(),
    originalName: "logo.png", mimeType: "image/png", sizeBytes: 16, kind: "IMAGE", visibility: "INSTITUTION" } });
  assert.equal((await updateOperatorBrand(OPERATOR, B.admin.id, A.institutionId, { ...input, assetId: id })).ok, true);
  assert.equal((await db.institution.findUniqueOrThrow({ where: { id: A.institutionId } })).logoUrl, `/api/public-images/${id}`);
  assert.equal(await db.auditLog.count({ where: { ...auditWhere, institutionId: A.institutionId } }), 1);
});
