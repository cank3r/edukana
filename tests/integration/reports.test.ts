import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { cleanReportFilters, listReportFilterOptions, resolveReportAccess, type ReportAccess } from "@/server/reports/access";
import { reportCsv, reportCsvCell } from "@/server/reports/csv";
import { reportCsvFile } from "@/server/reports/export";
import {
  getAccessReport,
  getCourseReport,
  getFinanceSummary,
  getGroupReport,
  getOverview,
  getProgramReport,
  getRiskReport,
  getTeacherReport,
  listPeopleWithoutAccess,
  parseSort,
  riskReasons,
} from "@/server/reports/queries";
import { A, B, ensureSeed } from "./setup";

// Datos propios, todos con prefijo rp_. Los de la institución A viven en un período propio para poder afirmar cifras exactas.
const PERIOD = "rp_period";
const [C1, C2, CB] = ["rp_c1", "rp_c2", "rp_cb"];
const COURSES = [C1, C2, CB];
const [S1, S2, S3, S4, SB] = ["rp_s1", "rp_s2", "rp_s3", "rp_s4", "rp_sb"];
const STUDENTS = [S1, S2, S3, S4, SB];
const PAYMENTS = ["rp_p1", "rp_p2", "rp_p3", "rp_pb"];
const TRICKY_NAME = '=Curso "raro", con coma';
const B_COURSE_NAME = "Curso secreto de B";

const now = new Date();
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60_000);
const dateOnly = (date: Date) => new Date(date.toISOString().slice(0, 10));
const filters = { periodId: PERIOD, programId: null };
const none = { periodId: null, programId: null };
const close = (actual: number | null, expected: number) => assert.ok(actual !== null && Math.abs(actual - expected) < 0.01, `${actual} ≈ ${expected}`);

let admin: ReportAccess;

async function cleanup() {
  await db.roleCapabilityOverride.deleteMany({ where: { institutionId: A.institutionId, role: "COORDINATOR", capability: "analytics.view" } });
  await db.paymentConcept.deleteMany({ where: { id: { in: PAYMENTS } } });
  await db.assignment.deleteMany({ where: { courseId: { in: COURSES } } });
  await db.enrollment.deleteMany({ where: { courseId: { in: COURSES } } });
  await db.studentGroup.deleteMany({ where: { id: "rp_group" } });
  await db.program.deleteMany({ where: { id: "rp_program" } });
  await db.course.deleteMany({ where: { id: { in: COURSES } } });
  await db.academicPeriod.deleteMany({ where: { id: PERIOD } });
  await db.user.deleteMany({ where: { id: { in: STUDENTS } } });
  await db.identity.deleteMany({ where: { id: "rp_identity" } });
}

