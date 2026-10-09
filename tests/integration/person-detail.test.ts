import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { getPersonDetail } from "@/server/people/detail";
import { A, B, ensureSeed } from "./setup";

before(async () => {
  await ensureSeed();
});
after(async () => {
  await db.$disconnect();
});

test("ficha de persona: cualquier rol tiene ficha con su acceso y sus vínculos", async () => {
  const teacher = await getPersonDetail(A.institutionId, A.teacher.id);
  assert.ok(teacher);
  assert.equal(teacher.role, "TEACHER");
  assert.ok(teacher.taughtCourses.some((course) => course.id === A.courseId), "muestra los cursos que enseña");
  assert.equal(
    teacher.taughtCourses.find((course) => course.id === A.courseId)?.students,
    await db.enrollment.count({ where: { courseId: A.courseId, status: { in: ["ACTIVE", "COMPLETED"] } } }),
  );

  const student = await getPersonDetail(A.institutionId, A.student.id);
  assert.ok(student?.enrollments.some((enrollment) => enrollment.course.id === A.courseId), "muestra los cursos en los que está inscrito");

  const parent = await getPersonDetail(A.institutionId, A.parent.id);
  assert.deepEqual(parent?.children.map((link) => link.student.id), [A.student.id], "el tutor muestra a su hijo vinculado");

  const identity = await db.user.findUniqueOrThrow({ where: { id: A.parent.id }, select: { identity: { select: { passwordHash: true } } } });
  if (identity.identity?.passwordHash) assert.equal(parent?.access, "ready");
  else assert.ok(parent && ["invited", "pending"].includes(parent.access));
  assert.equal(JSON.stringify(parent).includes("passwordHash"), false, "nunca entrega la contraseña cifrada");
});

test("ficha de persona: otra institución no la ve", async () => {
  assert.equal(await getPersonDetail(B.institutionId, A.teacher.id), null);
  assert.equal(await getPersonDetail(A.institutionId, B.student.id), null);
});
