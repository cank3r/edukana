import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { findOwnMembership } from "@/server/identity";
import { authenticateCredentials } from "@/server/login";
import { MAX_FAILURES_PER_EMAIL } from "@/server/security/login-throttle";
import { A, B, ensureSeed } from "./setup";

const PASSWORD = "ClaveSegura2026";
const SHARED = "compartido@prueba.test";
let ip = 0;
const nextIp = () => `192.168.50.${(ip += 1)}`;

before(async () => {
  await ensureSeed();
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  await db.identity.updateMany({ where: { email: { in: ["docente@a.test", SHARED, "suspendido@a.test"] } }, data: { passwordHash } });
});
beforeEach(async () => {
  await db.loginAttempt.deleteMany();
});
after(async () => {
  await db.loginAttempt.deleteMany();
  await db.identity.updateMany({ data: { passwordHash: null, status: "ACTIVE" }, where: { email: { in: ["docente@a.test", SHARED, "suspendido@a.test"] } } });
  await db.user.update({ where: { id: A.teacher2.id }, data: { status: "ACTIVE" } });
  await db.$disconnect();
});

test("login: correo y contraseña correctos entran a la institución de la persona", async () => {
  const result = await authenticateCredentials({ email: " Docente@A.test ", password: PASSWORD, ip: nextIp() });
  assert.equal(result?.id, A.teacher.id);
  assert.equal(result?.institutionId, A.institutionId);
  assert.equal(result?.role, "TEACHER");
  assert.equal(result?.institutionCount, 1);
});

test("login: contraseña incorrecta, correo inexistente y cuenta sin contraseña dan el mismo resultado", async () => {
  assert.equal(await authenticateCredentials({ email: "docente@a.test", password: "otra-clave-123", ip: nextIp() }), null);
  assert.equal(await authenticateCredentials({ email: "nadie@a.test", password: PASSWORD, ip: nextIp() }), null);
  assert.equal(await authenticateCredentials({ email: "estudiante@a.test", password: PASSWORD, ip: nextIp() }), null);
});

test("login: una membresía suspendida no entra aunque la contraseña sea correcta", async () => {
  assert.equal(await authenticateCredentials({ email: "suspendido@a.test", password: PASSWORD, ip: nextIp() }), null);
});

test("login: tras el máximo de fallos, ni la contraseña correcta entra", async () => {
  const address = nextIp();
  for (let i = 0; i < MAX_FAILURES_PER_EMAIL; i += 1) {
    await authenticateCredentials({ email: "docente@a.test", password: "incorrecta-123", ip: address });
  }
  assert.equal(await authenticateCredentials({ email: "docente@a.test", password: PASSWORD, ip: address }), null);
});

test("identidad: el mismo correo en dos instituciones entra con una sola contraseña y puede elegir", async () => {
  const byDefault = await authenticateCredentials({ email: SHARED, password: PASSWORD, ip: nextIp() });
  assert.equal(byDefault?.institutionCount, 2);
  assert.equal(byDefault?.id, A.teacher2.id);
  const chosen = await authenticateCredentials({ email: SHARED, password: PASSWORD, ip: nextIp(), institutionSlug: "instituto-b" });
  assert.equal(chosen?.id, B.teacher2.id);
  assert.equal(chosen?.institutionId, B.institutionId);
  assert.equal(chosen?.identityId, byDefault?.identityId);
});

test("identidad: pedir una institución a la que no pertenece no entra", async () => {
  assert.equal(
    await authenticateCredentials({ email: "docente@a.test", password: PASSWORD, ip: nextIp(), institutionSlug: "instituto-b" }),
    null,
  );
});

test("identidad: con una membresía suspendida entra solo a la otra institución", async () => {
  await db.user.update({ where: { id: A.teacher2.id }, data: { status: "SUSPENDED" } });
  const result = await authenticateCredentials({ email: SHARED, password: PASSWORD, ip: nextIp() });
  assert.equal(result?.id, B.teacher2.id);
  assert.equal(result?.institutionCount, 1);
  await db.user.update({ where: { id: A.teacher2.id }, data: { status: "ACTIVE" } });
});

test("identidad: una identidad suspendida no entra a ninguna institución", async () => {
  await db.identity.update({ where: { email: SHARED }, data: { status: "SUSPENDED" } });
  assert.equal(await authenticateCredentials({ email: SHARED, password: PASSWORD, ip: nextIp() }), null);
  await db.identity.update({ where: { email: SHARED }, data: { status: "ACTIVE" } });
});

test("cambio de institución: solo hacia una membresía activa de la misma identidad", async () => {
  const login = await authenticateCredentials({ email: SHARED, password: PASSWORD, ip: nextIp() });
  assert.ok(login);
  assert.equal((await findOwnMembership(login.identityId, B.teacher2.id))?.institutionId, B.institutionId);
  assert.equal(await findOwnMembership(login.identityId, B.teacher.id), null, "membresía de otra persona");
  assert.equal(await findOwnMembership(login.identityId, "no_existe"), null);
});