before(async () => {
  await ensureSeed();
  await cleanup();
  const a = { institutionId: A.institutionId };
  const b = { institutionId: B.institutionId };

  await db.identity.create({ data: { id: "rp_identity", email: "rp_s1@a.test", passwordHash: "hash-de-prueba" } });
  await db.user.createMany({
    data: [
      { id: S1, ...a, name: "Rp Ana", email: "rp_s1@a.test", role: "STUDENT", identityId: "rp_identity" },
      { id: S2, ...a, name: "Rp Beto", email: "rp_s2@a.test", role: "STUDENT" },
      { id: S3, ...a, name: "Rp Carla", email: "rp_s3@a.test", role: "STUDENT" },
      { id: S4, ...a, name: "Rp Dora", email: "rp_s4@a.test", role: "STUDENT" },
      { id: SB, ...b, name: "Rp Externo de B", email: "rp_sb@b.test", role: "STUDENT" },
    ],
  });
  await db.academicPeriod.create({ data: { id: PERIOD, ...a, name: "Período de reportes", startDate: daysAgo(60), endDate: daysAgo(-60) } });
  await db.course.createMany({
    data: [
      { id: C1, ...a, periodId: PERIOD, teacherId: A.teacher.id, name: "Rp Anatomía", code: "RP-1", createdAt: daysAgo(50) },
      { id: C2, ...a, periodId: PERIOD, teacherId: A.teacher2.id, name: TRICKY_NAME, code: "RP-2", createdAt: daysAgo(10) },
      { id: CB, ...b, periodId: "b_period", teacherId: B.teacher.id, name: B_COURSE_NAME, code: "RP-B", createdAt: daysAgo(50) },
    ],
  });
  const enrolledAt = daysAgo(40);
  await db.enrollment.createMany({
    data: [
      { id: "rp_e1", ...a, studentId: S1, courseId: C1, progressPercent: 80, enrolledAt },
      { id: "rp_e2", ...a, studentId: S2, courseId: C1, progressPercent: 60, enrolledAt },
      { id: "rp_e3", ...a, studentId: S3, courseId: C1, progressPercent: 10, enrolledAt },
      { id: "rp_e4", ...a, studentId: S4, courseId: C1, progressPercent: 5, enrolledAt, status: "DROPPED", withdrawnAt: daysAgo(5), withdrawReason: "Prueba" },
      { id: "rp_e5", ...a, studentId: S1, courseId: C2, progressPercent: 20, enrolledAt },
      { id: "rp_eb", ...b, studentId: SB, courseId: CB, progressPercent: 0, enrolledAt },
    ],
  });
  // Una tarea que venció hace 5 días: Ana entregó a tiempo (sin calificar), Carla tarde (ya calificada), Beto no entregó.
  await db.assignment.create({ data: { id: "rp_task", ...a, courseId: C1, title: "Rp Tarea", isPublished: true, dueDate: daysAgo(5) } });
  await db.submission.createMany({
    data: [
      { id: "rp_sub1", ...a, assignmentId: "rp_task", studentId: S1, enrollmentId: "rp_e1", status: "SUBMITTED", submittedAt: daysAgo(7) },
      { id: "rp_sub3", ...a, assignmentId: "rp_task", studentId: S3, enrollmentId: "rp_e3", status: "GRADED", score: 50, submittedAt: daysAgo(3), gradedAt: daysAgo(2) },
    ],
  });
  await db.attendanceSession.create({ data: { id: "rp_class", ...a, courseId: C1, date: dateOnly(daysAgo(3)), recordedById: A.teacher.id } });
  await db.attendance.createMany({
    data: [
      { ...a, courseId: C1, sessionId: "rp_class", enrollmentId: "rp_e1", date: dateOnly(daysAgo(3)), status: "PRESENT" },
      { ...a, courseId: C1, sessionId: "rp_class", enrollmentId: "rp_e2", date: dateOnly(daysAgo(3)), status: "ABSENT" },
      { ...a, courseId: C1, sessionId: "rp_class", enrollmentId: "rp_e3", date: dateOnly(daysAgo(3)), status: "LATE" },
    ],
  });
  await db.gradingPeriod.create({ data: { id: "rp_gp", ...a, courseId: C1, academicPeriodId: PERIOD, name: "Rp Parcial", startDate: daysAgo(60), endDate: daysAgo(-60) } });
  await db.gradeCategory.create({ data: { id: "rp_gc", ...a, courseId: C1, gradingPeriodId: "rp_gp", name: "Rp Trabajos", weight: 100 } });
  await db.gradeItem.create({ data: { id: "rp_gi", ...a, courseId: C1, gradingPeriodId: "rp_gp", categoryId: "rp_gc", title: "Rp Quiz", maxScore: 20 } });
  await db.gradeEntry.createMany({
    data: [
      { ...a, gradeItemId: "rp_gi", enrollmentId: "rp_e1", score: 18, gradedById: A.teacher.id },
      { ...a, gradeItemId: "rp_gi", enrollmentId: "rp_e3", score: 10, gradedById: A.teacher.id },
    ],
  });
  await db.program.create({ data: { id: "rp_program", ...a, name: "Rp Programa", courses: { create: { ...a, courseId: C1 } } } });
  await db.studentGroup.create({
    data: { id: "rp_group", ...a, name: "Rp Grupo", programId: "rp_program", startsOn: dateOnly(daysAgo(40)), members: { create: [S1, S2].map((userId) => ({ ...a, userId })) } },
  });
  await db.paymentConcept.createMany({
    data: [
      { id: "rp_p1", ...a, periodId: PERIOD, studentId: S1, concept: "Rp Mensualidad", amount: 100, amountCents: 10_000, status: "PAID", paidAt: daysAgo(2) },
      { id: "rp_p2", ...a, periodId: PERIOD, studentId: S2, concept: "Rp Mensualidad", amount: 50, amountCents: 5_000, status: "PENDING", dueDate: daysAgo(1) },
      { id: "rp_p3", ...a, periodId: PERIOD, studentId: S3, concept: "Rp Anulado", amount: 70, amountCents: 7_000, status: "CANCELLED" },
      { id: "rp_pb", ...b, periodId: "b_period", studentId: SB, concept: "Rp Cobro de B", amount: 999, amountCents: 99_900, status: "PAID", paidAt: daysAgo(2) },
    ],
  });

  const access = await resolveReportAccess(A.admin);
  assert.ok(access);
  admin = access;
});

