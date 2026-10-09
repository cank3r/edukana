import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { authenticateCredentials } from "@/server/login";
import { changeOwnPassword, NO_PASSWORD_YET, updateOwnProfile } from "@/server/people/self";
import { resolveLiveIdentity } from "@/server/session";
import { A, B, ensureSeed } from "./setup";

const EMAIL = "docente@a.test";
const OLD = "ClaveDeSiempre1";
const NEW = "ClaveNueva2026";
const AUDITED = ["PROFILE_UPDATED", "PASSWORD_CHANGED"];
const me = { id: A.teacher.id, institutionId: A.institutionId };
let original: { name: string; phone: string | null };

const identity = () => db.identity.findUniqueOrThrow({ where: { email: EMAIL } });

before(async () => {
  await ensureSeed();
  original = await db.user.findUniqueOrThrow({ where: { id: me.id }, select: { name: true, phone: true } });
});
beforeEach(async () => {
  await db.loginAttempt.deleteMany();
  await db.auditLog.deleteMany({ where: { action: { in: AUDITED } } });
  await db.identity.update({ where: { email: EMAIL }, data: { passwordHash: await bcrypt.hash(OLD, 4), sessionVersion: 0 } });
});
after(async () => {
  await db.user.update({ where: { id: me.id }, data: original });
  await db.identity.updateMany({ data: { passwordHash: null, sessionVersion: 0 } });
  await db.auditLog.deleteMany({ where: { action: { in: AUDITED } } });
  await db.loginAttempt.deleteMany();
  await db.$disconnect();
});

test("mis datos: guarda mi nombre y mi teléfono y deja constancia", async () => {
  assert.deepEqual(await updateOwnProfile(me, { name: "  Docente Renombrada  ", phone: " 809 555 0100 " }), { ok: true });
  const saved = await db.user.findUniqueOrThrow({ where: { id: me.id } });
  assert.equal(saved.name, "Docente Renombrada");
  assert.equal(saved.phone, "809 555 0100");
  assert.equal(saved.role, "TEACHER");
  assert.equal(await db.auditLog.count({ where: { action: "PROFILE_UPDATED", userId: me.id, entityId: me.id, institutionId: A.institutionId } }), 1);

  assert.deepEqual(await updateOwnProfile(me, { name: "Docente Renombrada", phone: "" }), { ok: true });
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: me.id } })).phone, null);
});

test("mis datos: rechaza nombre corto o teléfono largo sin guardar", async () => {
  const beforeChange = await db.user.findUniqueOrThrow({ where: { id: me.id } });
  assert.equal((await updateOwnProfile(me, { name: "Yo", phone: "" })).ok, false);
  assert.equal((await updateOwnProfile(me, { name: "Nombre Válido", phone: "1".repeat(31) })).ok, false);
  const afterChange = await db.user.findUniqueOrThrow({ where: { id: me.id } });
  assert.equal(afterChange.name, beforeChange.name);
  assert.equal(afterChange.phone, beforeChange.phone);
  assert.equal(await db.auditLog.count({ where: { action: "PROFILE_UPDATED" } }), 0);
});

test("mis datos: un id que no es de la institución de la sesión no cambia a nadie", async () => {
  const foreign = await db.user.findUniqueOrThrow({ where: { id: B.teacher.id } });
  assert.equal((await updateOwnProfile({ id: B.teacher.id, institutionId: A.institutionId }, { name: "Nombre Ajeno" })).ok, false);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: B.teacher.id } })).name, foreign.name);
  assert.equal((await changeOwnPassword({ id: B.teacher.id, institutionId: A.institutionId }, { currentPassword: OLD, newPassword: NEW })).ok, false);
});

test("contraseña: la actual incorrecta se rechaza sin cambiar nada", async () => {
  const start = await identity();
  const result = await changeOwnPassword(me, { currentPassword: "NoEsLaMia123", newPassword: NEW, ip: "10.13.0.1" });
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.message, /contraseña actual no coincide/);
  const end = await identity();
  assert.equal(end.passwordHash, start.passwordHash);
  assert.equal(end.sessionVersion, 0);
  assert.equal(await db.auditLog.count({ where: { action: "PASSWORD_CHANGED" } }), 0);
});

test("contraseña: una nueva débil o igual a la actual se rechaza sin cambiar nada", async () => {
  const start = await identity();
  for (const newPassword of ["corta1", "sololetrasmuylargas", "12345678901234", OLD]) {
    const result = await changeOwnPassword(me, { currentPassword: OLD, newPassword, ip: "10.13.0.2" });
    assert.equal(result.ok, false, newPassword);
  }
  const end = await identity();
  assert.equal(end.passwordHash, start.passwordHash);
  assert.equal(end.sessionVersion, 0);
});

test("contraseña: el cambio correcto deja entrar con la nueva y cierra la sesión anterior", async () => {
  const session = { userId: me.id, identityId: (await identity()).id, sessionVersion: 0 };
  assert.equal((await resolveLiveIdentity(session))?.id, me.id);

  assert.deepEqual(await changeOwnPassword(me, { currentPassword: OLD, newPassword: NEW, ip: "10.13.0.3" }), { ok: true });

  assert.equal(await resolveLiveIdentity(session), null);
  assert.equal((await identity()).sessionVersion, 1);
  assert.equal(await authenticateCredentials({ email: EMAIL, password: OLD, ip: "10.13.0.3" }), null);
  const login = await authenticateCredentials({ email: EMAIL, password: NEW, ip: "10.13.0.3" });
  assert.equal(login?.id, me.id);
  assert.equal(login?.sessionVersion, 1);
  assert.equal((await resolveLiveIdentity({ ...session, sessionVersion: 1 }))?.id, me.id);
  assert.equal(await db.auditLog.count({ where: { action: "PASSWORD_CHANGED", userId: me.id, institutionId: A.institutionId } }), 1);
});

test("contraseña: una cuenta que aún no tiene contraseña recibe la indicación de recuperarla", async () => {
  await db.identity.update({ where: { email: EMAIL }, data: { passwordHash: null } });
  const result = await changeOwnPassword(me, { currentPassword: "", newPassword: NEW, ip: "10.13.0.4" });
  assert.deepEqual(result, { ok: false, message: NO_PASSWORD_YET });
  assert.match(NO_PASSWORD_YET, /¿Olvidaste tu contraseña\?/);
  assert.equal((await identity()).passwordHash, null);
});

test("contraseña: tras varios intentos fallidos con la actual se pide esperar", async () => {
  for (let index = 0; index < 5; index += 1) {
    await changeOwnPassword(me, { currentPassword: `Equivocada${index}00`, newPassword: NEW, ip: "10.13.0.5" });
  }
  const result = await changeOwnPassword(me, { currentPassword: OLD, newPassword: NEW, ip: "10.13.0.5" });
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.message, /demasiados intentos/);
  assert.equal((await identity()).sessionVersion, 0);
});
