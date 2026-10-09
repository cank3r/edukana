import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { zonedDateKey } from "@/lib/timezone";
import { authenticateCredentials } from "@/server/login";
import { createPerson } from "@/server/people/create";
import { DEMO_EMAIL_DOMAIN, GUARDIANS, STUDENTS } from "../../scripts/demo/content";
import { createDemo, DEMO_SLUG, findDemoInstitution, removeDemo } from "../../scripts/demo/demo-seed";
import { A, B, ensureSeed } from "./setup";

const PASSWORD = "DemoPrueba2026";
const DEMO_DOMAIN = { endsWith: `@${DEMO_EMAIL_DOMAIN}` };
const SHARED_EMAIL = `ana.reyes@${DEMO_EMAIL_DOMAIN}`;
const hadCertificateSecret = "CERTIFICATE_SECRET" in process.env;
let demoId = "";
let sharedUserId = "";

/** Lo que tienen las instituciones A y B. Debe quedar igual después de crear y quitar la demostración. */
async function snapshotAB() {
  const ids = [A.institutionId, B.institutionId];
  const scope = { institutionId: { in: ids } };
  const [institutions, users, courses, enrollments, announcements, guardianships, periods, charges, audits, identities] = await Promise.all([
    db.institution.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, slug: true, updatedAt: true }, orderBy: { id: "asc" } }),
    db.user.findMany({ where: scope, select: { id: true, email: true, role: true, status: true, identityId: true, updatedAt: true }, orderBy: { id: "asc" } }),
    db.course.findMany({ where: scope, select: { id: true, name: true, updatedAt: true }, orderBy: { id: "asc" } }),
    db.enrollment.count({ where: { course: scope } }),
    db.announcement.count({ where: scope }),
    db.guardianship.count({ where: scope }),
    db.academicPeriod.count({ where: scope }),
    db.paymentConcept.count({ where: scope }),
    db.auditLog.count({ where: scope }),
    db.identity.findMany({ where: { NOT: { email: DEMO_DOMAIN } }, select: { id: true, email: true, passwordHash: true }, orderBy: { id: "asc" } }),
  ]);
  return { institutions, users, courses, enrollments, announcements, guardianships, periods, charges, audits, identities };
}

let before_: Awaited<ReturnType<typeof snapshotAB>>;

before(async () => {
  await ensureSeed();
  // CI ya trae la clave; si se corre a mano sin ella, se pone una para poder emitir los certificados.
  if (!hadCertificateSecret) process.env.CERTIFICATE_SECRET = "demo-seed-test-secret-at-least-32-characters";
  await removeDemo();
  before_ = await snapshotAB();
});

after(async () => {
  await removeDemo();
  await db.user.deleteMany({ where: { institutionId: A.institutionId, email: SHARED_EMAIL } });
  await db.identity.deleteMany({ where: { email: SHARED_EMAIL, users: { none: {} } } });
  if (sharedUserId) await db.auditLog.deleteMany({ where: { institutionId: A.institutionId, action: "PERSON_CREATED", entityId: sharedUserId } });
  await db.loginAttempt.deleteMany();
  if (!hadCertificateSecret) delete process.env.CERTIFICATE_SECRET;
});