after(async () => {
  await cleanup();
  await db.$disconnect();
});

test("permisos: sin permiso de reportes se rechaza; el administrador ve todo", async () => {
  assert.deepEqual(admin, { institutionId: A.institutionId, scope: { kind: "all" }, canSeeFinance: true, canSeeAccess: true });
  for (const actor of [A.teacher, A.student, A.parent, A.coordinator]) {
    assert.equal(await resolveReportAccess(actor), null, `${actor.role} no ve reportes`);
    assert.equal(await reportCsvFile(actor, "cursos", {}), null, `${actor.role} no descarga reportes`);
  }
  assert.equal(await resolveReportAccess({ id: "", institutionId: A.institutionId, role: "ADMIN" }), null);
});

test("cifras de arriba: coinciden con conteos directos", async () => {
  const overview = await getOverview(admin, filters, now);
  const inPeriod = { course: { institutionId: A.institutionId, periodId: PERIOD, archivedAt: null }, status: "ACTIVE" as const, student: { status: "ACTIVE" as const } };
  const directStudents = (await db.enrollment.groupBy({ by: ["studentId"], where: inPeriod })).length;
  const directProgress = (await db.enrollment.aggregate({ where: inPeriod, _avg: { progressPercent: true } }))._avg.progressPercent;

  assert.deepEqual(overview.activeStudents, { value: 3, before: 4 }, "hace un mes Dora aún no se había retirado");
  assert.equal(overview.activeStudents.value, directStudents);
  assert.deepEqual(overview.runningCourses, { value: 2, before: 1 }, "el segundo curso se creó hace 10 días");
  assert.equal(overview.runningCourses.value, await db.course.count({ where: { institutionId: A.institutionId, periodId: PERIOD, isPublished: true, archivedAt: null } }));
  close(overview.averageProgress, 42.5);
  close(overview.averageProgress, directProgress ?? -1);
  assert.equal(overview.onTime.expected, 3, "tres inscritos debían entregar; la retirada no cuenta");
  close(overview.onTime.percent, 100 / 3);
  assert.equal(overview.onTime.beforePercent, null, "no venció nada en los 30 días anteriores");
  assert.equal(overview.attendance.records, 3);
  close(overview.attendance.percent, 200 / 3);
  assert.equal(overview.finance?.collectedCents, 10_000);
  assert.equal(overview.finance?.pendingCents, 5_000, "el cobro anulado no cuenta");
  assert.equal(overview.finance?.overdueCents, 5_000);
  assert.equal(overview.finance?.collectedLast30Cents, 10_000);

  // Sin filtro: toda la institución A, igual al conteo directo y sin nada de B.
  const everything = await getOverview(admin, none, now);
  const allA = { course: { institutionId: A.institutionId, archivedAt: null }, status: "ACTIVE" as const, student: { status: "ACTIVE" as const } };
  assert.equal(everything.activeStudents.value, (await db.enrollment.groupBy({ by: ["studentId"], where: allA })).length);
  assert.equal(everything.runningCourses.value, await db.course.count({ where: { institutionId: A.institutionId, isPublished: true, archivedAt: null } }));
  const paidA = await db.paymentConcept.aggregate({ where: { institutionId: A.institutionId, status: "PAID" }, _sum: { amountCents: true } });
  assert.equal(everything.finance?.collectedCents, paidA._sum.amountCents ?? 0, "el cobro de B no se suma");
});

