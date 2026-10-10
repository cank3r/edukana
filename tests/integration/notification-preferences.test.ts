import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { db } from "@/lib/db";
import { MemoryEmailProvider, setEmailProviderForTests } from "@/server/integrations/email";
import { deliverEmails, notify, notifySafely } from "@/server/notifications";
import { getEmailPreferences, saveEmailPreferences } from "@/server/notifications/preferences";
import { A, B, ensureSeed } from "./setup";

/**
 * Preferencias de correo. Personas propias de esta prueba (np_*) en A; B solo para aislamiento.
 * Se borran al final (las preferencias caen en cascada con la persona).
 */
const S1 = "np_s1";
const S2 = "np_s2";
const T1 = "np_t1";
const USERS = [S1, S2, T1];

let mail = new MemoryEmailProvider();
const me = { id: S1, institutionId: A.institutionId };
const kindsOn = async (userId: string) =>
  (await db.notificationPreference.findMany({ where: { userId, email: true }, orderBy: { kind: "asc" } })).map((row) => row.kind);

async function cleanup() {
  await db.notification.deleteMany({ where: { userId: { in: USERS } } });
  await db.notificationPreference.deleteMany({ where: { userId: { in: USERS } } });
  await db.user.deleteMany({ where: { id: { in: USERS } } });
}

before(async () => {
  await ensureSeed();
  await cleanup();
  await db.user.createMany({
    data: [
      { id: S1, institutionId: A.institutionId, name: "Pía Preferencias", email: "np_s1@a.test", role: "STUDENT", status: "ACTIVE" },
      { id: S2, institutionId: A.institutionId, name: "Quique Preferencias", email: "np_s2@a.test", role: "STUDENT", status: "ACTIVE" },
      { id: T1, institutionId: A.institutionId, name: "Rita Docente", email: "np_t1@a.test", role: "TEACHER", status: "ACTIVE" },
    ],
  });
});

beforeEach(async () => {
  mail = new MemoryEmailProvider();
  setEmailProviderForTests(mail);
  await db.notification.deleteMany({ where: { userId: { in: USERS } } });
  await db.notificationPreference.deleteMany({ where: { userId: { in: USERS } } });
});

after(async () => {
  setEmailProviderForTests(null);
  await cleanup();
  await db.$disconnect();
});

test("sin preferencias guardadas: casillas con los valores por omisión de su rol", async () => {
  const items = await getEmailPreferences(me);
  assert.deepEqual(
    items.map((item) => [item.kind, item.email]),
    [["announcement", true], ["grade", true], ["charge", true], ["assignment", false], ["exam", false], ["live_class", false], ["certificate", false]],
  );
  assert.deepEqual((await getEmailPreferences({ id: T1, institutionId: A.institutionId })).map((item) => item.kind), ["announcement", "submission"]);
});

test("preferencia apagada: la notificación queda en la aplicación pero no se envía el correo", async () => {
  assert.deepEqual(await saveEmailPreferences(me, ["announcement", "charge"]), { ok: true, enabled: 2 });
  const outcome = await notifySafely({ institutionId: A.institutionId, userIds: [S1, S2], kind: "grade", title: "Ya tienes nota en «Ensayo»", href: "/dashboard/aula/x/tareas/y" });
  assert.equal(outcome.created, 2, "las dos reciben la notificación en la aplicación");
  assert.deepEqual(mail.sent.map((message) => message.to), ["np_s2@a.test"], "S1 apagó las notas; S2 sigue con el valor por omisión");
  assert.match(mail.sent[0].subject, /^Instituto A: Ya tienes nota en «Ensayo»$/);
  assert.match(mail.sent[0].text, /^Hola, Quique Preferencias:/);
  assert.match(mail.sent[0].text, /http:\/\/127\.0\.0\.1:3000\/dashboard\/aula\/x\/tareas\/y|Entra a Edukana/);
  assert.match(mail.sent[0].text, /\/dashboard\/notificaciones\/preferencias|Elegir qué me llega por correo/);
});