test("demo: crea una institución completa, coherente y con datos realistas", async () => {
  const result = await createDemo({ password: PASSWORD });
  assert.equal(result.created, true);
  demoId = result.institutionId;
  const institution = await db.institution.findUniqueOrThrow({ where: { id: demoId } });
  assert.equal(institution.slug, DEMO_SLUG);
  assert.equal(institution.name, "Instituto Técnico Demo");

  const scope = { institutionId: demoId };
  const roles = await db.user.groupBy({ by: ["role"], where: scope, _count: { _all: true } });
  const byRole = Object.fromEntries(roles.map((row) => [row.role, row._count._all]));
  assert.deepEqual(byRole, { ADMIN: 1, COORDINATOR: 1, TEACHER: 4, STUDENT: 40, PARENT: 6 });

  // Todas las cuentas entran con la contraseña de demostración.
  assert.equal(await db.identity.count({ where: { email: DEMO_DOMAIN, passwordHash: null } }), 0);
  for (const email of [`directora@${DEMO_EMAIL_DOMAIN}`, `rosa.almonte@${DEMO_EMAIL_DOMAIN}`, STUDENTS[0].email, GUARDIANS[0].email]) {
    const login = await authenticateCredentials({ email, password: PASSWORD, ip: "10.77.0.1", institutionSlug: DEMO_SLUG });
    assert.equal(login?.institutionId, demoId, `entra ${email}`);
  }

  const periods = await db.academicPeriod.findMany({ where: scope, select: { isActive: true } });
  assert.equal(periods.length, 2);
  assert.equal(periods.filter((period) => period.isActive).length, 1);

  const courses = await db.course.findMany({ where: scope, select: { id: true, code: true, isPublished: true, isPublic: true, priceCents: true } });
  assert.equal(courses.length, 7);
  assert.ok(courses.every((course) => course.isPublished));
  const catalog = courses.filter((course) => course.isPublic);
  assert.deepEqual(catalog.map((course) => course.code).sort(), ["ENF-103", "EXC-100"]);
  assert.ok(catalog.every((course) => (course.priceCents ?? 0) > 0));

  for (const course of courses) {
    const chapters = await db.courseSection.count({ where: { courseId: course.id } });
    const lessons = await db.lesson.count({ where: { courseId: course.id } });
    assert.ok(chapters >= 3 && chapters <= 4, `${course.code}: capítulos`);
    assert.ok(lessons >= chapters * 3, `${course.code}: lecciones`);
    assert.equal(await db.assignment.count({ where: { courseId: course.id, isPublished: true } }), 2, `${course.code}: tareas`);
    const exam = await db.exam.findFirstOrThrow({ where: { courseId: course.id }, select: { isPublished: true, _count: { select: { questions: true } } } });
    assert.ok(exam.isPublished && exam._count.questions >= 6 && exam._count.questions <= 8, `${course.code}: examen`);
  }
  assert.ok(await db.lesson.count({ where: { ...scope, type: "VIDEO", content: { startsWith: "https://www.youtube.com/" } } }) >= 5);
  assert.ok(await db.lesson.count({ where: { ...scope, isPublished: false } }) >= 1, "hay al menos una lección en borrador");

  const programs = await db.program.findMany({ where: scope, select: { name: true, _count: { select: { courses: true } } } });
  assert.deepEqual(programs.map((program) => [program.name, program._count.courses]).sort(), [["Técnico en Contabilidad", 3], ["Técnico en Enfermería", 3]]);
  const groups = await db.studentGroup.findMany({ where: scope, select: { name: true, _count: { select: { members: true } } } });
  assert.equal(groups.length, 2);
  assert.ok(groups.some((group) => /^Enfermería \d{4} — Mañana$/.test(group.name) && group._count.members === 18));
  assert.ok(groups.some((group) => /^Contabilidad \d{4} — Noche$/.test(group.name) && group._count.members === 16));

  // Entregas, notas, exámenes y asistencia con una distribución realista.
  const submissions = await db.submission.count({ where: scope });
  const graded = await db.submission.count({ where: { ...scope, status: "GRADED" } });
  assert.ok(submissions > 100, `entregas: ${submissions}`);
  assert.ok(graded > 60 && graded < submissions, `calificadas: ${graded} de ${submissions}`);
  assert.ok(await db.gradeEntry.count({ where: scope }) > graded, "las notas llegan al libro de calificaciones");
  const attempts = await db.examAttempt.count({ where: { ...scope, status: "GRADED" } });
  assert.ok(attempts > 60, `intentos: ${attempts}`);
  assert.equal(await db.examAttempt.count({ where: { ...scope, status: "IN_PROGRESS" } }), 0);
  assert.equal(await db.attendanceSession.count({ where: scope }), 7 * 6);
  const absences = await db.attendance.count({ where: { ...scope, status: "ABSENT" } });
  assert.ok(absences > 10, `ausencias: ${absences}`);

  const today = zonedDateKey(new Date(), "America/Santo_Domingo");
  const pastTasks = await db.assignment.findMany({ where: { ...scope, dueDate: { lt: new Date() } }, select: { id: true, courseId: true } });
  assert.equal(pastTasks.length, 7);
  let missing = 0;
  for (const task of pastTasks) {
    const enrolled = await db.enrollment.count({ where: { courseId: task.courseId, status: { in: ["ACTIVE", "COMPLETED", "DROPPED"] } } });
    missing += enrolled - (await db.submission.count({ where: { assignmentId: task.id } }));
  }
  assert.ok(missing > 5, `estudiantes sin entregar la tarea vencida: ${missing}`);
  const lowProgress = await db.enrollment.count({ where: { course: scope, status: "ACTIVE", progressPercent: { lt: 30 } } });
  assert.ok(lowProgress > 3, `estudiantes atrasados en lecciones: ${lowProgress}`);

  assert.ok(await db.liveClass.count({ where: { ...scope, startsAt: { gt: new Date() } } }) >= 7);
  assert.ok(await db.announcement.count({ where: scope }) >= 4);
  assert.equal(await db.certificate.count({ where: { ...scope, revokedAt: null } }), 2);
  assert.equal(await db.enrollment.count({ where: { course: scope, status: "DROPPED" } }), 1);
  assert.equal(await db.guardianship.count({ where: { ...scope, status: "ACTIVE" } }), 6);
  assert.ok(await db.scheduleSlot.count({ where: scope }) >= 7);

  // Cobros: pagados, con pago parcial y vencidos.
  const charges = await db.paymentConcept.findMany({ where: scope, select: { status: true, dueDate: true } });
  assert.equal(charges.length, 18 * 2 + 16 * 2 + 6);
  assert.ok(charges.some((charge) => charge.status === "PAID"));
  assert.ok(charges.some((charge) => charge.status === "PARTIAL"));
  const overdue = charges.filter((charge) => charge.status !== "PAID" && charge.dueDate && charge.dueDate.toISOString().slice(0, 10) < today);
  assert.ok(overdue.length >= 3, `cargos vencidos: ${overdue.length}`);
  assert.ok(await db.auditLog.count({ where: { ...scope, action: "FINANCE_PAYMENT_RECORDED" } }) > 30);

  const stages = await db.admissionLead.findMany({ where: scope, select: { stage: true } });
  assert.equal(stages.length, 5);
  assert.equal(new Set(stages.map((lead) => lead.stage)).size, 5);

  // Aislamiento: nada de la demostración apunta a otra institución.
  assert.equal(await db.user.count({ where: { email: DEMO_DOMAIN, NOT: scope } }), 0);
  assert.equal(await db.enrollment.count({ where: { course: scope, student: { NOT: scope } } }), 0);
  assert.equal(await db.enrollment.count({ where: { student: scope, course: { NOT: scope } } }), 0);
  assert.equal(await db.submission.count({ where: { student: scope, NOT: scope } }), 0);
  assert.equal(await db.guardianship.count({ where: { OR: [{ parent: scope }, { student: scope }], NOT: scope } }), 0);
  assert.deepEqual(await snapshotAB(), before_, "A y B no cambian al crear la demostración");
});

