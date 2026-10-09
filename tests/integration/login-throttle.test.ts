import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import {
  clientIpFromHeaders,
  isAttemptAllowed,
  MAX_FAILURES_PER_EMAIL,
  MAX_FAILURES_PER_IP,
  recordAttempt,
} from "@/server/security/login-throttle";
import { ensureSeed } from "./setup";

before(async () => {
  await ensureSeed();
  await db.loginAttempt.deleteMany();
});
after(async () => {
  await db.loginAttempt.deleteMany();
  await db.$disconnect();
});

test("límite por correo: el intento siguiente al máximo de fallos se rechaza", async () => {
  const subject = { email: "victima@a.test", ip: "10.0.0.1" };
  for (let i = 0; i < MAX_FAILURES_PER_EMAIL; i += 1) {
    assert.equal(await isAttemptAllowed(subject), true);
    await recordAttempt(subject, false);
  }
  assert.equal(await isAttemptAllowed(subject), false);
});

test("límite por correo: no afecta a otro correo ni depende de mayúsculas o espacios", async () => {
  assert.equal(await isAttemptAllowed({ email: "otra@a.test", ip: "10.0.0.2" }), true);
  assert.equal(await isAttemptAllowed({ email: "  VICTIMA@a.test ", ip: "10.0.0.3" }), false);
});

test("límite por correo: los fallos fuera de la ventana de 15 minutos ya no cuentan", async () => {
  const later = new Date(Date.now() + 16 * 60_000);
  assert.equal(await isAttemptAllowed({ email: "victima@a.test", ip: "10.0.0.1" }, later), true);
});

test("límite por correo: un ingreso correcto no cuenta como fallo", async () => {
  const subject = { email: "buena@a.test", ip: "10.0.0.4" };
  for (let i = 0; i < MAX_FAILURES_PER_EMAIL + 2; i += 1) await recordAttempt(subject, true);
  assert.equal(await isAttemptAllowed(subject), true);
});

test("límite por IP: muchos correos distintos desde una IP terminan bloqueando esa IP", async () => {
  const ip = "10.9.9.9";
  for (let i = 0; i < MAX_FAILURES_PER_IP; i += 1) await recordAttempt({ email: `rociado${i}@a.test`, ip }, false);
  assert.equal(await isAttemptAllowed({ email: "nuevo@a.test", ip }), false);
  assert.equal(await isAttemptAllowed({ email: "nuevo@a.test", ip: "10.9.9.10" }), true);
});

test("los límites de login y de recuperación se cuentan por separado", async () => {
  assert.equal(await isAttemptAllowed({ email: "victima@a.test", ip: "10.0.0.1", kind: "reset" }), true);
});

test("la tabla no guarda correos ni IP en claro", async () => {
  const rows = await db.loginAttempt.findMany({ take: 50 });
  assert.ok(rows.length > 0);
  for (const row of rows) {
    assert.match(row.emailHash, /^[0-9a-f]{64}$/);
    assert.match(row.ipHash, /^[0-9a-f]{64}$/);
  }
});

test("IP del cliente: toma el primer valor de x-forwarded-for", () => {
  assert.equal(clientIpFromHeaders(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })), "203.0.113.7");
  assert.equal(clientIpFromHeaders(new Headers()), "unknown");
  assert.equal(clientIpFromHeaders(undefined), "unknown");
});
