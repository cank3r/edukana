import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { authorizeChildren, getChildOverview, listMyChildren } from "@/server/family/guardian-portal";
import { A, B, ensureSeed } from "./setup";

const DAY = 24 * 60 * 60_000;
const now = new Date();
const past = new Date(now.getTime() - 3 * DAY);
const future = new Date(now.getTime() + 3 * DAY);
const scope = { institutionId: A.institutionId, courseId: A.courseId };
const ENROLLMENT_1 = "a_enrollment"; // a_student, de la semilla
const ENROLLMENT_2 = "it_gp_enrollment2"; // a_student2, creada aquí
const SECRET_URL = "https://reunion.test/sala-secreta";
const ALL_AREAS = { canViewAcademics: true, canViewAttendance: true, canViewSchedule: true, canViewAnnouncements: true, canViewFinance: true };
const SEED_LINK = { status: "ACTIVE", revokedAt: null, canViewAcademics: true, canViewAttendance: false, canViewSchedule: false, canViewAnnouncements: true, canViewFinance: false } as const;

async function cleanup() {
  await db.roleCapabilityOverride.deleteMany({ where: { id: { startsWith: "it_gp_" } } });
  await db.paymentConcept.deleteMany({ where: { id: { startsWith: "it_gp_" } } });
  await db.liveClass.deleteMany({ where: { id: { startsWith: "it_gp_" } } });
  await db.attendanceSession.deleteMany({ where: { id: { startsWith: "it_gp_" } } });
  await db.gradingPeriod.deleteMany({ where: { id: { startsWith: "it_gp_" } } });
  await db.assignment.deleteMany({ where: { id: { startsWith: "it_gp_" } } });
  await db.enrollment.deleteMany({ where: { id: ENROLLMENT_2 } });
  await db.guardianship.update({ where: { id: A.guardianshipId }, data: SEED_LINK });
  await db.user.updateMany({ where: { id: { in: [A.parent.id, A.student.id] } }, data: { status: "ACTIVE" } });
}

before(async () => {
  await ensureSeed();
  await cleanup();
  await db.enrollment.create({ data: { id: ENROLLMENT_2, institutionId: A.institutionId, studentId: A.student2.id, courseId: A.courseId, status: "ACTIVE" } });

  await db.assignment.createMany({
    data: [
      { id: "it_gp_overdue", ...scope, title: "Tarea vencida", dueDate: past, isPublished: true },
      { id: "it_gp_upcoming", ...scope, title: "Tarea próxima", dueDate: future, isPublished: true },
      { id: "it_gp_graded", ...scope, title: "Tarea calificada", dueDate: past, isPublished: true, maxScore: 10 },
      { id: "it_gp_hidden", ...scope, title: "Tarea con nota oculta", dueDate: past, isPublished: true, maxScore: 10 },
      { id: "it_gp_draft", ...scope, title: "Tarea sin publicar", dueDate: future, isPublished: false },
    ],
  });
  await db.submission.createMany({
    data: [
      { institutionId: A.institutionId, assignmentId: "it_gp_graded", studentId: A.student.id, enrollmentId: ENROLLMENT_1, status: "GRADED", score: 9, feedback: "Buen trabajo", gradedAt: now },
      { institutionId: A.institutionId, assignmentId: "it_gp_hidden", studentId: A.student.id, enrollmentId: ENROLLMENT_1, status: "GRADED", score: 3, feedback: "Comentario oculto", gradedAt: now },
      { institutionId: A.institutionId, assignmentId: "it_gp_overdue", studentId: A.student2.id, enrollmentId: ENROLLMENT_2, status: "GRADED", score: 1, feedback: "Nota de otro estudiante", gradedAt: now },
    ],
  });

  await db.gradingPeriod.create({
    data: { id: "it_gp_period", ...scope, academicPeriodId: "a_period", name: "it_gp período", startDate: past, endDate: future, weight: 100 },
  });
  await db.gradeCategory.create({ data: { id: "it_gp_category", ...scope, gradingPeriodId: "it_gp_period", name: "General", weight: 100 } });
  const item = { ...scope, gradingPeriodId: "it_gp_period", categoryId: "it_gp_category", maxScore: 10 };
  await db.gradeItem.createMany({
    data: [
      { id: "it_gp_item_published", ...item, title: "Nota publicada", isPublished: true, assignmentId: "it_gp_graded" },
      { id: "it_gp_item_hidden", ...item, title: "Nota oculta", isPublished: false, assignmentId: "it_gp_hidden" },
    ],
  });
  const entry = { institutionId: A.institutionId, gradedById: A.teacher.id };
  await db.gradeEntry.createMany({
    data: [
      { ...entry, gradeItemId: "it_gp_item_published", enrollmentId: ENROLLMENT_1, score: 9, feedback: "Buen trabajo" },
      { ...entry, gradeItemId: "it_gp_item_hidden", enrollmentId: ENROLLMENT_1, score: 3, feedback: "Comentario oculto" },
      { ...entry, gradeItemId: "it_gp_item_published", enrollmentId: ENROLLMENT_2, score: 1, feedback: "Nota de otro estudiante" },
    ],
  });

  const sessions = [
    { id: "it_gp_session1", date: new Date("2031-03-07"), status: "ABSENT" as const },
    { id: "it_gp_session2", date: new Date("2031-03-08"), status: "PRESENT" as const },
    { id: "it_gp_session3", date: new Date("2031-03-09"), status: "LATE" as const },
    { id: "it_gp_session4", date: new Date("2031-03-10"), status: "ABSENT" as const },
  ];
  await db.attendanceSession.createMany({ data: sessions.map(({ id, date }) => ({ id, ...scope, date, recordedById: A.teacher.id })) });
  await db.attendance.createMany({
    data: sessions.flatMap(({ id, date, status }) => [
      { ...scope, sessionId: id, enrollmentId: ENROLLMENT_1, date, status },
      { ...scope, sessionId: id, enrollmentId: ENROLLMENT_2, date, status: "ABSENT" as const },
    ]),
  });

  await db.liveClass.createMany({
    data: [
      { id: "it_gp_live", ...scope, title: "Clase en vivo", startsAt: future, durationMinutes: 45, joinUrl: SECRET_URL, createdById: A.teacher.id },
      { id: "it_gp_live_other", institutionId: A.institutionId, courseId: A.course2Id, title: "Clase de otro curso", startsAt: future, joinUrl: SECRET_URL, createdById: A.teacher2.id },
    ],
  });

  await db.paymentConcept.createMany({
    data: [
      { id: "it_gp_pay_overdue", institutionId: A.institutionId, studentId: A.student.id, concept: "Mensualidad vencida", amount: 1500, amountCents: 150000, dueDate: past, status: "PENDING" },
      { id: "it_gp_pay_pending", institutionId: A.institutionId, studentId: A.student.id, concept: "Mensualidad próxima", amount: 1000.5, amountCents: null, dueDate: future, status: "PENDING" },
      { id: "it_gp_pay_paid", institutionId: A.institutionId, studentId: A.student.id, concept: "Ya pagado", amount: 700, amountCents: 70000, dueDate: past, status: "PAID" },
      { id: "it_gp_pay_other", institutionId: A.institutionId, studentId: A.student2.id, concept: "Cargo de otro estudiante", amount: 999, amountCents: 99900, dueDate: past, status: "PENDING" },
    ],
  });
});

