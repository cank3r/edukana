import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { invalidateUserSessions, resolveLiveIdentity } from "@/server/session";
import { A, B, ensureSeed } from "./setup";

before(ensureSeed);
after(async () => {
  await db.user.update({ where: { id: A.student2.id }, data: { status: "ACTIVE", role: "STUDENT", sessionVersion: 0 } });
  await db.$disconnect();
});

test("sesión viva: una cuenta activa obtiene su identidad desde la base", async () => {
  const identity = await resolveLiveIdentity({ userId: A.teacher.id, sessionVersion: 0 });
  assert.deepEqual(identity, {
    id: A.teacher.id,
    role: "TEACHER",
    institutionId: A.institutionId,
    institutionSlug: "instituto-a",
    sessionVersion: 0,
  });
});

test("sesión viva: un token anterior a S1, sin versión, sigue siendo válido mientras la versión sea 0", async () => {
  assert.ok(await resolveLiveIdentity({ userId: A.teacher.id }));
});

test("sesión viva: una cuenta suspendida no tiene sesión aunque su token sea válido", async () => {
  assert.equal(await resolveLiveIdentity({ userId: "a_suspended", sessionVersion: 0 }), null);
});

test("sesión viva: suspender una cuenta corta el acceso en la siguiente lectura", async () => {
  assert.ok(await resolveLiveIdentity({ userId: A.student2.id, sessionVersion: 0 }));
  await db.user.update({ where: { id: A.student2.id }, data: { status: "SUSPENDED" } });
  assert.equal(await resolveLiveIdentity({ userId: A.student2.id, sessionVersion: 0 }), null);
  await db.user.update({ where: { id: A.student2.id }, data: { status: "ACTIVE" } });
});

test("sesión viva: el rol sale de la base y no del token", async () => {
  await db.user.update({ where: { id: A.student2.id }, data: { role: "TEACHER" } });
  const identity = await resolveLiveIdentity({ userId: A.student2.id, sessionVersion: 0 });
  assert.equal(identity?.role, "TEACHER");
  await db.user.update({ where: { id: A.student2.id }, data: { role: "STUDENT" } });
});

test("sesión viva: invalidar sesiones deja sin efecto los tokens anteriores y admite el nuevo", async () => {
  assert.equal(await invalidateUserSessions(db, { userId: A.student2.id, institutionId: A.institutionId }), true);
  assert.equal(await resolveLiveIdentity({ userId: A.student2.id, sessionVersion: 0 }), null);
  assert.ok(await resolveLiveIdentity({ userId: A.student2.id, sessionVersion: 1 }));
});

test("ID de otra institución: no se pueden invalidar sesiones de una cuenta ajena", async () => {
  assert.equal(await invalidateUserSessions(db, { userId: B.student.id, institutionId: A.institutionId }), false);
  assert.ok(await resolveLiveIdentity({ userId: B.student.id, sessionVersion: 0 }));
});

test("sesión viva: un identificador inexistente o vacío no tiene sesión", async () => {
  assert.equal(await resolveLiveIdentity({ userId: "no_existe", sessionVersion: 0 }), null);
  assert.equal(await resolveLiveIdentity({ userId: "", sessionVersion: 0 }), null);
});
