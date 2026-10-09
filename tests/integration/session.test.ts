import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { invalidateUserSessions, resolveLiveIdentity } from "@/server/session";
import { A, B, ensureSeed } from "./setup";

const SHARED = "compartido@prueba.test";

before(ensureSeed);
after(async () => {
  await db.user.updateMany({ where: { id: { in: [A.student2.id, A.teacher2.id] } }, data: { status: "ACTIVE" } });
  await db.user.update({ where: { id: A.student2.id }, data: { role: "STUDENT" } });
  await db.identity.updateMany({ where: { email: { in: ["estudiante2@a.test", SHARED] } }, data: { sessionVersion: 0, status: "ACTIVE" } });
  await db.$disconnect();
});

test("sesión viva: una cuenta activa obtiene rol e institución desde la base", async () => {
  const identity = await resolveLiveIdentity({ userId: A.teacher.id, sessionVersion: 0 });
  assert.equal(identity?.id, A.teacher.id);
  assert.equal(identity?.role, "TEACHER");
  assert.equal(identity?.institutionId, A.institutionId);
  assert.equal(identity?.institutionSlug, "instituto-a");
  assert.ok(identity?.identityId);
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
  assert.equal((await resolveLiveIdentity({ userId: A.student2.id, sessionVersion: 0 }))?.role, "TEACHER");
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

test("identidad: suspender a una persona en una institución no le quita el acceso a la otra", async () => {
  await db.user.update({ where: { id: A.teacher2.id }, data: { status: "SUSPENDED" } });
  assert.equal(await resolveLiveIdentity({ userId: A.teacher2.id, sessionVersion: 0 }), null);
  assert.ok(await resolveLiveIdentity({ userId: B.teacher2.id, sessionVersion: 0 }));
  await db.user.update({ where: { id: A.teacher2.id }, data: { status: "ACTIVE" } });
});

test("identidad: suspender la identidad corta el acceso en todas sus instituciones", async () => {
  await db.identity.update({ where: { email: SHARED }, data: { status: "SUSPENDED" } });
  assert.equal(await resolveLiveIdentity({ userId: A.teacher2.id, sessionVersion: 0 }), null);
  assert.equal(await resolveLiveIdentity({ userId: B.teacher2.id, sessionVersion: 0 }), null);
  await db.identity.update({ where: { email: SHARED }, data: { status: "ACTIVE" } });
});

test("identidad: un token no sirve para una membresía de otra identidad", async () => {
  const mine = await resolveLiveIdentity({ userId: A.teacher.id, sessionVersion: 0 });
  assert.ok(mine?.identityId);
  assert.equal(await resolveLiveIdentity({ userId: A.admin.id, identityId: mine.identityId, sessionVersion: 0 }), null);
});