test("cursos: una fila por curso con sus conteos, y se ordena por enlaces", async () => {
  const report = await getCourseReport(admin, filters, { sort: { key: "nombre", desc: true } });
  assert.equal(report.total, 2);
  assert.deepEqual(report.rows.map((row) => row.id), [C1, C2], "nombre descendente");
  const [first, second] = report.rows;
  assert.deepEqual(
    { enrolled: first.enrolled, withdrawn: first.withdrawn, pendingGrading: first.pendingGrading, lowProgress: first.lowProgress, teacherName: first.teacherName },
    { enrolled: 3, withdrawn: 1, pendingGrading: 1, lowProgress: false, teacherName: "teacher A" },
  );
  close(first.averageProgress, 50);
  close(first.averageGrade, 70);
  assert.equal(first.enrolled, await db.enrollment.count({ where: { courseId: C1, status: "ACTIVE" } }));
  assert.equal(first.pendingGrading, await db.submission.count({ where: { assignment: { courseId: C1 }, status: "SUBMITTED" } }));
  assert.deepEqual({ enrolled: second.enrolled, lowProgress: second.lowProgress, averageGrade: second.averageGrade }, { enrolled: 1, lowProgress: true, averageGrade: null });

  const byProgress = await getCourseReport(admin, filters, { sort: parseSort("avance", ["avance", "nombre"] as const, { key: "nombre", desc: false }) });
  assert.deepEqual(byProgress.rows.map((row) => row.id), [C2, C1], "el de menor avance primero");
  assert.deepEqual(parseSort("-inscritos", ["inscritos"] as const, { key: "inscritos", desc: false }), { key: "inscritos", desc: true });
  assert.deepEqual(parseSort("name; DROP TABLE users", ["inscritos"] as const, { key: "inscritos", desc: false }), { key: "inscritos", desc: false }, "un orden desconocido no llega a la consulta");
  assert.equal((await getCourseReport(admin, filters, { limit: 1 })).rows.length, 1);
});

test("estudiantes en riesgo: el motivo sale en palabras", async () => {
  const report = await getRiskReport(admin, filters, { now });
  assert.equal(report.total, 2);
  assert.deepEqual(report.rows.map((row) => row.studentId), [S2, S3], "primero quien tiene más motivos; Ana no está en riesgo");
  assert.deepEqual(report.counts, { inactive: 1, lowProgress: 1, lowAttendance: 1, overdue: 1 });

  const [beto, carla] = report.rows;
  assert.deepEqual(
    { inactive: beto.inactive, lowProgress: beto.lowProgress, lowAttendance: beto.lowAttendance, overdueTasks: beto.overdueTasks, lastActivityAt: beto.lastActivityAt },
    { inactive: true, lowProgress: false, lowAttendance: true, overdueTasks: 1, lastActivityAt: null },
  );
  const reasons = riskReasons(beto, now).join(" | ");
  assert.match(reasons, /Nunca ha entrado a sus cursos/);
  assert.match(reasons, /Asistencia de 0 %/);
  assert.match(reasons, /1 tarea vencida sin entregar/);
  assert.deepEqual(
    { inactive: carla.inactive, lowProgress: carla.lowProgress, lowAttendance: carla.lowAttendance, overdueTasks: carla.overdueTasks },
    { inactive: false, lowProgress: true, lowAttendance: false, overdueTasks: 0 },
  );
  assert.match(riskReasons(carla, now).join(" | "), /Avance bajo \(10 %\)/);
  assert.ok(carla.lastActivityAt && Math.abs(carla.lastActivityAt.getTime() - daysAgo(3).getTime()) < 1000, "la última actividad es su entrega");

  assert.equal((await getRiskReport(admin, filters, { now, limit: 1 })).total, 2, "el total cuenta a todos aunque la página muestre menos");
});

test("docentes, grupos y programas", async () => {
  const teachers = await getTeacherReport(admin, filters, { sort: { key: "porCalificar", desc: true } });
  assert.deepEqual(
    teachers.rows.map((row) => ({ id: row.id, courses: row.courses, students: row.students, pendingGrading: row.pendingGrading })),
    [
      { id: A.teacher.id, courses: 1, students: 3, pendingGrading: 1 },
      { id: A.teacher2.id, courses: 1, students: 1, pendingGrading: 0 },
    ],
  );
  assert.ok(teachers.rows[0].oldestPendingAt && Math.abs(teachers.rows[0].oldestPendingAt.getTime() - daysAgo(7).getTime()) < 1000);
  assert.equal(teachers.rows[1].oldestPendingAt, null);

  const group = (await getGroupReport(admin, filters)).rows.find((row) => row.id === "rp_group");
  assert.ok(group);
  assert.deepEqual({ members: group.members, programName: group.programName }, { members: 2, programName: "Rp Programa" });
  close(group.averageProgress, 160 / 3);

  const program = (await getProgramReport(admin, filters)).rows.find((row) => row.id === "rp_program");
  assert.ok(program);
  assert.deepEqual({ courses: program.courses, students: program.students }, { courses: 1, students: 3 });
  close(program.averageProgress, 50);

  // El filtro de programa deja solo sus cursos.
  const onlyProgram = await getCourseReport(admin, { periodId: null, programId: "rp_program" });
  assert.deepEqual(onlyProgram.rows.map((row) => row.id), [C1]);
});

