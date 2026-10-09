import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { db } from "@/lib/db";
import { MemoryEmailProvider, setEmailProviderForTests } from "@/server/integrations/email";
import {
  BRAND_SWATCHES, brandCssVariables, contrastWithWhite, EDUKANA_BLUE, ensureReadableOnWhite, MIN_CONTRAST_WITH_WHITE, normalizeHexColor,
} from "@/server/platform/brand-color";
import { getInstitutionBranding, getPublicBrandingBySlug, updateBrandColor } from "@/server/platform/branding";
import { createInstitution } from "@/server/platform/institutions";
import { getInstitutionForOperator, listInstitutionsForOperator, resendAdminInvitation } from "@/server/platform/operator";
import { suggestSlug } from "@/server/platform/slug";
import { A, B, ensureSeed } from "./setup";

const mail = new MemoryEmailProvider();
const OPERATOR = "operador-m14@edukana.test";
const ADMIN_EMAIL = "directora@m14.test";
const AUDITED = ["INSTITUTION_CREATED", "PEOPLE_INVITED", "OPERATOR_INVITATION_RESENT", "INSTITUTION_BRAND_COLOR_UPDATED"];

let created: { institutionId: string; adminUserId: string };

before(async () => {
  process.env.APP_URL = "https://edukana.test";
  process.env.PLATFORM_OPERATOR_EMAILS = OPERATOR;
  await ensureSeed();
  setEmailProviderForTests(mail);
  const result = await createInstitution(OPERATOR, {
    name: "Colegio Marca M14", slug: "m14-colegio-marca", type: "SCHOOL", adminName: "Directora M14", adminEmail: ADMIN_EMAIL,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  created = { institutionId: result.institutionId, adminUserId: result.adminUserId };
});
beforeEach(() => {
  mail.sent.length = 0;
});
after(async () => {
  setEmailProviderForTests(null);
  delete process.env.PLATFORM_OPERATOR_EMAILS;
  await db.institution.updateMany({ where: { id: { in: [A.institutionId, B.institutionId] } }, data: { brandColor: null } });
  await db.auditLog.deleteMany({ where: { action: { in: AUDITED }, institutionId: { in: [A.institutionId, B.institutionId, created?.institutionId ?? ""] } } });
  await db.institution.deleteMany({ where: { slug: { startsWith: "m14-" } } });
  await db.identity.deleteMany({ where: { email: ADMIN_EMAIL } });
  await db.$disconnect();
});

test("quien no es operador no ve el panel ni puede reenviar invitaciones", async () => {
  for (const email of [null, "", "admin@a.test", "estudiante@a.test"]) {
    assert.equal(await listInstitutionsForOperator(email), null);
    assert.equal(await getInstitutionForOperator(email, A.institutionId), null);
  }
  const resend = await resendAdminInvitation("admin@a.test", created.institutionId, created.adminUserId);
  assert.equal(resend.ok, false);
  assert.equal(mail.sent.length, 0);
});

test("el listado trae todas las instituciones con sus propios conteos", async () => {
  const rows = await listInstitutionsForOperator(OPERATOR.toUpperCase());
  assert.ok(rows);
  for (const institutionId of [A.institutionId, B.institutionId]) {
    const row = rows.find((item) => item.id === institutionId);
    assert.ok(row, `falta ${institutionId}`);
    assert.equal(row.activePeople, await db.user.count({ where: { institutionId, status: "ACTIVE" } }));
    assert.equal(row.courses, await db.course.count({ where: { institutionId, archivedAt: null } }));
  }
  const fresh = rows.find((item) => item.id === created.institutionId);
  assert.deepEqual({ activePeople: fresh?.activePeople, courses: fresh?.courses, slug: fresh?.slug }, { activePeople: 1, courses: 0, slug: "m14-colegio-marca" });
  assert.deepEqual((await listInstitutionsForOperator(OPERATOR, "marca m14"))?.map((item) => item.id), [created.institutionId]);
});

test("el detalle muestra solo los administradores de esa institución y su invitación", async () => {
  const detail = await getInstitutionForOperator(OPERATOR, created.institutionId);
  assert.ok(detail);
  assert.deepEqual(detail.admins.map((admin) => [admin.email, admin.state]), [[ADMIN_EMAIL, "LINK_SENT"]]);
  assert.ok(detail.admins[0].linkExpiresAt);
  assert.equal(detail.withoutPassword, 1);
  assert.equal(detail.pendingInvitations, 0);

  const detailA = await getInstitutionForOperator(OPERATOR, A.institutionId);
  assert.ok(detailA && detailA.admins.length > 0);
  const owners = await db.user.findMany({ where: { id: { in: detailA.admins.map((admin) => admin.id) } }, select: { institutionId: true } });
  assert.ok(owners.every((owner) => owner.institutionId === A.institutionId));
  assert.equal(await getInstitutionForOperator(OPERATOR, "no-existe"), null);
});

test("reenviar la invitación usa el envío de invitaciones y solo alcanza al administrador de esa institución", async () => {
  const before = await db.passwordResetToken.count({ where: { userId: created.adminUserId } });
  const result = await resendAdminInvitation(OPERATOR, created.institutionId, created.adminUserId);
  assert.equal(result.ok, true, result.message);
  assert.equal(mail.sent.length, 1);
  assert.equal(mail.sent[0].to, ADMIN_EMAIL);
  assert.match(mail.sent[0].subject, /Tu acceso a Colegio Marca M14 en Edukana/);
  assert.match(mail.sent[0].text, /\/restablecer\//);
  assert.equal(await db.passwordResetToken.count({ where: { userId: created.adminUserId } }), before + 1);
  assert.equal(await db.auditLog.count({ where: { institutionId: created.institutionId, action: "PEOPLE_INVITED" } }), 2);
  assert.equal(await db.auditLog.count({ where: { institutionId: created.institutionId, action: "OPERATOR_INVITATION_RESENT" } }), 1);

  mail.sent.length = 0;
  assert.equal((await resendAdminInvitation(OPERATOR, B.institutionId, created.adminUserId)).ok, false);
  assert.equal((await resendAdminInvitation(OPERATOR, A.institutionId, A.teacher.id)).ok, false);
  assert.equal(mail.sent.length, 0);

  await db.identity.update({ where: { email: ADMIN_EMAIL }, data: { passwordHash: "hash-de-prueba" } });
  const already = await resendAdminInvitation(OPERATOR, created.institutionId, created.adminUserId);
  assert.equal(already.ok, false);
  assert.match(already.message, /ya creó su contraseña/);
  assert.equal(mail.sent.length, 0);
  assert.equal((await getInstitutionForOperator(OPERATOR, created.institutionId))?.admins[0].state, "HAS_PASSWORD");
  await db.identity.update({ where: { email: ADMIN_EMAIL }, data: { passwordHash: null } });
});

test("color: normaliza, valida y oscurece lo que no se lee con letras blancas", () => {
  assert.equal(normalizeHexColor("#2457f5"), "#2457F5");
  assert.equal(normalizeHexColor("abc"), "#AABBCC");
  for (const bad of ["", "azul", "#12345", "#GGGGGG", "rgb(0,0,0)", null]) assert.equal(normalizeHexColor(bad), null);
  for (const swatch of BRAND_SWATCHES) assert.ok(contrastWithWhite(swatch.value) >= MIN_CONTRAST_WITH_WHITE, swatch.label);
  assert.deepEqual(ensureReadableOnWhite(EDUKANA_BLUE).adjusted, false);
  const yellow = ensureReadableOnWhite("#FFEB3B");
  assert.equal(yellow.adjusted, true);
  assert.ok(contrastWithWhite(yellow.color) >= MIN_CONTRAST_WITH_WHITE);
  assert.notEqual(yellow.color, "#000000");
  assert.equal(ensureReadableOnWhite("#FFFFFF").adjusted, true);
  assert.deepEqual(brandCssVariables(null), { "--brand": EDUKANA_BLUE });
  assert.equal(brandCssVariables("#0F766E")["--color-blue-600"], "#0F766E");
});

test("color: solo quien administra lo cambia, en su institución, y se puede volver al de Edukana", async () => {
  assert.equal((await updateBrandColor(A.teacher, "#047857")).ok, false);
  assert.equal((await updateBrandColor(A.admin, "azul")).ok, false);

  const light = await updateBrandColor(A.admin, "#ffeb3b");
  assert.equal(light.ok, true);
  if (!light.ok) return;
  assert.equal(light.adjusted, true);
  assert.match(light.message, /oscurecimos/);
  const stored = (await getInstitutionBranding(A.institutionId))?.brandColor;
  assert.equal(stored, light.color);
  assert.ok(contrastWithWhite(String(stored)) >= MIN_CONTRAST_WITH_WHITE);
  assert.equal((await getInstitutionBranding(B.institutionId))?.brandColor ?? null, null);

  const reset = await updateBrandColor(A.admin, "");
  assert.deepEqual(reset.ok && reset.color, null);
  assert.equal((await getInstitutionBranding(A.institutionId))?.brandColor, null);
});

test("inicio de sesión con marca: identificador existente muestra su marca; uno desconocido, nada", async () => {
  await updateBrandColor(B.admin, "#6D28D9");
  assert.deepEqual(await getPublicBrandingBySlug("INSTITUTO-B"), { name: "Instituto B", logoUrl: null, brandColor: "#6D28D9", slug: "instituto-b" });
  for (const slug of ["no-existe-m14", "../instituto-b", "", null, "a"]) assert.equal(await getPublicBrandingBySlug(slug), null);
  await updateBrandColor(B.admin, "");
});

test("identificador sugerido a partir del nombre", () => {
  assert.equal(suggestSlug("Colegio San José de Calasanz"), "colegio-san-jose-de-calasanz");
  assert.equal(suggestSlug("  Academia Ñandú #1 "), "academia-nandu-1");
  assert.ok(suggestSlug("x".repeat(80)).length <= 63);
});