test("demo: repetirla no duplica nada", async () => {
  const users = await db.user.count({ where: { institutionId: demoId } });
  const identities = await db.identity.count({ where: { email: DEMO_DOMAIN } });
  const again = await createDemo({ password: "OtraClave2026" });
  assert.deepEqual(again, { created: false, institutionId: demoId });
  assert.equal(await db.institution.count({ where: { slug: DEMO_SLUG } }), 1);
  assert.equal(await db.user.count({ where: { institutionId: demoId } }), users);
  assert.equal(await db.identity.count({ where: { email: DEMO_DOMAIN } }), identities);
  const login = await authenticateCredentials({ email: STUDENTS[0].email, password: PASSWORD, ip: "10.77.0.2", institutionSlug: DEMO_SLUG });
  assert.equal(login?.institutionId, demoId, "la contraseña no cambió");
});

test("demo: quitarla borra solo la demostración y deja intactas A y B", async () => {
  // Una cuenta @demo.edukana.do que también está en A: su identidad no se borra.
  const shared = await createPerson(A.admin, { name: "Ana Mercedes Reyes", email: SHARED_EMAIL, role: "STUDENT" });
  assert.ok(shared.ok);
  sharedUserId = shared.userId;

  const result = await removeDemo();
  assert.equal(result.removed, true);
  assert.equal(await findDemoInstitution(), null);
  const gone = { institutionId: demoId };
  const leftovers = await Promise.all([
    db.user.count({ where: gone }),
    db.course.count({ where: gone }),
    db.enrollment.count({ where: gone }),
    db.submission.count({ where: gone }),
    db.paymentConcept.count({ where: gone }),
    db.payment.count({ where: gone }),
    db.auditLog.count({ where: gone }),
  ]);
  assert.deepEqual(leftovers, [0, 0, 0, 0, 0, 0, 0]);
  assert.equal(await db.identity.count({ where: { email: DEMO_DOMAIN } }), 1, "solo queda la identidad compartida con A");
  assert.ok(await db.user.findFirst({ where: { institutionId: A.institutionId, email: SHARED_EMAIL } }), "la persona de A sigue ahí");
  assert.deepEqual(await removeDemo(), { removed: false, identitiesRemoved: 0 }, "quitarla otra vez no hace nada");

  await db.user.deleteMany({ where: { institutionId: A.institutionId, email: SHARED_EMAIL } });
  await db.identity.deleteMany({ where: { email: SHARED_EMAIL } });
  await db.auditLog.deleteMany({ where: { institutionId: A.institutionId, action: "PERSON_CREATED", entityId: sharedUserId } });
  assert.deepEqual(await snapshotAB(), before_, "A y B quedan exactamente como estaban");
});