after(async () => {
  await cleanup();
  await db.$disconnect();
});

test("tutor: ve a su hijo vinculado y a nadie más", async () => {
  const children = await listMyChildren(A.parent, now);
  assert.deepEqual(children.map((child) => child.studentId), [A.student.id]);
  assert.equal(children[0].name, "student A");
  assert.equal(children[0].activeCourses, 1);
  assert.deepEqual(children[0].alerts.map((alert) => alert.kind), ["overdue"], "una tarea vencida sin entregar; la asistencia no está permitida en la semilla");

  assert.equal((await getChildOverview(A.parent, A.student.id, now))?.child.id, A.student.id);
  assert.equal(await getChildOverview(A.parent, A.student2.id, now), null, "sin vínculo no hay nada");
  assert.equal(await getChildOverview(A.parent, B.student.id, now), null);
  assert.equal(await getChildOverview(A.parent, "", now), null);
  assert.deepEqual(await authorizeChildren(A.parent, A.student2.id), []);
});

test("tutor: con los permisos de la semilla solo recibe lo académico y los avisos", async () => {
  const view = await getChildOverview(A.parent, A.student.id, now);
  assert.ok(view);
  assert.deepEqual(view.permissions, { academics: true, attendance: false, schedule: false, announcements: true, finance: false });
  assert.deepEqual(view.courses.map((course) => course.courseId), [A.courseId], "solo el curso donde su hijo está inscrito");
  assert.deepEqual(view.announcements.map((item) => item.id), [A.announcementId]);
  assert.equal(view.attendance, null);
  assert.deepEqual(view.liveClasses, []);
  assert.equal(view.account, null);
});

