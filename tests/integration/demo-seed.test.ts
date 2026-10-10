import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { authenticateCredentials } from "@/server/login";
import { createPerson } from "@/server/people/create";
import { DEMO_EMAIL_DOMAIN, GUARDIANS, STUDENTS } from "../../scripts/demo/content";
import { createDemo, DEMO_SLUG, findDemoInstitution, removeDemo } from "../../scripts/demo/demo-seed";
import { A, B, ensureSeed } from "./setup";

const PASSWORD = "DemoPrueba2026";
const DEMO_DOMAIN = { endsWith: `@${DEMO_EMAIL_DOMAIN}` };
const SHARED_EMAIL = `ana.reyes@${DEMO_EMAIL_DOMAIN}`;
const DAY_MS = 24 * 60 * 60 * 1000;
const hadCertificateSecret = "CERTIFICATE_SECRET" in process.env;
let demoId = "";
let sharedUserId = "";

/** Lo que tienen las instituciones A y B. Debe quedar igual después de crear y quitar la demostración. */
async function snapshotAB() {
  const ids = [A.institutionId, B.institutionId];
  const scope = { institutionId: { in: ids } };
  const [institutions, users, courses, enrollments, announcements, guardianships, periods, charges, audits, notifications, leads, identities] = await Promise.all([
    db.institution.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, slug: true, updatedAt: true }, orderBy: { id: "asc" } }),
    db.user.findMany({ where: scope, select: { id: true, email: true, role: true, status: true, identityId: true, updatedAt: true }, orderBy: { id: "asc" } }),
    db.course.findMany({ where: scope, select: { id: true, name: true, updatedAt: true }, orderBy: { id: "asc" } }),
    db.enrollment.count({ where: { course: scope } }),
    db.announcement.count({ where: scope }),
    db.guardianship.count({ where: scope }),
    db.academicPeriod.count({ where: scope }),
    db.paymentConcept.count({ where: scope }),
    db.auditLog.count({ where: scope }),
    db.notification.count({ where: scope }),
    db.admissionLead.count({ where: scope }),
    db.identity.findMany({ where: { NOT: { email: DEMO_DOMAIN } }, select: { id: true, email: true, passwordHash: true }, orderBy: { id: "asc" } }),
  ]);
  return { institutions, users, courses, enrollments, announcements, guardianships, periods, charges, audits, notifications, leads, identities };
}

