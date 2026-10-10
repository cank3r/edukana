import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { getAdmissionsFunnel } from "@/server/dashboard/admissions";
import { getBoardAttention } from "@/server/dashboard/attention";
import { resolveBoardContext, type BoardActor } from "@/server/dashboard/context";
import { getCourseHealth, getTeacherLoad } from "@/server/dashboard/courses";
import { compare, formatPercent } from "@/server/dashboard/format";
import { getBoardIndicators } from "@/server/dashboard/indicators";
import { periodProgress, periodStatusText, resolveRange, trendWeeks } from "@/server/dashboard/range";
import { getAtRiskStudents } from "@/server/dashboard/risk";
import { ensureSeed } from "./setup";

/**
 * Tablero del inicio con dos instituciones propias (TA y TB) y datos de fechas fijas: cada cifra se compara
 * con lo que se sembró. «Ahora» es el miércoles 14 de octubre de 2026 a las 11:00 en Santo Domingo, así que
 * «esta semana» va del lunes 12 al miércoles 14 y «la semana pasada» del lunes 5 al miércoles 7 a la misma hora.
 */

const NOW = new Date("2026-10-14T15:00:00Z");
const at = (iso: string) => new Date(iso);
const day = (key: string) => new Date(`${key}T00:00:00Z`);
const close = (actual: number | null, expected: number) => assert.ok(actual !== null && Math.abs(actual - expected) < 0.01, `${actual} ≈ ${expected}`);

const TA = "tb_a_inst";
const TB = "tb_b_inst";
const INSTITUTIONS = [TA, TB];
const actor = (institutionId: string, id: string, role: BoardActor["role"]): BoardActor => ({ id, institutionId, role });
const adminA = actor(TA, "tb_a_admin", "ADMIN");
const coordA = actor(TA, "tb_a_coord", "COORDINATOR");
const adminB = actor(TB, "tb_b_admin", "ADMIN");

async function cleanup() {
  const where = { institutionId: { in: INSTITUTIONS } };
  await db.attendance.deleteMany({ where });
  await db.attendanceSession.deleteMany({ where });
  await db.lessonProgress.deleteMany({ where });
  await db.lesson.deleteMany({ where });
  await db.courseSection.deleteMany({ where });
  await db.gradeEntry.deleteMany({ where });
  await db.gradeItem.deleteMany({ where });
  await db.gradeCategory.deleteMany({ where });
  await db.gradingPeriod.deleteMany({ where });
  await db.submission.deleteMany({ where: { assignment: { courseId: { startsWith: "tb_" } } } });
  await db.assignment.deleteMany({ where: { courseId: { startsWith: "tb_" } } });
  await db.payment.deleteMany({ where });
  await db.paymentConcept.deleteMany({ where });
  await db.admissionLead.deleteMany({ where });
  await db.enrollment.deleteMany({ where: { courseId: { startsWith: "tb_" } } });
  await db.course.deleteMany({ where });
  await db.academicPeriod.deleteMany({ where });
  await db.roleCapabilityOverride.deleteMany({ where });
  await db.user.deleteMany({ where });
  await db.institution.deleteMany({ where: { id: { in: INSTITUTIONS } } });
}

async function contextOf(who: BoardActor, range?: string) {
  return resolveBoardContext(who, await getEffectiveCapabilities(who.institutionId, who.role), range, NOW);
}