test("tareas y notas: solo lo publicado y solo lo de su hijo", async () => {
  const view = await getChildOverview(A.parent, A.student.id, now);
  assert.ok(view);
  const tasks = new Map(view.tasks.map((task) => [task.id, task]));
  assert.deepEqual([...tasks.keys()].sort(), ["it_gp_graded", "it_gp_hidden", "it_gp_overdue", "it_gp_upcoming"], "la tarea sin publicar no aparece");
  assert.equal(tasks.get("it_gp_overdue")?.state, "overdue", "la entrega de otro estudiante no cuenta como suya");
  assert.equal(tasks.get("it_gp_overdue")?.score, null);
  assert.equal(tasks.get("it_gp_upcoming")?.state, "pending");
  assert.deepEqual([tasks.get("it_gp_graded")?.state, tasks.get("it_gp_graded")?.score, tasks.get("it_gp_graded")?.feedback], ["graded", 9, "Buen trabajo"]);
  assert.deepEqual([tasks.get("it_gp_hidden")?.state, tasks.get("it_gp_hidden")?.score, tasks.get("it_gp_hidden")?.feedback], ["submitted", null, null], "nota sin publicar: ni nota ni comentario");

  assert.equal(view.grades.length, 1);
  assert.deepEqual(view.grades[0].items, [{ id: "it_gp_item_published", title: "Nota publicada", maxScore: 10, score: 9, isExcused: false, feedback: "Buen trabajo" }]);
  assert.equal(view.grades[0].average, 90, "el promedio solo cuenta lo publicado");
  assert.deepEqual(view.deadlines.map((item) => item.key), ["t-it_gp_upcoming"]);

  const text = JSON.stringify(view);
  for (const leak of ["Nota oculta", "Comentario oculto", "Nota de otro estudiante", "Tarea sin publicar", "student2 A", "estudiante@a.test"]) {
    assert.equal(text.includes(leak), false, `no debe aparecer: ${leak}`);
  }
});

test("asistencia, clases y estado de cuenta: aparecen solo cuando el vínculo y el rol lo permiten", async () => {
  await db.guardianship.update({ where: { id: A.guardianshipId }, data: ALL_AREAS });
  // El tutor tiene por omisión el permiso de cobros; si la institución se lo quita al rol, el vínculo no basta.
  await db.roleCapabilityOverride.create({
    data: { id: "it_gp_override", institutionId: A.institutionId, role: "PARENT", capability: "child.finance.view", enabled: false, updatedById: A.admin.id },
  });
  let view = await getChildOverview(A.parent, A.student.id, now);
  assert.ok(view);
  assert.deepEqual(view.permissions, { academics: true, attendance: true, schedule: true, announcements: true, finance: false }, "el estado de cuenta además exige el permiso del rol");
  assert.equal(view.account, null);

  assert.equal(view.attendance?.percent, 50, "2 de 4 clases: presente y tarde cuentan como asistencia");
  assert.deepEqual(view.attendance?.incidents.map((item) => item.status), ["ABSENT", "LATE", "ABSENT"]);
  assert.deepEqual(view.alerts.map((alert) => alert.kind), ["overdue", "attendance"]);

  assert.deepEqual(view.liveClasses.map((item) => item.id), ["it_gp_live"], "solo clases de los cursos de su hijo");
  assert.equal(JSON.stringify(view).includes("reunion.test"), false, "el tutor nunca recibe el enlace de la clase");
  const [card] = await listMyChildren(A.parent, now);
  assert.equal(card.nextClass?.id, "it_gp_live");
  assert.equal(JSON.stringify(card).includes("reunion.test"), false);

  await db.roleCapabilityOverride.deleteMany({ where: { id: "it_gp_override" } });
  view = await getChildOverview(A.parent, A.student.id, now);
  assert.ok(view?.account);
  assert.deepEqual(view.account.charges.map((charge) => [charge.id, charge.amountCents, charge.overdue]), [["it_gp_pay_overdue", 150000, true], ["it_gp_pay_pending", 100050, false]]);
  assert.deepEqual(view.account.totals, [{ currency: "DOP", owedCents: 250050, overdueCents: 150000 }]);

  // Lo que debe sale de los pagos reales: un pago parcial baja el saldo; uno anulado no cuenta.
  await db.payment.createMany({
    data: [
      { id: "it_gp_payment", institutionId: A.institutionId, conceptId: "it_gp_pay_overdue", amountCents: 50000, method: "CASH", paidOn: past, recordedById: A.admin.id },
      { id: "it_gp_payment_void", institutionId: A.institutionId, conceptId: "it_gp_pay_overdue", amountCents: 30000, method: "CASH", paidOn: past, recordedById: A.admin.id, voidedAt: past, voidReason: "Prueba" },
    ],
  });
  view = await getChildOverview(A.parent, A.student.id, now);
  assert.deepEqual(view?.account?.charges.map((charge) => [charge.id, charge.amountCents, charge.status]), [["it_gp_pay_overdue", 100000, "PARTIAL"], ["it_gp_pay_pending", 100050, "PENDING"]]);
  assert.deepEqual(view?.account?.totals, [{ currency: "DOP", owedCents: 200050, overdueCents: 100000 }]);
  await db.payment.deleteMany({ where: { id: { in: ["it_gp_payment", "it_gp_payment_void"] } } });

  await db.guardianship.update({ where: { id: A.guardianshipId }, data: { canViewFinance: false } });
  assert.equal((await getChildOverview(A.parent, A.student.id, now))?.account, null, "sin permiso del vínculo no hay estado de cuenta");

  await db.roleCapabilityOverride.deleteMany({ where: { id: "it_gp_override" } });
  await db.guardianship.update({ where: { id: A.guardianshipId }, data: SEED_LINK });
});