/** Filas de la demostración en cada tabla grande: sirve para ver que repetirla no duplica y que quitarla no deja nada. */
async function demoRows(institutionId: string) {
  const scope = { institutionId };
  const entries = await Promise.all([
    db.user.count({ where: scope }),
    db.course.count({ where: scope }),
    db.lesson.count({ where: scope }),
    db.enrollment.count({ where: scope }),
    db.lessonProgress.count({ where: scope }),
    db.attendanceSession.count({ where: scope }),
    db.attendance.count({ where: scope }),
    db.assignment.count({ where: scope }),
    db.submission.count({ where: scope }),
    db.gradeItem.count({ where: scope }),
    db.gradeEntry.count({ where: scope }),
    db.exam.count({ where: scope }),
    db.examAttempt.count({ where: scope }),
    db.examAnswer.count({ where: scope }),
    db.paymentConcept.count({ where: scope }),
    db.payment.count({ where: scope }),
    db.admissionLead.count({ where: scope }),
    db.notification.count({ where: scope }),
    db.announcement.count({ where: scope }),
    db.liveClass.count({ where: scope }),
    db.program.count({ where: scope }),
    db.studentGroup.count({ where: scope }),
    db.guardianship.count({ where: scope }),
    db.certificate.count({ where: scope }),
    db.courseOrder.count({ where: scope }),
    db.courseReview.count({ where: scope }),
    db.auditLog.count({ where: scope }),
  ]);
  const names = ["users", "courses", "lessons", "enrollments", "lessonProgress", "sessions", "attendance", "assignments", "submissions", "gradeItems", "gradeEntries", "exams", "attempts", "answers", "charges", "payments", "leads", "notifications", "announcements", "liveClasses", "programs", "groups", "guardianships", "certificates", "orders", "reviews", "audits"];
  return Object.fromEntries(names.map((name, index) => [name, entries[index]]));
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

test("demo: crea un instituto técnico con ocho semanas de actividad realista", async () => {
  const started = Date.now();
  const result = await createDemo({ password: PASSWORD });
  const seconds = (Date.now() - started) / 1000;
  assert.equal(result.created, true);
  if (!result.created) return;
  demoId = result.institutionId;
  console.log(`demo: cargada en ${seconds.toFixed(1)} s`, JSON.stringify(result.counts));
  assert.ok(seconds < 60, `la carga tarda menos de un minuto (${seconds.toFixed(1)} s)`);

  const institution = await db.institution.findUniqueOrThrow({ where: { id: demoId } });
  assert.equal(institution.slug, DEMO_SLUG);
  assert.equal(institution.name, "Instituto Técnico Demo");
  const scope = { institutionId: demoId };
  const now = new Date();

  // Personas y acceso.
  const roles = await db.user.groupBy({ by: ["role"], where: scope, _count: { _all: true } });
  const byRole = Object.fromEntries(roles.map((row) => [row.role, row._count._all]));
  assert.deepEqual(byRole, { ADMIN: 1, COORDINATOR: 1, TEACHER: 10, STUDENT: 120, PARENT: 15 });
  assert.equal(await db.identity.count({ where: { email: DEMO_DOMAIN, passwordHash: null } }), 0);
  for (const email of [`directora@${DEMO_EMAIL_DOMAIN}`, `rosa.almonte@${DEMO_EMAIL_DOMAIN}`, STUDENTS[0].email, STUDENTS[100].email, GUARDIANS[0].email]) {
    const login = await authenticateCredentials({ email, password: PASSWORD, ip: "10.77.0.1", institutionSlug: DEMO_SLUG });
    assert.equal(login?.institutionId, demoId, `entra ${email}`);
  }
  assert.equal(await db.guardianship.count({ where: { ...scope, status: "ACTIVE" } }), 15);

  const periods = await db.academicPeriod.findMany({ where: scope, select: { isActive: true } });
  assert.equal(periods.length, 2);
  assert.equal(periods.filter((period) => period.isActive).length, 1);

  // Cursos y contenido.
  const courses = await db.course.findMany({ where: scope, select: { id: true, code: true, isPublished: true, isPublic: true, priceCents: true } });
  assert.equal(courses.length, 12);
  assert.ok(courses.every((course) => course.isPublished));
  const catalog = courses.filter((course) => course.isPublic);
  assert.deepEqual(catalog.map((course) => course.code).sort(), ["ENF-103", "EXC-100", "MER-101"]);
  assert.ok(catalog.every((course) => (course.priceCents ?? 0) > 0));
  for (const course of courses) {
    const chapters = await db.courseSection.count({ where: { courseId: course.id, isPublished: true } });
    const lessons = await db.lesson.count({ where: { courseId: course.id } });
    assert.ok(chapters >= 3 && chapters <= 4, `${course.code}: capítulos`);
    assert.ok(lessons >= chapters * 3, `${course.code}: lecciones`);
    assert.equal(await db.assignment.count({ where: { courseId: course.id, isPublished: true } }), 9, `${course.code}: tareas semanales`);
    const exam = await db.exam.findFirstOrThrow({ where: { courseId: course.id }, select: { isPublished: true, gradeItem: { select: { id: true } }, _count: { select: { questions: true } } } });
    assert.ok(exam.isPublished && exam.gradeItem && exam._count.questions >= 7 && exam._count.questions <= 9, `${course.code}: examen`);
    assert.equal(await db.attendanceSession.count({ where: { courseId: course.id } }), 16, `${course.code}: dos clases por semana durante 8 semanas`);
  }
  const videos = await db.lesson.findMany({ where: { ...scope, type: "VIDEO" }, select: { videoUrl: true } });
  assert.ok(videos.length >= 8 && videos.every((lesson) => lesson.videoUrl?.startsWith("https://www.youtube-nocookie.com/embed/")), "videos de YouTube ya normalizados");
  assert.ok(await db.lesson.count({ where: { ...scope, isPublished: false } }) >= 1, "hay al menos una lección en borrador");

  // Programas, grupos e inscripciones.
  const programs = await db.program.findMany({ where: scope, select: { name: true, _count: { select: { courses: true, groups: true } } } });
  assert.deepEqual(programs.map((program) => [program.name, program._count.courses, program._count.groups]).sort(), [["Técnico en Contabilidad", 3, 2], ["Técnico en Enfermería", 3, 2]]);
  const groups = await db.studentGroup.findMany({ where: scope, select: { name: true, _count: { select: { members: true, courses: true } } } });
  assert.equal(groups.length, 4);
  assert.deepEqual(groups.map((group) => group._count.members).sort((a, b) => a - b), [26, 28, 30, 30]);
  assert.ok(groups.every((group) => group._count.courses === 3));
  assert.equal(await db.enrollment.count({ where: { ...scope, status: "DROPPED" } }), 1);
  assert.equal(await db.enrollment.count({ where: { ...scope, status: "COMPLETED" } }), 4);
  assert.equal(await db.certificate.count({ where: { ...scope, revokedAt: null } }), 3);
  const progress = await db.enrollment.aggregate({ where: { ...scope, status: "ACTIVE" }, _avg: { progressPercent: true } });
  assert.ok((progress._avg.progressPercent ?? 0) > 45 && (progress._avg.progressPercent ?? 0) < 80, `avance promedio: ${progress._avg.progressPercent}`);

  // Asistencia: ~88 % en promedio, 8 a 10 estudiantes bajo 80 % y una leve mejora.
  const records = await db.attendance.findMany({ where: scope, select: { status: true, date: true, enrollment: { select: { studentId: true } } } });
  const attended = (rows: typeof records) => {
    const counted = rows.filter((row) => row.status !== "EXCUSED");
    return counted.filter((row) => row.status === "PRESENT" || row.status === "LATE").length / Math.max(1, counted.length);
  };
  const overall = attended(records);
  assert.ok(overall > 0.85 && overall < 0.92, `asistencia promedio: ${(overall * 100).toFixed(1)} %`);
  const byStudent = new Map<string, typeof records>();
  for (const row of records) byStudent.set(row.enrollment.studentId, [...(byStudent.get(row.enrollment.studentId) ?? []), row]);
  const low = [...byStudent.values()].map(attended).filter((rate) => rate < 0.8);
  assert.ok(low.length >= 8 && low.length <= 10, `estudiantes con asistencia baja: ${low.length}`);
  assert.ok(low.every((rate) => rate >= 0.55 && rate <= 0.78), "los de asistencia baja están entre 60 y 75 %");
  const middle = now.getTime() - 28 * DAY_MS;
  const early = attended(records.filter((row) => row.date.getTime() < middle));
  const late = attended(records.filter((row) => row.date.getTime() >= middle));
  assert.ok(late > early, `la asistencia sube: ${(early * 100).toFixed(1)} % → ${(late * 100).toFixed(1)} %`);

  // Tareas: la mayoría a tiempo, algunas tarde, algunas sin entregar; casi todas calificadas.
  const submissions = await db.submission.findMany({ where: scope, select: { status: true, submittedAt: true, assignment: { select: { dueDate: true } } } });
  const graded = submissions.filter((row) => row.status === "GRADED").length;
  const lateCount = submissions.filter((row) => row.assignment.dueDate && row.submittedAt > row.assignment.dueDate).length;
  assert.ok(submissions.length > 3000, `entregas: ${submissions.length}`);
  assert.ok(graded > submissions.length * 0.7 && graded < submissions.length, `calificadas: ${graded} de ${submissions.length}`);
  assert.ok(lateCount > 50 && lateCount < submissions.length * 0.2, `entregas tarde: ${lateCount}`);
  assert.ok(submissions.every((row) => row.submittedAt < now), "ninguna entrega en el futuro");
  const pastTasks = await db.assignment.findMany({ where: { ...scope, dueDate: { lt: now } }, select: { id: true, courseId: true, dueDate: true } });
  assert.equal(pastTasks.length, 12 * 8);
  let missing = 0;
  for (const task of pastTasks) {
    const enrolled = await db.enrollment.count({ where: { courseId: task.courseId, status: { in: ["ACTIVE", "COMPLETED"] } } });
    missing += enrolled - (await db.submission.count({ where: { assignmentId: task.id, enrollment: { status: { in: ["ACTIVE", "COMPLETED"] } } } }));
  }
  assert.ok(missing > 20 && missing < 300, `tareas vencidas sin entregar: ${missing}`);
  assert.ok(await db.gradeEntry.count({ where: scope }) > graded, "las notas de tareas y exámenes llegan al libro");

  // Exámenes: intentos calificados y respuestas abiertas por revisar.
  const attempts = await db.examAttempt.groupBy({ by: ["status"], where: scope, _count: { _all: true } });
  const attemptsBy = Object.fromEntries(attempts.map((row) => [row.status, row._count._all]));
  assert.ok((attemptsBy.GRADED ?? 0) > 200, `intentos calificados: ${attemptsBy.GRADED}`);
  assert.ok((attemptsBy.SUBMITTED ?? 0) > 20, `intentos por revisar: ${attemptsBy.SUBMITTED}`);
  assert.equal(attemptsBy.IN_PROGRESS ?? 0, 0);
  assert.equal(await db.examAnswer.count({ where: { ...scope, attempt: { status: "SUBMITTED" }, score: null, bankItem: { type: "SHORT_ANSWER" } } }), attemptsBy.SUBMITTED);
  assert.equal(await db.examAnswer.count({ where: { ...scope, attempt: { status: "GRADED" }, score: null } }), 0, "un intento calificado no tiene respuestas sin puntos");

  // Cobros: inscripción y tres mensualidades, ~80 % pagado, algunos vencidos.
  const charges = await db.paymentConcept.findMany({ where: scope, select: { status: true, dueDate: true, amountCents: true, payments: { select: { amountCents: true } } } });
  assert.equal(charges.length, 114 * 4 + 2);
  const paid = charges.filter((charge) => charge.status === "PAID").length / charges.length;
  assert.ok(paid > 0.72 && paid < 0.9, `cobros pagados: ${(paid * 100).toFixed(1)} %`);
  assert.ok(charges.some((charge) => charge.status === "PARTIAL"));
  assert.ok(charges.every((charge) => charge.payments.reduce((sum, payment) => sum + payment.amountCents, 0) === (charge.status === "PENDING" ? 0 : charge.status === "PAID" ? charge.amountCents : charge.payments[0]?.amountCents)), "lo pagado coincide con el estado de cada cobro");
  const overdue = charges.filter((charge) => charge.status !== "PAID" && charge.dueDate && charge.dueDate < now);
  assert.ok(overdue.length >= 5, `cobros vencidos: ${overdue.length}`);

  // Admisiones, catálogo, avisos, clases y notificaciones.
  const leads = await db.admissionLead.findMany({ where: scope, select: { stage: true, convertedUserId: true } });
  assert.equal(leads.length, 25);
  assert.equal(new Set(leads.map((lead) => lead.stage)).size, 6);
  const converted = leads.filter((lead) => lead.stage === "ENROLLED");
  assert.equal(converted.length, 6);
  assert.equal(await db.user.count({ where: { ...scope, role: "STUDENT", id: { in: converted.map((lead) => lead.convertedUserId!) } } }), 6);
  assert.equal(await db.courseOrder.count({ where: { ...scope, status: "PAID" } }), 4);
  assert.equal(await db.courseReview.count({ where: scope }), 2);
  assert.ok(await db.announcement.count({ where: scope }) >= 6);
  assert.ok(await db.liveClass.count({ where: { ...scope, startsAt: { gt: now } } }) >= 12);
  assert.ok(await db.liveClass.count({ where: { ...scope, startsAt: { gt: now, lt: new Date(now.getTime() + 2 * DAY_MS) } } }) >= 1, "hay una clase en vivo en las próximas 48 horas");
  assert.ok(await db.scheduleSlot.count({ where: scope }) >= 24);
  assert.ok(await db.notification.count({ where: { ...scope, readAt: null } }) > 100);

  // Aislamiento: nada de la demostración apunta a otra institución.
  assert.equal(await db.user.count({ where: { email: DEMO_DOMAIN, NOT: scope } }), 0);
  assert.equal(await db.enrollment.count({ where: { course: scope, student: { NOT: scope } } }), 0);
  assert.equal(await db.enrollment.count({ where: { student: scope, course: { NOT: scope } } }), 0);
  assert.equal(await db.submission.count({ where: { student: scope, NOT: scope } }), 0);
  assert.equal(await db.guardianship.count({ where: { OR: [{ parent: scope }, { student: scope }], NOT: scope } }), 0);
  assert.equal(await db.notification.count({ where: { user: scope, NOT: scope } }), 0);
  assert.deepEqual(await snapshotAB(), before_, "A y B no cambian al crear la demostración");
});

test("demo: correrla otra vez no duplica nada", async () => {
  const rows = await demoRows(demoId);
  const identities = await db.identity.count({ where: { email: DEMO_DOMAIN } });
  const again = await createDemo({ password: "OtraClave2026" });
  assert.deepEqual(again, { created: false, institutionId: demoId });
  assert.equal(await db.institution.count({ where: { slug: DEMO_SLUG } }), 1);
  assert.deepEqual(await demoRows(demoId), rows);
  assert.equal(await db.identity.count({ where: { email: DEMO_DOMAIN } }), identities);
  const login = await authenticateCredentials({ email: STUDENTS[0].email, password: PASSWORD, ip: "10.77.0.2", institutionSlug: DEMO_SLUG });
  assert.equal(login?.institutionId, demoId, "la contraseña no cambió");
});

test("demo: borrar-demo no deja rastro y deja intactas A y B", async () => {
  // Una cuenta @demo.edukana.do que también está en A: su identidad no se borra.
  const shared = await createPerson(A.admin, { name: "Ana Mercedes Reyes", email: SHARED_EMAIL, role: "STUDENT" });
  assert.ok(shared.ok);
  sharedUserId = shared.userId;

  const result = await removeDemo();
  assert.equal(result.removed, true);
  assert.equal(await findDemoInstitution(), null);
  const leftovers = await demoRows(demoId);
  assert.ok(Object.values(leftovers).every((total) => total === 0), `quedó algo: ${JSON.stringify(leftovers)}`);
  assert.equal(await db.identity.count({ where: { email: DEMO_DOMAIN } }), 1, "solo queda la identidad compartida con A");
  assert.ok(await db.user.findFirst({ where: { institutionId: A.institutionId, email: SHARED_EMAIL } }), "la persona de A sigue ahí");
  assert.deepEqual(await removeDemo(), { removed: false, identitiesRemoved: 0 }, "quitarla otra vez no hace nada");

  await db.user.deleteMany({ where: { institutionId: A.institutionId, email: SHARED_EMAIL } });
  await db.identity.deleteMany({ where: { email: SHARED_EMAIL } });
  await db.auditLog.deleteMany({ where: { institutionId: A.institutionId, action: "PERSON_CREATED", entityId: sharedUserId } });
  assert.deepEqual(await snapshotAB(), before_, "A y B quedan exactamente como estaban");
});
