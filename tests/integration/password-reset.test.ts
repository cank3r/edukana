import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { MemoryEmailProvider, setEmailProviderForTests } from "@/server/integrations/email";
import { requestPasswordReset, resetPasswordWithToken } from "@/server/password-reset";
import { resolveLiveIdentity } from "@/server/session";
import { A, B, ensureSeed } from "./setup";

const mail = new MemoryEmailProvider();
const NEW_PASSWORD = "ClaveNueva2026";
let ipCounter = 0;
const nextIp = () => `172.16.0.${(ipCounter += 1)}`;
const tokenFrom = (text: string) => /\/restablecer\/([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? "";

before(async () => {
  process.env.APP_URL = "https://edukana.test";
  await ensureSeed();
  setEmailProviderForTests(mail);
});
beforeEach(async () => {
  mail.sent.length = 0;
  await db.loginAttempt.deleteMany();
});
after(async () => {
  setEmailProviderForTests(null);
  await db.passwordResetToken.deleteMany();
  await db.loginAttempt.deleteMany();
  await db.auditLog.deleteMany({ where: { action: "PASSWORD_RESET_COMPLETED" } });
  await db.user.updateMany({ where: { id: { in: [A.student.id, A.teacher.id] } }, data: { password: null, sessionVersion: 0 } });
  await db.$disconnect();
});

test("recuperación: un correo desconocido no envía nada, no crea enlaces y no falla", async () => {
  await requestPasswordReset({ email: "nadie@a.test", ip: nextIp() });
  assert.equal(mail.sent.length, 0);
  assert.equal(await db.passwordResetToken.count(), 0);
});

test("recuperación: una cuenta suspendida no recibe enlace", async () => {
  await requestPasswordReset({ email: "suspendido@a.test", ip: nextIp() });
  assert.equal(mail.sent.length, 0);
});

test("recuperación: el enlace cambia la contraseña, sirve una sola vez e invalida las sesiones abiertas", async () => {
  await requestPasswordReset({ email: "estudiante@a.test", ip: nextIp() });
  assert.equal(mail.sent.length, 1);
  assert.equal(mail.sent[0].to, "estudiante@a.test");
  assert.match(mail.sent[0].text, /^https:\/\/edukana\.test\/restablecer\//m);
  const token = tokenFrom(mail.sent[0].text);

  const stored = await db.passwordResetToken.findFirstOrThrow({ where: { userId: A.student.id } });
  assert.notEqual(stored.tokenHash, token, "el enlace no se guarda en claro");

  assert.deepEqual(await resetPasswordWithToken({ token, password: NEW_PASSWORD }), { ok: true });
  const user = await db.user.findUniqueOrThrow({ where: { id: A.student.id } });
  assert.equal(await bcrypt.compare(NEW_PASSWORD, user.password ?? ""), true);
  assert.equal(await resolveLiveIdentity({ userId: A.student.id, sessionVersion: 0 }), null);
  assert.ok(await resolveLiveIdentity({ userId: A.student.id, sessionVersion: 1 }));

  const again = await resetPasswordWithToken({ token, password: "OtraClave2026" });
  assert.equal(again.ok, false);
  assert.equal(await db.auditLog.count({ where: { action: "PASSWORD_RESET_COMPLETED", entityId: A.student.id } }), 1);
});

test("recuperación: dos usos simultáneos del mismo enlace cambian la contraseña una sola vez", async () => {
  await requestPasswordReset({ email: "docente@a.test", ip: nextIp() });
  const token = tokenFrom(mail.sent[0].text);
  const results = await Promise.all([
    resetPasswordWithToken({ token, password: "PrimeraClave2026" }),
    resetPasswordWithToken({ token, password: "SegundaClave2026" }),
  ]);
  assert.equal(results.filter((result) => result.ok).length, 1);
});

test("recuperación: un enlace vencido o inventado se rechaza con el mismo mensaje", async () => {
  await requestPasswordReset({ email: "docente@a.test", ip: nextIp() });
  const token = tokenFrom(mail.sent[0].text);
  const inTwoHours = new Date(Date.now() + 2 * 60 * 60_000);
  const expired = await resetPasswordWithToken({ token, password: NEW_PASSWORD }, inTwoHours);
  const invented = await resetPasswordWithToken({ token: "no-existe", password: NEW_PASSWORD });
  assert.equal(expired.ok, false);
  assert.deepEqual(expired, invented);
});

test("recuperación: una contraseña débil se rechaza sin consumir el enlace", async () => {
  await requestPasswordReset({ email: "docente@a.test", ip: nextIp() });
  const token = tokenFrom(mail.sent[0].text);
  const weak = await resetPasswordWithToken({ token, password: "corta1" });
  assert.equal(weak.ok, false);
  assert.equal((await resetPasswordWithToken({ token, password: NEW_PASSWORD })).ok, true);
});

test("recuperación: el mismo correo en dos instituciones recibe un enlace por cuenta y no se fusionan", async () => {
  await requestPasswordReset({ email: "compartido@prueba.test", ip: nextIp() });
  assert.equal(mail.sent.length, 2);
  assert.deepEqual(mail.sent.map((message) => message.subject).sort(), [
    "Restablece tu contraseña de Instituto A",
    "Restablece tu contraseña de Instituto B",
  ]);
  const token = tokenFrom(mail.sent.find((message) => message.subject.endsWith("Instituto A"))?.text ?? "");
  assert.equal((await resetPasswordWithToken({ token, password: NEW_PASSWORD })).ok, true);
  const [inA, inB] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: A.teacher2.id } }),
    db.user.findUniqueOrThrow({ where: { id: B.teacher2.id } }),
  ]);
  assert.ok(inA.password);
  assert.equal(inB.password, null);
  await db.user.update({ where: { id: A.teacher2.id }, data: { password: null, sessionVersion: 0 } });
});

test("recuperación: las solicitudes repetidas para un correo dejan de enviar correos al llegar al límite", async () => {
  const ip = nextIp();
  for (let i = 0; i < 8; i += 1) await requestPasswordReset({ email: "estudiante@b.test", ip });
  assert.equal(mail.sent.length, 5);
});
