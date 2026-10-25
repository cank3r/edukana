import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { getAdminHome } from "@/server/admin-home";
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
});

test("inicio del administrador: con el tiempo avisa del período vencido y de entregas sin calificar", async () => {
  const farFuture = new Date("2100-01-01T00:00:00Z");
  const ids = (await getAdminHome(A.institutionId, farFuture)).alerts.map((alert) => alert.id);
  const activePeriods = await db.academicPeriod.count({ where: { institutionId: A.institutionId, isActive: true } });
  assert.ok(ids.includes(activePeriods ? "period-ended" : "period-missing"));
  const submitted = await db.submission.count({ where: { status: "SUBMITTED", assignment: { course: { institutionId: A.institutionId } } } });
  assert.equal(ids.includes("stale-submissions"), submitted > 0);
});
