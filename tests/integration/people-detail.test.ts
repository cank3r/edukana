import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { getPersonDetail } from "@/server/people/detail";
import { A, B, ensureSeed } from "./setup";

const HASH = "x".repeat(60);
let originalHash: string | null = null;

before(async () => {
  await ensureSeed();
  const identity = await db.user.findUniqueOrThrow({ where: { id: A.student2.id }, select: { identity: { select: { passwordHash: true } } } });
  originalHash = identity.identity?.passwordHash ?? null;
  await db.passwordResetToken.deleteMany({ where: { userId: A.student2.id } });
});
after(async () => {
  await db.passwordResetToken.deleteMany({ where: { userId: A.student2.id } });
  await db.identity.updateMany({ where: { users: { some: { id: A.student2.id } } }, data: { passwordHash: originalHash } });
  await db.$disconnect();
});

test("ficha: un administrador de B no ve la ficha de ninguna persona de A", async () => {
  for (const person of [A.student, A.teacher, A.parent, A.admin]) {
    assert.equal(await getPersonDetail(B.admin, person.id), null, person.id);
  }
  assert.equal(await getPersonDetail(B.teacher, A.student.id), null);
  assert.equal(await getPersonDetail(A.admin, "no-existe"), null);
});

test("ficha: estudiante con sus cursos y sus tutores; tutor con sus hijos; docente con sus cursos", async () => {
  const student = await getPersonDetail(A.admin, A.student.id);
  assert.equal(student?.person.role, "STUDENT");
  assert.ok(student?.enrollments.some((row) => row.course.id === A.courseId));
  assert.equal(student?.guardians.find((row) => row.person.id === A.parent.id)?.status, "ACTIVE");

  const parent = await getPersonDetail(A.admin, A.parent.id);
  assert.ok(parent?.children.some((row) => row.person.id === A.student.id));

  const teacher = await getPersonDetail(A.coordinator, A.teacher.id);
  assert.ok(teacher?.teaches.some((course) => course.id === A.courseId));
  assert.ok(teacher?.teaches.every((course) => course.id !== A.course2Id), "solo los cursos que enseña");
});

test("ficha: un docente solo abre a estudiantes de sus cursos y no ve sus tutores", async () => {
  const own = await getPersonDetail(A.teacher, A.student.id);
  assert.ok(own);
  assert.deepEqual(own.guardians, []);
  assert.ok(own.enrollments.some((row) => row.course.id === A.courseId));
  assert.ok(own.enrollments.every((row) => row.course.id !== A.course2Id), "solo ve sus propios cursos");
  assert.equal(await getPersonDetail(A.teacher, A.parent.id), null);
  assert.equal(await getPersonDetail(A.teacher, A.admin.id), null);
  assert.ok(await getPersonDetail(A.teacher, A.teacher.id), "su propia ficha sí");
});

test("ficha: el acceso distingue sin invitar, invitación pendiente, vencida y contraseña creada", async () => {
  await db.identity.updateMany({ where: { users: { some: { id: A.student2.id } } }, data: { passwordHash: null } });
  const now = new Date();
  assert.equal((await getPersonDetail(A.admin, A.student2.id, now))?.access, "NOT_INVITED");

  await db.passwordResetToken.create({ data: { userId: A.student2.id, tokenHash: `detalle-${Date.now()}`, expiresAt: new Date(now.getTime() + 60 * 60_000) } });
  assert.equal((await getPersonDetail(A.admin, A.student2.id, now))?.access, "INVITED");
  const later = new Date(now.getTime() + 2 * 60 * 60_000);
  assert.equal((await getPersonDetail(A.admin, A.student2.id, later))?.access, "EXPIRED");

  await db.identity.updateMany({ where: { users: { some: { id: A.student2.id } } }, data: { passwordHash: HASH } });
  assert.equal((await getPersonDetail(A.admin, A.student2.id, now))?.access, "HAS_PASSWORD");
});