test("acceso: quién no puede entrar todavía, por rol", async () => {
  const rows = await getAccessReport(admin);
  assert.ok(rows);
  const noPassword = { OR: [{ identityId: null }, { identity: { passwordHash: null } }] };
  for (const row of rows) {
    const where = { institutionId: A.institutionId, status: "ACTIVE" as const, role: row.role as "STUDENT" };
    assert.equal(row.total, await db.user.count({ where }), `total de ${row.role}`);
    assert.equal(row.withoutAccess, await db.user.count({ where: { ...where, ...noPassword } }), `sin contraseña en ${row.role}`);
  }
  const people = await listPeopleWithoutAccess(admin);
  assert.ok(people);
  const emails = people.map((person) => person.email);
  assert.ok(emails.includes("rp_s2@a.test"));
  assert.ok(!emails.includes("rp_s1@a.test"), "Ana ya tiene contraseña");
  assert.ok(!emails.includes("rp_sb@b.test"), "nadie de B");
});

test("aislamiento: nada de B aparece en A, y un filtro ajeno se ignora", async () => {
  const [courses, risk, teachers, groups, programs] = await Promise.all([
    getCourseReport(admin, none, { limit: 5000 }),
    getRiskReport(admin, none, { now, limit: 5000 }),
    getTeacherReport(admin, none, { limit: 5000 }),
    getGroupReport(admin, none, { limit: 5000 }),
    getProgramReport(admin, none, { limit: 5000 }),
  ]);
  const aCourses = new Set((await db.course.findMany({ where: { institutionId: A.institutionId }, select: { id: true } })).map((course) => course.id));
  const aUsers = new Set((await db.user.findMany({ where: { institutionId: A.institutionId }, select: { id: true } })).map((user) => user.id));
  assert.ok(courses.rows.length >= 2);
  assert.ok(courses.rows.every((row) => aCourses.has(row.id)));
  assert.ok(risk.rows.every((row) => aUsers.has(row.studentId)));
  assert.ok(teachers.rows.every((row) => aUsers.has(row.id)));
  assert.equal(courses.total, await db.course.count({ where: { institutionId: A.institutionId, archivedAt: null } }));
  assert.equal(groups.total, await db.studentGroup.count({ where: { institutionId: A.institutionId } }));
  assert.equal(programs.total, await db.program.count({ where: { institutionId: A.institutionId } }));

  // B sí ve lo suyo: el dato existe, solo que no cruza.
  const adminB = await resolveReportAccess(B.admin);
  assert.ok(adminB);
  assert.ok((await getCourseReport(adminB, none, { limit: 5000 })).rows.some((row) => row.id === CB));
  assert.ok((await getRiskReport(adminB, none, { now, limit: 5000 })).rows.some((row) => row.studentId === SB));

  // Un período o programa de otra institución nunca llega a la consulta.
  const options = await listReportFilterOptions(admin);
  assert.ok(options.periods.some((period) => period.id === PERIOD));
  assert.ok(!options.periods.some((period) => period.id === "b_period"));
  assert.deepEqual(cleanReportFilters(options, { periodId: "b_period", programId: "no-existe" }), none);
  assert.deepEqual(cleanReportFilters(options, { periodId: PERIOD, programId: "rp_program" }), { periodId: PERIOD, programId: "rp_program" });
  // Aunque alguien forzara el período de B, la institución sigue mandando.
  assert.equal((await getCourseReport(admin, { periodId: "b_period", programId: null })).total, 0);
});