test("preferencia encendida para un tipo apagado por omisión: sí se envía", async () => {
  await saveEmailPreferences(me, ["exam"]);
  await notifySafely({ institutionId: A.institutionId, userIds: [S1, S2], kind: "exam", title: "Nuevo examen" });
  assert.deepEqual(mail.sent.map((message) => message.to), ["np_s1@a.test"]);
});

test("email: false de quien notifica gana a la preferencia; la inscripción nunca va por correo", async () => {
  await saveEmailPreferences(me, ["announcement"]);
  const big = await notify(db, { institutionId: A.institutionId, userIds: [S1], kind: "announcement", title: "Aviso masivo", email: false });
  assert.equal(big.email, null);
  const enrollment = await notify(db, { institutionId: A.institutionId, userIds: [S1], kind: "enrollment", title: "Te inscribieron" });
  assert.deepEqual(await deliverEmails(enrollment.email), { sent: 0, failed: 0, skipped: 1 });
  assert.equal(mail.sent.length, 0);
});

test("guardar es idempotente: lo no marcado queda en «no» y lo que no es de su rol se ignora", async () => {
  await saveEmailPreferences(me, ["grade", "submission", "inventado"]);
  assert.deepEqual(await kindsOn(S1), ["grade"]);
  assert.equal(await db.notificationPreference.count({ where: { userId: S1 } }), 7, "una fila por tipo de su rol");
  assert.equal(await db.notificationPreference.count({ where: { userId: S1, kind: { in: ["submission", "inventado"] } } }), 0);
  await saveEmailPreferences(me, ["grade"]);
  assert.equal(await db.notificationPreference.count({ where: { userId: S1 } }), 7, "repetir no duplica");
  await saveEmailPreferences(me, []);
  assert.deepEqual(await kindsOn(S1), []);
  assert.ok((await getEmailPreferences(me)).every((item) => !item.email));
});

test("aislamiento: cada quien cambia solo lo suyo; otra institución o una cuenta suspendida no puede", async () => {
  await saveEmailPreferences({ id: S2, institutionId: A.institutionId }, ["exam"]);
  await saveEmailPreferences(me, []);
  assert.deepEqual(await kindsOn(S2), ["exam"], "guardar las de S1 no toca las de S2");

  // El id de una persona de A con la institución de B: se rechaza y no se escribe nada.
  const crossed = await saveEmailPreferences({ id: S2, institutionId: B.institutionId }, []);
  assert.equal(crossed.ok, false);
  assert.deepEqual(await kindsOn(S2), ["exam"]);
  assert.deepEqual(await getEmailPreferences({ id: S2, institutionId: B.institutionId }), []);
  assert.equal(await db.notificationPreference.count({ where: { institutionId: B.institutionId, userId: { in: USERS } } }), 0);

  // Una persona de B no puede leer ni cambiar las de A.
  const fromB = await saveEmailPreferences({ id: S1, institutionId: B.institutionId }, ["exam"]);
  assert.equal(fromB.ok, false);
  assert.deepEqual(await kindsOn(S1), []);

  await db.user.update({ where: { id: S2 }, data: { status: "SUSPENDED" } });
  try {
    assert.equal((await saveEmailPreferences({ id: S2, institutionId: A.institutionId }, [])).ok, false);
    assert.deepEqual(await kindsOn(S2), ["exam"]);
  } finally {
    await db.user.update({ where: { id: S2 }, data: { status: "ACTIVE" } });
  }

  // Las preferencias de A no afectan a los correos de B ni al revés.
  await notifySafely({ institutionId: B.institutionId, userIds: [B.student.id], kind: "grade", title: "Nota en B" });
  assert.ok(mail.sent.every((message) => !message.to.startsWith("np_")));
  await db.notification.deleteMany({ where: { userId: B.student.id, title: "Nota en B" } });
});