before(async () => {
  await ensureSeed();
  await cleanup();
  const a = { institutionId: TA };
  const b = { institutionId: TB };

  await db.institution.createMany({
    data: [
      { id: TA, name: "Tablero A", slug: "tablero-a-pruebas", timezone: "America/Santo_Domingo" },
      { id: TB, name: "Tablero B", slug: "tablero-b-pruebas", timezone: "America/Santo_Domingo" },
    ],
  });
  const person = (id: string, institutionId: string, role: "ADMIN" | "COORDINATOR" | "TEACHER" | "STUDENT", name: string) => ({ id, institutionId, role, name, email: `${id}@tablero.test` });
  await db.user.createMany({
    data: [
      person("tb_a_admin", TA, "ADMIN", "Admin A"),
      person("tb_a_coord", TA, "COORDINATOR", "Coordinación A"),
      person("tb_a_t1", TA, "TEACHER", "Docente Uno"),
      person("tb_a_t2", TA, "TEACHER", "Docente Dos"),
      person("tb_a_s1", TA, "STUDENT", "Ana Uno"),
      person("tb_a_s2", TA, "STUDENT", "Beto Dos"),
      person("tb_a_s3", TA, "STUDENT", "Carla Tres"),
      person("tb_a_s4", TA, "STUDENT", "Dora Cuatro"),
      person("tb_a_s5", TA, "STUDENT", "Elsa Cinco"),
      person("tb_a_s6", TA, "STUDENT", "Fede Seis"),
      person("tb_b_admin", TB, "ADMIN", "Admin B"),
      person("tb_b_t1", TB, "TEACHER", "Docente B"),
      person("tb_b_s1", TB, "STUDENT", "Estudiante de B"),
    ],
  });
  await db.academicPeriod.createMany({
    data: [
      { id: "tb_a_prev", ...a, name: "Mayo–Agosto 2026", startDate: at("2026-05-01T04:00:00Z"), endDate: at("2026-08-20T04:00:00Z"), isActive: false },
      { id: "tb_a_period", ...a, name: "Septiembre–Diciembre 2026", startDate: at("2026-09-01T04:00:00Z"), endDate: at("2026-12-20T04:00:00Z"), isActive: true },
      { id: "tb_b_period", ...b, name: "Período B", startDate: at("2026-09-01T04:00:00Z"), endDate: at("2026-12-20T04:00:00Z"), isActive: true },
    ],
  });
  const created = at("2026-08-25T12:00:00Z");
  await db.course.createMany({
    data: [
      { id: "tb_c1", ...a, periodId: "tb_a_period", teacherId: "tb_a_t1", name: "Biología", code: "TB-1", createdAt: created },
      { id: "tb_c2", ...a, periodId: "tb_a_period", teacherId: "tb_a_t2", name: "Química", code: "TB-2", createdAt: created },
      { id: "tb_c3", ...a, periodId: "tb_a_period", teacherId: "tb_a_t2", name: "Física", code: "TB-3", createdAt: created },
      { id: "tb_cb", ...b, periodId: "tb_b_period", teacherId: "tb_b_t1", name: "Curso secreto de B", code: "TB-B", createdAt: created },
    ],
  });
  const enrolled = at("2026-09-02T12:00:00Z");
  await db.enrollment.createMany({
    data: [
      { id: "tb_e1", ...a, studentId: "tb_a_s1", courseId: "tb_c1", progressPercent: 80, enrolledAt: enrolled },
      { id: "tb_e2", ...a, studentId: "tb_a_s2", courseId: "tb_c1", progressPercent: 60, enrolledAt: enrolled },
      { id: "tb_e3", ...a, studentId: "tb_a_s3", courseId: "tb_c1", progressPercent: 10, enrolledAt: enrolled },
      // Dora entra esta semana, después de que venció la tarea del martes.
      { id: "tb_e4", ...a, studentId: "tb_a_s4", courseId: "tb_c1", progressPercent: 50, enrolledAt: at("2026-10-13T20:00:00Z") },
      { id: "tb_e5", ...a, studentId: "tb_a_s1", courseId: "tb_c2", progressPercent: 40, enrolledAt: enrolled },
      // Elsa terminó el 1 de octubre: cuenta en el avance, ya no como estudiante activa.
      { id: "tb_e6", ...a, studentId: "tb_a_s5", courseId: "tb_c2", progressPercent: 20, enrolledAt: enrolled, status: "COMPLETED", completedAt: at("2026-10-01T12:00:00Z") },
      // Fede se retiró el viernes 9: la semana pasada a esta altura todavía estaba activo.
      { id: "tb_e7", ...a, studentId: "tb_a_s6", courseId: "tb_c1", progressPercent: 5, enrolledAt: enrolled, status: "DROPPED", withdrawnAt: at("2026-10-09T12:00:00Z"), withdrawReason: "Prueba" },
      { id: "tb_eb", ...b, studentId: "tb_b_s1", courseId: "tb_cb", progressPercent: 0, enrolledAt: enrolled },
    ],
  });

  // Lecciones completadas: una esta semana y una la semana pasada.
  await db.courseSection.create({ data: { id: "tb_sec", ...a, courseId: "tb_c1", title: "Unidad 1", isPublished: true, createdAt: created } });
  await db.lesson.create({ data: { id: "tb_lesson", ...a, courseId: "tb_c1", sectionId: "tb_sec", title: "Células", isPublished: true, createdAt: created } });
  await db.lessonProgress.createMany({
    data: [
      { ...a, enrollmentId: "tb_e1", lessonId: "tb_lesson", completed: true, completedAt: at("2026-10-13T14:00:00Z") },
      { ...a, enrollmentId: "tb_e2", lessonId: "tb_lesson", completed: true, completedAt: at("2026-10-06T14:00:00Z") },
    ],
  });

  // Asistencia. Esta semana: Biología el martes (presente, ausente, tarde, justificada) y Química el miércoles (presente) → 3 de 4.
  // La semana pasada: Biología el martes 6, los tres presentes → 3 de 3.
  await db.attendanceSession.createMany({
    data: [
      { id: "tb_as1", ...a, courseId: "tb_c1", date: day("2026-10-13"), recordedById: "tb_a_t1" },
      { id: "tb_as2", ...a, courseId: "tb_c2", date: day("2026-10-14"), recordedById: "tb_a_t2" },
      { id: "tb_as0", ...a, courseId: "tb_c1", date: day("2026-10-06"), recordedById: "tb_a_t1" },
      { id: "tb_asb", ...b, courseId: "tb_cb", date: day("2026-10-13"), recordedById: "tb_b_t1" },
    ],
  });
  const mark = (sessionId: string, courseId: string, date: string, enrollmentId: string, status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED", institutionId = TA) =>
    ({ institutionId, sessionId, courseId, date: day(date), enrollmentId, status });
  await db.attendance.createMany({
    data: [
      mark("tb_as1", "tb_c1", "2026-10-13", "tb_e1", "PRESENT"),
      mark("tb_as1", "tb_c1", "2026-10-13", "tb_e2", "ABSENT"),
      mark("tb_as1", "tb_c1", "2026-10-13", "tb_e3", "LATE"),
      mark("tb_as1", "tb_c1", "2026-10-13", "tb_e4", "EXCUSED"),
      mark("tb_as2", "tb_c2", "2026-10-14", "tb_e5", "PRESENT"),
      mark("tb_as0", "tb_c1", "2026-10-06", "tb_e1", "PRESENT"),
      mark("tb_as0", "tb_c1", "2026-10-06", "tb_e2", "PRESENT"),
      mark("tb_as0", "tb_c1", "2026-10-06", "tb_e3", "PRESENT"),
      mark("tb_asb", "tb_cb", "2026-10-13", "tb_eb", "ABSENT", TB),
    ],
  });

  // Tareas de Biología: venció el martes 6 (Ana y Beto a tiempo, Carla no entregó) y el martes 13
  // (Ana a tiempo, Beto tarde, Carla no entregó). Una tarea futura no cuenta todavía.
  await db.assignment.createMany({
    data: [
      { id: "tb_t0", ...a, courseId: "tb_c1", title: "Tarea 0", isPublished: true, dueDate: at("2026-10-06T12:00:00Z") },
      { id: "tb_t1", ...a, courseId: "tb_c1", title: "Tarea 1", isPublished: true, dueDate: at("2026-10-13T12:00:00Z") },
      { id: "tb_t2", ...a, courseId: "tb_c1", title: "Tarea futura", isPublished: true, dueDate: at("2026-10-20T12:00:00Z") },
      { id: "tb_tb", ...b, courseId: "tb_cb", title: "Tarea de B", isPublished: true, dueDate: at("2026-10-13T12:00:00Z") },
    ],
  });
  await db.submission.createMany({
    data: [
      { ...a, assignmentId: "tb_t0", studentId: "tb_a_s1", enrollmentId: "tb_e1", status: "GRADED", score: 90, submittedAt: at("2026-10-05T12:00:00Z"), gradedAt: at("2026-10-07T12:00:00Z") },
      { ...a, assignmentId: "tb_t0", studentId: "tb_a_s2", enrollmentId: "tb_e2", status: "GRADED", score: 80, submittedAt: at("2026-10-06T10:00:00Z"), gradedAt: at("2026-10-07T12:00:00Z") },
      { ...a, assignmentId: "tb_t1", studentId: "tb_a_s1", enrollmentId: "tb_e1", status: "SUBMITTED", submittedAt: at("2026-10-12T12:00:00Z") },
      { ...a, assignmentId: "tb_t1", studentId: "tb_a_s2", enrollmentId: "tb_e2", status: "SUBMITTED", submittedAt: at("2026-10-14T12:00:00Z") },
    ],
  });

  // Notas de Biología: Ana 18/20 (90) y Beto 10/20 (50, por debajo de 70).
  await db.gradingPeriod.create({ data: { id: "tb_gp", ...a, courseId: "tb_c1", academicPeriodId: "tb_a_period", name: "Parcial", startDate: at("2026-09-01T04:00:00Z"), endDate: at("2026-12-20T04:00:00Z") } });
  await db.gradeCategory.create({ data: { id: "tb_gc", ...a, courseId: "tb_c1", gradingPeriodId: "tb_gp", name: "Trabajos", weight: 100 } });
  await db.gradeItem.create({ data: { id: "tb_gi", ...a, courseId: "tb_c1", gradingPeriodId: "tb_gp", categoryId: "tb_gc", title: "Quiz", maxScore: 20 } });
  await db.gradeEntry.createMany({
    data: [
      { ...a, gradeItemId: "tb_gi", enrollmentId: "tb_e1", score: 18, gradedById: "tb_a_t1", gradedAt: at("2026-10-08T12:00:00Z") },
      { ...a, gradeItemId: "tb_gi", enrollmentId: "tb_e2", score: 10, gradedById: "tb_a_t1", gradedAt: at("2026-10-08T12:00:00Z") },
    ],
  });

  // Cobros: Ana debe un cargo vencido; Beto pagó esta semana; Carla pagó la semana pasada y tiene uno por vencer.
  await db.paymentConcept.createMany({
    data: [
      { id: "tb_p1", ...a, studentId: "tb_a_s1", concept: "Mensualidad", amount: 50, amountCents: 5_000, status: "PENDING", dueDate: at("2026-10-01T12:00:00Z") },
      { id: "tb_p2", ...a, studentId: "tb_a_s2", concept: "Mensualidad", amount: 100, amountCents: 10_000, status: "PAID", dueDate: at("2026-10-01T12:00:00Z"), paidAt: at("2026-10-13T12:00:00Z") },
      { id: "tb_p3", ...a, studentId: "tb_a_s3", concept: "Mensualidad", amount: 30, amountCents: 3_000, status: "PENDING", dueDate: at("2026-11-01T12:00:00Z") },
      { id: "tb_p4", ...a, studentId: "tb_a_s3", concept: "Inscripción", amount: 20, amountCents: 2_000, status: "PAID", paidAt: at("2026-10-06T12:00:00Z") },
      { id: "tb_pb", ...b, studentId: "tb_b_s1", concept: "Cobro de B", amount: 999, amountCents: 99_900, status: "PENDING", dueDate: at("2026-10-01T12:00:00Z") },
    ],
  });
  await db.payment.createMany({
    data: [
      { ...a, conceptId: "tb_p2", amountCents: 10_000, method: "CASH", paidOn: day("2026-10-13"), recordedById: "tb_a_admin" },
      { ...a, conceptId: "tb_p4", amountCents: 2_000, method: "CASH", paidOn: day("2026-10-06"), recordedById: "tb_a_admin" },
    ],
  });

  // Admisiones: tres esta semana (una sin atender, una en revisión, una inscrita) y una la semana pasada.
  await db.admissionLead.createMany({
    data: [
      { ...a, name: "Lead 1", email: "l1@tablero.test", stage: "INTERESTED", createdAt: at("2026-10-12T14:00:00Z") },
      { ...a, name: "Lead 2", email: "l2@tablero.test", stage: "REVIEW", createdAt: at("2026-10-13T14:00:00Z") },
      { ...a, name: "Lead 3", email: "l3@tablero.test", stage: "ENROLLED", createdAt: at("2026-10-13T15:00:00Z") },
      { ...a, name: "Lead 0", email: "l0@tablero.test", stage: "INTERESTED", createdAt: at("2026-10-06T14:00:00Z") },
      { ...b, name: "Lead B", email: "lb@tablero.test", stage: "INTERESTED", createdAt: at("2026-10-13T14:00:00Z") },
    ],
  });
});

after(async () => {
  await cleanup();
  await db.$disconnect();
});

test("ventanas: semana desde el lunes, mes desde el día 1 y comparación a la misma altura", () => {
  const tz = "America/Santo_Domingo";
  const week = resolveRange("semana", NOW, tz, null, null);
  assert.equal(week.from.toISOString(), "2026-10-12T04:00:00.000Z");
  assert.equal(week.fromKey, "2026-10-12");
  assert.equal(week.toKey, "2026-10-14");
  assert.equal(week.previous?.from.toISOString(), "2026-10-05T04:00:00.000Z");
  assert.equal(week.previous?.to.toISOString(), "2026-10-07T15:00:00.000Z");
  // 31 de marzo: el mes pasado se compara hasta el fin de febrero, sin pasarse al mes en curso.
  const month = resolveRange("mes", at("2027-03-31T15:00:00Z"), tz, null, null);
  assert.equal(month.fromKey, "2027-03-01");
  assert.equal(month.previous?.fromKey, "2027-02-01");
  assert.equal(month.previous?.to.toISOString(), "2027-03-01T04:00:00.000Z");
  const weeks = trendWeeks(NOW, tz);
  assert.equal(weeks.length, 8);
  assert.equal(weeks[7].startKey, "2026-10-12");
  assert.equal(weeks[0].startKey, "2026-08-24");
  assert.equal(formatPercent(7.5), "7.5 %");
  assert.equal(formatPercent(82.4), "82 %");
  assert.equal(formatPercent(null), "—");
  assert.equal(compare(82.4, 80.4, "la semana pasada", { kind: "points", higherIsBetter: true })?.text, "2 puntos más que la semana pasada");
});

test("encabezado del período: semanas en un cuatrimestre, el año en un período largo", () => {
  const tz = "America/Santo_Domingo";
  const term = { id: "t", name: "Cuatrimestre", startDate: at("2026-08-10T04:00:00Z"), endDate: at("2026-12-12T04:00:00Z") };
  const progress = periodProgress(term, NOW);
  assert.equal(progress?.long, false);
  assert.equal(periodStatusText(term, progress, tz), "semana 10 de 18");
  // Un año escolar de 78 semanas no dice «semana 41 de 78».
  const school = { id: "y", name: "Año escolar", startDate: at("2026-01-05T04:00:00Z"), endDate: at("2027-06-30T04:00:00Z") };
  const long = periodProgress(school, NOW);
  assert.equal(long?.long, true);
  assert.equal(periodStatusText(school, long, tz), "Período 2026–2027");
  const year = { id: "z", name: "Año 2026", startDate: at("2026-01-05T04:00:00Z"), endDate: at("2026-12-18T04:00:00Z") };
  assert.equal(periodStatusText(year, periodProgress(year, NOW), tz), "Período 2026");
  assert.equal(periodStatusText(term, periodProgress(term, at("2027-01-10T12:00:00Z")), tz), "ya terminó");
  assert.equal(periodStatusText(term, periodProgress(term, at("2026-08-01T12:00:00Z")), tz), "todavía no empieza");
});

test("requiere tu atención: un resumen por tema con lo que ya calcula el tablero", async () => {
  const ctx = await contextOf(adminA, "semana");
  // Las 2 entregas por calificar llegaron hace 2 días: todavía no están atrasadas.
  assert.deepEqual(await getBoardAttention(ctx), {
    grading: null,
    risk: { total: 3, top: [{ signal: "asistencia", count: 1 }, { signal: "tareas", count: 1 }] },
    charges: { charges: 1, students: 1 },
    admissions: { waiting: 2, oldestDays: 8 },
  });
  // Ocho días después, esas 2 entregas (del 12 y del 14) ya esperan más de 7 días.
  const later = await resolveBoardContext(adminA, await getEffectiveCapabilities(TA, "ADMIN"), "semana", new Date(NOW.getTime() + 8 * 24 * 60 * 60_000));
  assert.deepEqual((await getBoardAttention(later)).grading, { waiting: 2, courses: 1 });
  // Coordinación: sin cobros; B no ve nada de A.
  const coord = await getBoardAttention(await contextOf(coordA, "semana"));
  assert.equal(coord.charges, null);
  assert.equal(coord.risk?.total, 2);
  const b = await getBoardAttention(await contextOf(adminB, "semana"));
  assert.equal(b.admissions?.waiting, 1);
  assert.ok(!JSON.stringify(b).includes("tb_a_"));
});

test("tablero del administrador: cada cifra cuadra con lo sembrado", async () => {
  const ctx = await contextOf(adminA, "semana");
  assert.equal(ctx.institutionName, "Tablero A");
  assert.equal(ctx.period?.id, "tb_a_period");
  assert.equal(ctx.range.key, "semana");
  assert.deepEqual(ctx.can, { students: true, results: true, personLink: true, fullRiskList: true, reports: true, finance: true, teachers: true, admissions: true });

  const { students, attendance, progress, onTime, finance } = await getBoardIndicators(ctx);
  // Activos ahora: Ana, Beto, Carla y Dora. La semana pasada a esta altura: Ana, Beto, Carla y Fede (Dora aún no entraba).
  assert.deepEqual({ active: students?.active, activeBefore: students?.activeBefore, newInRange: students?.newInRange, newBefore: students?.newBefore }, { active: 4, activeBefore: 4, newInRange: 1, newBefore: 0 });
  assert.equal(students?.trend.length, 8);
  assert.equal(students?.trend[7], 4);

  assert.deepEqual({ part: attendance?.part, whole: attendance?.whole }, { part: 3, whole: 4 });
  close(attendance!.percent, 75);
  close(attendance!.previousPercent, 100);
  close(attendance!.trend[7], 75);
  close(attendance!.trend[6], 100);
  assert.equal(attendance!.trend[5], null, "una semana sin clases queda sin dato, no en cero");

  close(progress!.percent, (80 + 60 + 10 + 50 + 40 + 20) / 6);
  assert.deepEqual({ enrollments: progress?.enrollments, lessonsInRange: progress?.lessonsInRange, lessonsBefore: progress?.lessonsBefore }, { enrollments: 6, lessonsInRange: 1, lessonsBefore: 1 });

  // Tarea del 13: Ana, Beto y Carla debían entregar (Dora entró después); solo Ana a tiempo.
  assert.deepEqual({ part: onTime?.part, whole: onTime?.whole }, { part: 1, whole: 3 });
  close(onTime!.percent, 100 / 3);
  close(onTime!.previousPercent, 200 / 3);

  assert.ok(finance);
  assert.deepEqual(
    { collected: finance.collectedCents, before: finance.collectedBeforeCents, pending: finance.pendingCents, overdue: finance.overdueCents, thisWeek: finance.trend[7], lastWeek: finance.trend[6] },
    { collected: 10_000, before: 2_000, pending: 8_000, overdue: 5_000, thisWeek: 10_000, lastWeek: 2_000 },
  );
});

test("estudiantes en riesgo: señales, orden y totales", async () => {
  const ctx = await contextOf(adminA, "semana");
  const risk = await getAtRiskStudents(ctx, { limit: 10 });
  // Beto: faltó esta semana y tiene 50 de nota. Carla: 2 tareas vencidas y avance muy bajo. Ana: un cargo vencido.
  assert.equal(risk.total, 3);
  assert.deepEqual(risk.rows.map((row) => [row.studentId, row.signals]), [
    ["tb_a_s2", ["asistencia", "notas"]],
    ["tb_a_s3", ["tareas", "avance"]],
    ["tb_a_s1", ["cobros"]],
  ]);
  assert.deepEqual(risk.counts, { asistencia: 1, tareas: 1, notas: 1, avance: 1, cobros: 1 });
  const beto = risk.rows[0];
  assert.deepEqual({ attended: beto.attended, classes: beto.classes, lowestGradeCourse: beto.lowestGradeCourse }, { attended: 0, classes: 1, lowestGradeCourse: "Biología" });
  close(beto.lowestGrade, 50);

  // Con filtro: solo quienes tienen esa señal, pero los totales por señal siguen contando a todos.
  const onlyTasks = await getAtRiskStudents(ctx, { limit: 10, signal: "tareas" });
  assert.deepEqual(onlyTasks.rows.map((row) => row.studentId), ["tb_a_s3"]);
  assert.equal(onlyTasks.total, 1);
  assert.deepEqual(onlyTasks.counts, risk.counts);
  // La página: el primero queda fuera con offset 1.
  assert.deepEqual((await getAtRiskStudents(ctx, { limit: 1, offset: 1 })).rows.map((row) => row.studentId), ["tb_a_s3"]);
});

test("cursos, docentes y admisiones del tablero", async () => {
  const ctx = await contextOf(adminA, "semana");
  const courses = await getCourseHealth(ctx, { limit: 10 });
  assert.equal(courses.total, 3);
  // Biología: asistencia baja y entregas por calificar. Física: sin inscritos. Química: avance bajo.
  assert.deepEqual(courses.rows.map((row) => [row.name, row.attention]), [["Biología", 2], ["Física", 1], ["Química", 1]]);
  const bio = courses.rows[0];
  assert.deepEqual({ enrolled: bio.enrolled, pending: bio.pendingGrading, teacher: bio.teacherName }, { enrolled: 4, pending: 2, teacher: "Docente Uno" });
  close(bio.averageProgress, 50);
  close(bio.attendance, 200 / 3);
  close(bio.averageGrade, 70);
  const quimica = courses.rows[2];
  assert.equal(quimica.enrolled, 2);
  close(quimica.attendance, 100);
  assert.equal(quimica.averageGrade, null);
  assert.deepEqual((await getCourseHealth(ctx, { limit: 10, sort: "nombre" })).rows.map((row) => row.name), ["Biología", "Física", "Química"]);

  const teachers = await getTeacherLoad(ctx, { limit: 10 });
  assert.deepEqual(teachers.rows.map((row) => [row.id, row.courses, row.pendingGrading, row.quiet.map((course) => course.id)]), [
    ["tb_a_t1", 1, 2, []],
    ["tb_a_t2", 2, 0, ["tb_c3"]],
  ]);
  assert.equal(teachers.rows[0].oldestPendingAt?.toISOString(), "2026-10-12T12:00:00.000Z");

  assert.deepEqual(await getAdmissionsFunnel(ctx), { received: 3, waiting: 1, inProcess: 1, enrolled: 1, rejected: 0, receivedBefore: 1 });
});

test("el coordinador ve el tablero sin cobros y sin la señal de cargos vencidos", async () => {
  const ctx = await contextOf(coordA, "semana");
  assert.equal(ctx.can.finance, false);
  assert.equal(ctx.can.results, true);
  assert.equal(ctx.can.fullRiskList, false, "sin permiso de reportes no hay lista completa");
  const indicators = await getBoardIndicators(ctx);
  assert.equal(indicators.finance, null);
  assert.equal(indicators.students?.active, 4);
  const risk = await getAtRiskStudents(ctx, { limit: 10 });
  assert.deepEqual(risk.rows.map((row) => row.studentId), ["tb_a_s2", "tb_a_s3"]);
  assert.equal(risk.counts.cobros, 0);
  // Pedir el filtro de cargos sin permiso no filtra nada.
  assert.equal((await getAtRiskStudents(ctx, { limit: 10, signal: "cobros" })).total, 2);
  assert.ok(await getAdmissionsFunnel(ctx), "coordinación gestiona admisiones");

  // Con «Reportes» activado para coordinación, «Ver todos» lleva a la lista completa.
  await db.roleCapabilityOverride.create({ data: { institutionId: TA, role: "COORDINATOR", capability: "analytics.view", enabled: true, updatedById: "tb_a_admin" } });
  try {
    assert.equal((await contextOf(coordA, "semana")).can.fullRiskList, true);
  } finally {
    await db.roleCapabilityOverride.deleteMany({ where: { institutionId: TA, role: "COORDINATOR" } });
  }
});

test("aislamiento: nada de B aparece en el tablero de A, y B solo ve lo suyo", async () => {
  const ctxA = await contextOf(adminA, "semana");
  const everythingA = JSON.stringify([
    await getBoardIndicators(ctxA),
    await getAtRiskStudents(ctxA, { limit: 50 }),
    await getCourseHealth(ctxA, { limit: 50 }),
    await getTeacherLoad(ctxA, { limit: 50 }),
    await getAdmissionsFunnel(ctxA),
  ]);
  for (const foreign of ["tb_cb", "tb_b_s1", "tb_b_t1", "Curso secreto de B", "Estudiante de B"]) assert.equal(everythingA.includes(foreign), false, foreign);

  const ctxB = await contextOf(adminB, "semana");
  const b = await getBoardIndicators(ctxB);
  assert.equal(b.students?.active, 1);
  assert.deepEqual({ part: b.attendance?.part, whole: b.attendance?.whole }, { part: 0, whole: 1 });
  assert.deepEqual({ part: b.onTime?.part, whole: b.onTime?.whole }, { part: 0, whole: 1 });
  assert.deepEqual({ pending: b.finance?.pendingCents, overdue: b.finance?.overdueCents, collected: b.finance?.collectedCents }, { pending: 99_900, overdue: 99_900, collected: 0 });
  const riskB = await getAtRiskStudents(ctxB, { limit: 50 });
  assert.deepEqual(riskB.rows.map((row) => [row.studentId, row.signals]), [["tb_b_s1", ["asistencia", "cobros"]]]);
  assert.deepEqual((await getCourseHealth(ctxB, { limit: 50 })).rows.map((row) => row.id), ["tb_cb"]);
  assert.deepEqual(await getAdmissionsFunnel(ctxB), { received: 1, waiting: 1, inProcess: 0, enrolled: 0, rejected: 0, receivedBefore: 0 });
});

test("institución vacía: el tablero responde con la misma forma y sin datos", async () => {
  // La institución del recorrido nuevo no existe aquí: se usa una propia sin nada más que su administrador.
  await db.institution.create({ data: { id: "tb_empty_inst", name: "Vacía", slug: "tablero-vacia-pruebas" } });
  await db.user.create({ data: { id: "tb_empty_admin", institutionId: "tb_empty_inst", role: "ADMIN", name: "Admin vacía", email: "vacia@tablero.test" } });
  try {
    const ctx = await contextOf(actor("tb_empty_inst", "tb_empty_admin", "ADMIN"));
    assert.equal(ctx.period, null);
    assert.equal(ctx.range.key, "mes", "sin período no se ofrece «Este período»");
    assert.equal((await contextOf(actor("tb_empty_inst", "tb_empty_admin", "ADMIN"), "periodo")).range.key, "mes");
    const indicators = await getBoardIndicators(ctx);
    assert.equal(indicators.students?.active, 0);
    assert.equal(indicators.attendance?.percent, null);
    assert.equal(indicators.onTime?.percent, null);
    assert.equal(indicators.progress?.percent, null);
    assert.deepEqual(indicators.attendance?.trend, Array(8).fill(null));
    assert.equal(indicators.finance?.pendingCents, 0);
    assert.equal((await getAtRiskStudents(ctx, { limit: 6 })).total, 0);
    assert.equal((await getCourseHealth(ctx, { limit: 8 })).total, 0);
    assert.deepEqual((await getTeacherLoad(ctx, { limit: 5 })).rows, []);
    assert.equal((await getAdmissionsFunnel(ctx))?.received, 0);
  } finally {
    await db.user.deleteMany({ where: { institutionId: "tb_empty_inst" } });
    await db.institution.deleteMany({ where: { id: "tb_empty_inst" } });
  }
});
