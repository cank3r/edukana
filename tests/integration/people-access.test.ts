import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { MemoryEmailProvider, setEmailProviderForTests } from "@/server/integrations/email";
import { authenticateCredentials } from "@/server/login";
import { resetPasswordWithToken } from "@/server/password-reset";
import { countPendingInvitations, sendInvitations, sendPendingInvitations } from "@/server/people/invitations";
import { setPersonStatus } from "@/server/people/status";
import { createInstitution, isPlatformOperator } from "@/server/platform/institutions";
import { resolveLiveIdentity } from "@/server/session";
import { A, B, ensureSeed } from "./setup";

const mail = new MemoryEmailProvider();
const OPERATOR = "operador@edukana.test";
const tokenFrom = (text: string) => /\/restablecer\/([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? "";
const AUDITED = ["PEOPLE_INVITED", "PERSON_SUSPENDED", "PERSON_REACTIVATED", "INSTITUTION_CREATED", "PASSWORD_RESET_COMPLETED"];

before(async () => {
  process.env.APP_URL = "https://edukana.test";
  process.env.PLATFORM_OPERATOR_EMAILS = ` ${OPERATOR.toUpperCase()} , otro@edukana.test`;
  await ensureSeed();
  setEmailProviderForTests(mail);
  await db.identity.updateMany({ data: { passwordHash: null, sessionVersion: 0 } });
});
beforeEach(async () => {
  mail.sent.length = 0;
  await db.passwordResetToken.deleteMany();
  await db.loginAttempt.deleteMany();
});
after(async () => {
  setEmailProviderForTests(null);
  delete process.env.PLATFORM_OPERATOR_EMAILS;
  await db.passwordResetToken.deleteMany();
  await db.loginAttempt.deleteMany();
  await db.auditLog.deleteMany({ where: { action: { in: AUDITED } } });
  await db.institution.deleteMany({ where: { slug: { startsWith: "nueva-" } } });
  await db.identity.deleteMany({ where: { email: "directora@nueva.test" } });
  await db.identity.updateMany({ data: { passwordHash: null, sessionVersion: 0 } });
  await db.user.updateMany({ where: { id: { in: [A.student.id, A.admin.id, A.coordinator.id] } }, data: { status: "ACTIVE" } });
  await db.user.update({ where: { id: A.coordinator.id }, data: { role: "COORDINATOR" } });
  await db.$disconnect();
});

test("invitación: quien no tiene contraseña recibe un enlace de 7 días con el que la crea y entra", async () => {
  const result = await sendInvitations(A.admin, [A.student.id]);
  assert.deepEqual(result, { sent: 1, failed: 0, skipped: 0, remaining: 0 });
  assert.equal(mail.sent[0].to, "estudiante@a.test");
  assert.match(mail.sent[0].subject, /Instituto A/);
  const token = tokenFrom(mail.sent[0].text);
  const inSixDays = new Date(Date.now() + 6 * 24 * 60 * 60_000);
  assert.deepEqual(await resetPasswordWithToken({ token, password: "ClaveNueva2026" }, inSixDays), { ok: true });
  const login = await authenticateCredentials({ email: "estudiante@a.test", password: "ClaveNueva2026", ip: "10.9.0.1" });
  assert.equal(login?.id, A.student.id);
  assert.equal(await db.auditLog.count({ where: { action: "PEOPLE_INVITED", institutionId: A.institutionId } }), 1);
});

test("invitación: el enlace vence a los 7 días", async () => {
  await sendInvitations(A.admin, [A.student2.id]);
  const inEightDays = new Date(Date.now() + 8 * 24 * 60 * 60_000);
  assert.equal((await resetPasswordWithToken({ token: tokenFrom(mail.sent[0].text), password: "ClaveNueva2026" }, inEightDays)).ok, false);
});

test("invitación: quien ya tiene contraseña recibe un aviso sin enlace y su contraseña no cambia", async () => {
  const passwordHash = await bcrypt.hash("ClaveDeSiempre1", 4);
  await db.identity.update({ where: { email: "compartido@prueba.test" }, data: { passwordHash } });
  const result = await sendInvitations(B.admin, [B.teacher2.id]);
  assert.equal(result.sent, 1);
  assert.equal(tokenFrom(mail.sent[0].text), "");
  assert.match(mail.sent[0].text, /\/login$/m);
  assert.equal(await db.passwordResetToken.count(), 0);
  assert.equal((await db.identity.findUniqueOrThrow({ where: { email: "compartido@prueba.test" } })).passwordHash, passwordHash);
});

test("invitación: no alcanza a personas de otra institución ni a suspendidas", async () => {
  const result = await sendInvitations(A.admin, [B.student.id, "a_suspended", "no-existe"]);
  assert.deepEqual(result, { sent: 0, failed: 0, skipped: 3, remaining: 0 });
  assert.equal(mail.sent.length, 0);
  assert.equal(await db.passwordResetToken.count(), 0);
});

test("invitación masiva: invita a los pendientes de la institución y repetirla no reenvía", async () => {
  const pendingB = await countPendingInvitations(B.institutionId);
  const pendingA = await countPendingInvitations(A.institutionId);
  assert.ok(pendingA >= 5);
  const first = await sendPendingInvitations(A.admin);
  assert.equal(first.sent, pendingA);
  assert.equal(first.remaining, 0);
  const emailsA = new Set((await db.user.findMany({ where: { institutionId: A.institutionId } })).map((user) => user.email));
  assert.ok(mail.sent.every((message) => emailsA.has(message.to)), "solo personas de la institución A");
  assert.ok(!mail.sent.some((message) => message.to === "suspendido@a.test"));
  const second = await sendPendingInvitations(A.admin);
  assert.equal(second.sent, 0);
  assert.equal(mail.sent.length, pendingA);
  assert.equal(await countPendingInvitations(B.institutionId), pendingB, "la otra institución no cambia");
});

test("invitación masiva: si el correo falla, lo informa y las personas siguen pendientes", async () => {
  setEmailProviderForTests({
    async send() {
      throw new Error("proveedor caído");
    },
  });
  try {
    const pending = await countPendingInvitations(B.institutionId);
    const result = await sendInvitations(B.admin, [B.student.id]);
    assert.deepEqual(result, { sent: 0, failed: 1, skipped: 0, remaining: 0 });
    assert.equal(await countPendingInvitations(B.institutionId), pending);
    assert.equal(await db.auditLog.count({ where: { action: "PEOPLE_INVITED", institutionId: B.institutionId } }), 1, "solo el aviso de la prueba anterior");
  } finally {
    setEmailProviderForTests(mail);
  }
});

test("suspender: corta la sesión abierta y el login en esa institución; reactivar los devuelve", async () => {
  const passwordHash = await bcrypt.hash("ClaveSegura2026", 4);
  await db.identity.update({ where: { email: "estudiante@a.test" }, data: { passwordHash, sessionVersion: 0 } });
  assert.ok(await resolveLiveIdentity({ userId: A.student.id, sessionVersion: 0 }));

  assert.deepEqual(await setPersonStatus(A.admin, { userId: A.student.id, status: "SUSPENDED", reason: "Baja temporal" }), { ok: true, changed: true });
  assert.equal(await resolveLiveIdentity({ userId: A.student.id, sessionVersion: 0 }), null);
  assert.equal(await authenticateCredentials({ email: "estudiante@a.test", password: "ClaveSegura2026", ip: "10.9.0.2" }), null);
  assert.equal(await db.enrollment.count({ where: { studentId: A.student.id } }), 1, "no se borra nada");

  assert.deepEqual(await setPersonStatus(A.admin, { userId: A.student.id, status: "SUSPENDED", reason: "Otra vez" }), { ok: true, changed: false });
  assert.deepEqual(await setPersonStatus(A.admin, { userId: A.student.id, status: "ACTIVE" }), { ok: true, changed: true });
  assert.ok(await resolveLiveIdentity({ userId: A.student.id, sessionVersion: 0 }));
  const log = await db.auditLog.findMany({ where: { entityId: A.student.id, action: { in: ["PERSON_SUSPENDED", "PERSON_REACTIVATED"] } } });
  assert.equal(log.length, 2);
});

test("suspender: en una institución no quita el acceso a la otra", async () => {
  assert.equal((await setPersonStatus(A.admin, { userId: A.teacher2.id, status: "SUSPENDED", reason: "Fin de contrato" })).ok, true);
  assert.equal(await resolveLiveIdentity({ userId: A.teacher2.id, sessionVersion: 0 }), null);
  assert.ok(await resolveLiveIdentity({ userId: B.teacher2.id, sessionVersion: 0 }));
  await setPersonStatus(A.admin, { userId: A.teacher2.id, status: "ACTIVE" });
});

test("suspender: reglas — motivo obligatorio, no a uno mismo, no a otra institución, no al último administrador", async () => {
  assert.equal((await setPersonStatus(A.admin, { userId: A.student.id, status: "SUSPENDED", reason: "  " })).ok, false);
  assert.equal((await setPersonStatus(A.admin, { userId: A.admin.id, status: "SUSPENDED", reason: "x" })).ok, false);
  assert.equal((await setPersonStatus(A.admin, { userId: B.student.id, status: "SUSPENDED", reason: "x" })).ok, false);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: B.student.id } })).status, "ACTIVE");

  // Un coordinador con permiso de gestionar personas no puede suspender al administrador.
  assert.equal((await setPersonStatus(A.coordinator, { userId: A.admin.id, status: "SUSPENDED", reason: "x" })).ok, false);

  // Con dos administradores, uno puede suspender al otro; el que queda ya no puede ser suspendido.
  await db.user.update({ where: { id: A.coordinator.id }, data: { role: "ADMIN" } });
  const secondAdmin = { ...A.coordinator, role: "ADMIN" as const };
  assert.equal((await setPersonStatus(secondAdmin, { userId: A.admin.id, status: "SUSPENDED", reason: "Relevo" })).ok, true);
  await db.user.update({ where: { id: A.teacher.id }, data: { role: "ADMIN", status: "SUSPENDED" } });
  const last = await setPersonStatus({ ...A.teacher, role: "ADMIN" }, { userId: A.coordinator.id, status: "SUSPENDED", reason: "x" });
  assert.deepEqual(last, { ok: false, message: "La institución no puede quedar sin un administrador activo." });
  await db.user.update({ where: { id: A.teacher.id }, data: { role: "TEACHER", status: "ACTIVE" } });
  await db.user.update({ where: { id: A.admin.id }, data: { status: "ACTIVE" } });
  await db.user.update({ where: { id: A.coordinator.id }, data: { role: "COORDINATOR" } });
});