test("alcance limitado: quien solo ve sus cursos no ve los demás, ni cobros, ni accesos", async () => {
  const limited: ReportAccess = { institutionId: A.institutionId, scope: { kind: "teacher", teacherId: A.teacher2.id }, canSeeFinance: false, canSeeAccess: false };
  assert.deepEqual((await getCourseReport(limited, filters)).rows.map((row) => row.id), [C2]);
  assert.deepEqual((await getTeacherReport(limited, filters)).rows.map((row) => row.id), [A.teacher2.id]);
  assert.equal((await getRiskReport(limited, filters, { now })).rows.some((row) => row.studentId === S2), false, "Beto no está en sus cursos");
  const overview = await getOverview(limited, filters, now);
  assert.deepEqual([overview.activeStudents.value, overview.runningCourses.value, overview.finance], [1, 1, null]);
  assert.equal((await getProgramReport(limited, filters)).rows.some((row) => row.id === "rp_program"), false, "el programa no toca sus cursos");
  assert.equal(await getAccessReport(limited), null);
  assert.equal(await listPeopleWithoutAccess(limited), null);

  const nothing: ReportAccess = { ...limited, scope: { kind: "none" } };
  assert.equal((await getCourseReport(nothing, none)).total, 0);
  assert.equal((await getGroupReport(nothing, none)).total, 0);
  assert.equal((await getOverview(nothing, none, now)).activeStudents.value, 0);
});

test("cobros: no se devuelven sin permiso de cobros", async () => {
  // Un coordinador al que la institución le dio reportes, pero no cobros.
  await db.roleCapabilityOverride.create({ data: { institutionId: A.institutionId, role: "COORDINATOR", capability: "analytics.view", enabled: true, updatedById: A.admin.id } });
  const coordinator = await resolveReportAccess(A.coordinator);
  assert.deepEqual(coordinator, { institutionId: A.institutionId, scope: { kind: "all" }, canSeeFinance: false, canSeeAccess: true });
  assert.ok(coordinator);
  assert.equal((await getOverview(coordinator, filters, now)).finance, null);
  assert.equal(await getFinanceSummary(coordinator, filters, now), null);
  assert.equal(await reportCsvFile(A.coordinator, "cobros", { periodId: PERIOD }), null);
  assert.ok(await reportCsvFile(A.coordinator, "cursos", { periodId: PERIOD }), "lo demás sí lo puede descargar");

  const finance = await reportCsvFile(A.admin, "cobros", { periodId: PERIOD }, now);
  assert.ok(finance);
  assert.match(finance.content, /Cobrado,DOP,1,100\r\n/);
  assert.match(finance.content, /Por cobrar,DOP,1,50\r\n/);
  assert.doesNotMatch(finance.content, /999/);
});

test("CSV: marca UTF-8 y celdas escapadas", async () => {
  assert.equal(reportCsvCell("=1+1"), "'=1+1");
  assert.equal(reportCsvCell("+34 600"), "'+34 600");
  assert.equal(reportCsvCell("-5"), "'-5");
  assert.equal(reportCsvCell("@cmd"), "'@cmd");
  assert.equal(reportCsvCell("uno, dos"), '"uno, dos"');
  assert.equal(reportCsvCell('dijo "hola"'), '"dijo ""hola"""');
  assert.equal(reportCsvCell("dos\nlíneas"), '"dos\nlíneas"');
  assert.equal(reportCsvCell(-5), "-5", "un número de verdad no se toca");
  assert.equal(reportCsvCell(null), "");
  assert.equal(reportCsv([["a", "b"], ["ñ", 1]]), "﻿a,b\r\nñ,1\r\n");

  const file = await reportCsvFile(A.admin, "cursos", { periodId: PERIOD }, now);
  assert.ok(file);
  assert.match(file.filename, /^reporte-cursos-\d{4}-\d{2}-\d{2}\.csv$/);
  assert.ok(file.content.startsWith("﻿Curso,Código,Docente,Inscritos,"));
  assert.ok(file.content.includes(`"'=Curso ""raro"", con coma",RP-2,teacher2 A,1,0,20,0,,Sí\r\n`), file.content);
  assert.ok(file.content.includes("Rp Anatomía,RP-1,teacher A,3,1,50,1,70,No\r\n"), file.content);
  assert.ok(!file.content.includes(B_COURSE_NAME));

  const risk = await reportCsvFile(A.admin, "riesgo", { periodId: PERIOD }, now);
  assert.ok(risk?.content.includes("Rp Beto,rp_s2@a.test,"));
  assert.ok(!risk?.content.includes("Rp Ana"));
  const access = await reportCsvFile(A.admin, "acceso", {}, now);
  assert.ok(access?.content.includes("Rp Beto,rp_s2@a.test,Estudiante\r\n"));
  assert.ok(!access?.content.includes("rp_sb@b.test"));
  for (const section of ["docentes", "grupos", "programas"] as const) assert.ok(await reportCsvFile(A.admin, section, { periodId: PERIOD }, now));
});
