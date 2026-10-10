import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { ALERTS_IN_FIRST_STEPS, getAdminHome } from "@/server/admin-home";
import { getFirstStepsGuide } from "@/server/first-steps";
import { countPendingInvitations } from "@/server/people/invitations";
import { A, B, ensureSeed } from "./setup";

const EMPTY_SLUG = "vacia-inicio-admin";
const EXTRA_EMAIL = "extra-inicio@a.test";

async function cleanUp() {
  await db.user.deleteMany({ where: { email: EXTRA_EMAIL } });
  await db.institution.deleteMany({ where: { slug: EMPTY_SLUG } });
}

before(async () => {
  await ensureSeed();
  await cleanUp();
});
after(async () => {
  await cleanUp();
  await db.$disconnect();
});

async function directCounts(institutionId: string, now: Date) {
  const [activeStudents, activeTeachers, courses, activeEnrollments, pendingInvitations, suspendedPeople] = await Promise.all([
    db.user.count({ where: { institutionId, role: "STUDENT", status: "ACTIVE" } }),
    db.user.count({ where: { institutionId, role: "TEACHER", status: "ACTIVE" } }),
    db.course.count({ where: { institutionId } }),
    db.enrollment.count({ where: { status: "ACTIVE", course: { institutionId } } }),
    countPendingInvitations(institutionId, now),
    db.user.count({ where: { institutionId, status: "SUSPENDED" } }),
  ]);
  return { activeStudents, activeTeachers, courses, activeEnrollments, pendingInvitations, suspendedPeople };
}

test("inicio del administrador: los números de A coinciden con conteos directos", async () => {
  const now = new Date();
  const home = await getAdminHome(A.institutionId, now);
  assert.deepEqual(home.numbers, await directCounts(A.institutionId, now));
  assert.ok(home.numbers.activeStudents >= 2, "la semilla tiene estudiantes en A");
  assert.ok(home.numbers.courses >= 2, "la semilla tiene cursos en A");
  assert.equal(home.institutionName, (await db.institution.findUniqueOrThrow({ where: { id: A.institutionId } })).name);
});

test("inicio del administrador: los números de B no incluyen nada de A", async () => {
  const now = new Date();
  const homeB = await getAdminHome(B.institutionId, now);
  assert.deepEqual(homeB.numbers, await directCounts(B.institutionId, now));
  const suspendedA = (await getAdminHome(A.institutionId, now)).numbers.suspendedPeople;

  // Lo que se agrega en A mueve las cifras de A y ninguna cifra ni aviso de B.
  await db.user.create({
    data: { institutionId: A.institutionId, name: "Extra de A", email: EXTRA_EMAIL, role: "STUDENT", status: "SUSPENDED" },
  });
  assert.equal((await getAdminHome(A.institutionId, now)).numbers.suspendedPeople, suspendedA + 1);
  assert.deepEqual(await getAdminHome(B.institutionId, now), homeB);
});

test("inicio del administrador: una institución vacía devuelve ceros y avisa que falta el período", async () => {
  const empty = await db.institution.create({ data: { name: "Institución vacía", slug: EMPTY_SLUG }, select: { id: true } });
  const home = await getAdminHome(empty.id);
  assert.equal(home.institutionName, "Institución vacía");
  assert.deepEqual(home.numbers, { activeStudents: 0, activeTeachers: 0, courses: 0, activeEnrollments: 0, pendingInvitations: 0, suspendedPeople: 0 });
  assert.deepEqual(home.alerts.map((alert) => alert.id), ["period-missing"]);
  assert.ok(home.alerts[0].href.startsWith("/dashboard/"));
  assert.equal(home.hasPeriod, false, "sin período, «Crear un curso» se cambia por «Crear un período»");

  // La guía se ve y el único aviso repite un paso: mientras se vea la guía, no se muestra dos veces.
  const guide = await getFirstStepsGuide(empty.id);
  assert.equal(guide.visible, true);
  assert.ok(home.alerts.every((alert) => ALERTS_IN_FIRST_STEPS.includes(alert.id)));
});

test("primeros pasos: no reaparecen en una institución que ya funciona por una invitación pendiente", async () => {
  const withPassword = await db.user.count({ where: { institutionId: A.institutionId, role: { in: ["STUDENT", "TEACHER"] }, identity: { passwordHash: { not: null } } } });
  const before = await getFirstStepsGuide(A.institutionId);
  assert.equal(before.visible, withPassword === 0, "A tiene período, personas, curso con inscritos: solo falta que alguien entre");

  const student = await db.user.findUniqueOrThrow({ where: { id: A.student.id }, select: { identityId: true } });
  assert.ok(student.identityId);
  const identity = await db.identity.findUniqueOrThrow({ where: { id: student.identityId }, select: { passwordHash: true } });
  await db.identity.update({ where: { id: student.identityId }, data: { passwordHash: "hash-de-prueba" } });
  try {
    const guide = await getFirstStepsGuide(A.institutionId);
    assert.equal(guide.visible, false, "ya funciona: aunque falten invitaciones, la guía no vuelve");
    const pending = await countPendingInvitations(A.institutionId);
    const ids = (await getAdminHome(A.institutionId)).alerts.map((alert) => alert.id);
    assert.equal(ids.includes("invitations"), pending > 0, "las invitaciones pendientes van a «Requiere tu atención»");
  } finally {
    await db.identity.update({ where: { id: student.identityId }, data: { passwordHash: identity.passwordHash } });
  }
});

test("inicio del administrador: un curso cuyos estudiantes lo completaron no cuenta como «sin estudiantes»", async () => {
  const enrollment = await db.enrollment.findFirstOrThrow({ where: { courseId: A.courseId, studentId: A.student.id }, select: { id: true, status: true } });
  await db.enrollment.update({ where: { id: enrollment.id }, data: { status: "COMPLETED" } });
  try {
    const expected = await db.course.count({ where: { institutionId: A.institutionId, enrollments: { none: { status: { in: ["ACTIVE", "COMPLETED"] } } } } });
    const alert = (await getAdminHome(A.institutionId)).alerts.find((item) => item.id === "empty-courses");
    assert.equal(Boolean(alert), expected > 0);
    if (alert) assert.ok(alert.title.startsWith(`${expected} `));
    const course = await db.course.findFirstOrThrow({ where: { id: A.courseId }, select: { enrollments: { select: { status: true } } } });
    assert.ok(course.enrollments.some((item) => item.status === "COMPLETED"));
  } finally {
    await db.enrollment.update({ where: { id: enrollment.id }, data: { status: enrollment.status } });
  }
});

test("inicio del administrador: con el tiempo avisa del período vencido y de entregas sin calificar", async () => {
  const farFuture = new Date("2100-01-01T00:00:00Z");
  const ids = (await getAdminHome(A.institutionId, farFuture)).alerts.map((alert) => alert.id);
  const activePeriods = await db.academicPeriod.count({ where: { institutionId: A.institutionId, isActive: true } });
  assert.ok(ids.includes(activePeriods ? "period-ended" : "period-missing"));
  const submitted = await db.submission.count({ where: { status: "SUBMITTED", assignment: { course: { institutionId: A.institutionId } } } });
  assert.equal(ids.includes("stale-submissions"), submitted > 0);
});