test("operador: solo los correos de PLATFORM_OPERATOR_EMAILS; sin la variable, nadie", () => {
  assert.equal(isPlatformOperator("Operador@Edukana.test"), true);
  assert.equal(isPlatformOperator("admin@a.test"), false);
  assert.equal(isPlatformOperator(null), false);
  assert.equal(isPlatformOperator(OPERATOR, {}), false);
  assert.equal(isPlatformOperator("", { PLATFORM_OPERATOR_EMAILS: " , " }), false);
});

test("alta de institución: crea institución, administrador sin contraseña e invitación; aislada de las demás", async () => {
  const denied = await createInstitution("admin@a.test", { name: "Colegio Nuevo", slug: "nueva-uno", adminName: "Ana Directora", adminEmail: "directora@nueva.test" });
  assert.equal(denied.ok, false);
  assert.equal(await db.institution.count({ where: { slug: "nueva-uno" } }), 0);

  const result = await createInstitution(OPERATOR, { name: "Colegio Nuevo", slug: "Nueva-Uno", adminName: "Ana Directora", adminEmail: " Directora@Nueva.test " });
  assert.ok(result.ok);
  assert.equal(result.invited, true);
  const admin = await db.user.findUniqueOrThrow({ where: { id: result.adminUserId }, include: { identity: true, institution: true } });
  assert.equal(admin.institution.slug, "nueva-uno");
  assert.equal(admin.role, "ADMIN");
  assert.equal(admin.email, "directora@nueva.test");
  assert.equal(admin.identity?.passwordHash, null);
  assert.equal(await db.user.count({ where: { institutionId: result.institutionId } }), 1);

  assert.equal(mail.sent[0].to, "directora@nueva.test");
  assert.deepEqual(await resetPasswordWithToken({ token: tokenFrom(mail.sent[0].text), password: "ClaveNueva2026" }), { ok: true });
  const login = await authenticateCredentials({ email: "directora@nueva.test", password: "ClaveNueva2026", ip: "10.9.0.3" });
  assert.equal(login?.institutionId, result.institutionId);

  const repeated = await createInstitution(OPERATOR, { name: "Otro", slug: "nueva-uno", adminName: "Otra Persona", adminEmail: "otra@nueva.test" });
  assert.deepEqual(repeated, { ok: false, message: "Ese identificador ya está en uso. Elige otro." });
  assert.equal(await db.identity.count({ where: { email: "otra@nueva.test" } }), 0, "el alta fallida no deja restos");
});

test("alta de institución: un administrador que ya existe en otra conserva su contraseña y gana una segunda membresía", async () => {
  const passwordHash = await bcrypt.hash("ClaveDeSiempre1", 4);
  await db.identity.update({ where: { email: "admin@b.test" }, data: { passwordHash } });
  const result = await createInstitution(OPERATOR, { name: "Sede Dos", slug: "nueva-dos", adminName: "Admin B", adminEmail: "admin@b.test" });
  assert.ok(result.ok);
  assert.equal(tokenFrom(mail.sent[0].text), "");
  assert.equal((await db.identity.findUniqueOrThrow({ where: { email: "admin@b.test" } })).passwordHash, passwordHash);
  assert.equal(await db.user.count({ where: { identity: { email: "admin@b.test" } } }), 2);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: B.admin.id } })).institutionId, B.institutionId);
});