test("sin permiso académico en el vínculo: las secciones académicas llegan vacías", async () => {
  await db.guardianship.update({ where: { id: A.guardianshipId }, data: { canViewAcademics: false } });
  try {
    const view = await getChildOverview(A.parent, A.student.id, now);
    assert.ok(view, "el vínculo sigue activo");
    assert.equal(view.permissions.academics, false);
    assert.deepEqual([view.courses, view.tasks, view.grades, view.deadlines, view.alerts], [[], [], [], [], []]);
    assert.deepEqual(view.announcements.map((item) => item.id), [A.announcementId], "los avisos siguen su propio permiso");
    const [card] = await listMyChildren(A.parent, now);
    assert.deepEqual([card.activeCourses, card.averageProgress, card.alerts], [null, null, []]);
  } finally {
    await db.guardianship.update({ where: { id: A.guardianshipId }, data: SEED_LINK });
  }
});

test("vínculo revocado, pendiente o cuenta suspendida: no devuelve nada", async () => {
  const expectNothing = async (why: string) => {
    assert.deepEqual(await listMyChildren(A.parent, now), [], why);
    assert.equal(await getChildOverview(A.parent, A.student.id, now), null, why);
    assert.deepEqual(await authorizeChildren(A.parent), [], why);
  };
  try {
    await db.guardianship.update({ where: { id: A.guardianshipId }, data: { status: "REVOKED", revokedAt: now } });
    await expectNothing("vínculo revocado");
    await db.guardianship.update({ where: { id: A.guardianshipId }, data: { status: "PENDING", revokedAt: null } });
    await expectNothing("vínculo sin activar");
    await db.guardianship.update({ where: { id: A.guardianshipId }, data: SEED_LINK });

    await db.user.update({ where: { id: A.student.id }, data: { status: "SUSPENDED" } });
    await expectNothing("estudiante suspendido");
    await db.user.update({ where: { id: A.student.id }, data: { status: "ACTIVE" } });
    await db.user.update({ where: { id: A.parent.id }, data: { status: "SUSPENDED" } });
    await expectNothing("tutor suspendido");
  } finally {
    await db.guardianship.update({ where: { id: A.guardianshipId }, data: SEED_LINK });
    await db.user.updateMany({ where: { id: { in: [A.parent.id, A.student.id] } }, data: { status: "ACTIVE" } });
  }
  assert.equal((await listMyChildren(A.parent, now)).length, 1, "al restaurar vuelve a verlo");
});

test("otra institución: el tutor de B no ve nada de A", async () => {
  assert.deepEqual((await listMyChildren(B.parent, now)).map((child) => child.studentId), [B.student.id]);
  assert.equal(await getChildOverview(B.parent, A.student.id, now), null);
  assert.equal(await getChildOverview(B.parent, A.student2.id, now), null);
  const own = await getChildOverview(B.parent, B.student.id, now);
  assert.deepEqual(own?.courses.map((course) => course.courseId), [B.courseId]);
  assert.deepEqual([own?.tasks, own?.grades.flatMap((course) => course.items)], [[], []], "nada de lo creado en A");

  // Una sesión manipulada que mezcla el tutor de A con la institución B tampoco obtiene nada.
  const mixed = { ...A.parent, institutionId: B.institutionId };
  assert.deepEqual(await listMyChildren(mixed, now), []);
  assert.equal(await getChildOverview(mixed, A.student.id, now), null);
  assert.equal(await getChildOverview(mixed, B.student.id, now), null);
});

test("quien no es tutor recibe vacío, aunque pregunte por sí mismo o diga ser tutor", async () => {
  for (const actor of [A.student, A.student2, A.teacher, A.coordinator, A.admin]) {
    assert.deepEqual(await listMyChildren(actor, now), []);
    assert.deepEqual(await authorizeChildren(actor), []);
    assert.equal(await getChildOverview(actor, A.student.id, now), null);
    assert.equal(await getChildOverview(actor, actor.id, now), null);
    // Aunque la sesión dijera «tutor», la cuenta real no lo es y no tiene vínculo.
    const pretending = { ...actor, role: "PARENT" as const };
    assert.deepEqual(await listMyChildren(pretending, now), []);
    assert.equal(await getChildOverview(pretending, A.student.id, now), null);
  }
});
