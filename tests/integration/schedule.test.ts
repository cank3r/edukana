import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { deleteScheduleSlot, getCourseSchedule, mondayOf, saveScheduleSlot } from "@/server/courses/schedule";
import { getWeeklySchedule } from "@/server/courses/schedule-week";
import { A, B, ensureSeed } from "./setup";

// Miércoles 7 de octubre de 2026, mediodía en Santo Domingo. Su semana empieza el lunes 5.
const NOW = new Date("2026-10-07T16:00:00.000Z");
const WEEK = "2026-10-05";
const EXTRA_COURSE = "sc_course"; // segundo curso del mismo docente de A, solo durante esta prueba
const EXTRA_ENROLLMENT = "sc_enrollment"; // el estudiante de A también en course2 de A
const CLASSES = ["sc_class_mine", "sc_class_other", "sc_class_next_week"];
const AUDITED = ["SCHEDULE_SLOT_CREATED", "SCHEDULE_SLOT_UPDATED", "SCHEDULE_SLOT_DELETED"];
const COURSES = [A.courseId, A.course2Id, B.courseId, B.course2Id, EXTRA_COURSE];
const monday = (start: string, end: string, classroom: string, extra: { startsOn?: string; endsOn?: string } = {}) => ({ weekday: 1, start, end, classroom, ...extra });

async function cleanup() {
  await db.auditLog.deleteMany({ where: { action: { in: AUDITED } } });
  await db.scheduleSlot.deleteMany({ where: { courseId: { in: COURSES } } });
  await db.liveClass.deleteMany({ where: { id: { in: CLASSES } } });
  await db.enrollment.deleteMany({ where: { id: EXTRA_ENROLLMENT } });
  await db.course.deleteMany({ where: { id: EXTRA_COURSE } });
  await db.course.updateMany({ where: { id: A.courseId }, data: { isPublished: true, archivedAt: null } });
}

before(async () => {
  await ensureSeed();
  await cleanup();
  const period = await db.course.findUniqueOrThrow({ where: { id: A.courseId }, select: { periodId: true } });
  await db.course.create({ data: { id: EXTRA_COURSE, institutionId: A.institutionId, periodId: period.periodId, teacherId: A.teacher.id, name: "Curso extra A", code: "SC-1" } });
});
after(async () => {
  await cleanup();
  await db.$disconnect();
});

test("el docente agrega, cambia y borra un bloque; cada paso queda registrado", async () => {
  const created = await saveScheduleSlot(A.teacher, A.courseId, monday("08:00", "10:00", " Aula   1 "));
  assert.ok(created.ok, created.ok ? "" : created.message);
  assert.equal(created.created, true);
  assert.equal(created.warning, null);

  const schedule = await getCourseSchedule(A.teacher, A.courseId, NOW);
  assert.ok(schedule);
  assert.equal(schedule.canManage, true);
  assert.deepEqual(
    schedule.slots.map((slot) => [slot.weekday, slot.start, slot.end, slot.classroom, slot.teacherName, slot.status]),
    [[1, "08:00", "10:00", "Aula 1", "teacher A", "active"]],
  );
  const stored = await db.scheduleSlot.findUniqueOrThrow({ where: { id: created.slotId } });
  assert.deepEqual([stored.institutionId, stored.teacherId, stored.startMinutes, stored.endMinutes], [A.institutionId, A.teacher.id, 480, 600]);

  const edited = await saveScheduleSlot(A.admin, A.courseId, { weekday: 3, start: "09:00", end: "11:30", classroom: "Aula 2", startsOn: "2026-09-01", endsOn: "2026-12-15" }, created.slotId);
  assert.ok(edited.ok && !edited.created && edited.slotId === created.slotId);
  const updated = await getCourseSchedule(A.teacher, A.courseId, NOW);
  assert.deepEqual(
    updated?.slots.map((slot) => [slot.weekday, slot.start, slot.end, slot.classroom, slot.startsOn, slot.endsOn]),
    [[3, "09:00", "11:30", "Aula 2", "2026-09-01", "2026-12-15"]],
  );

  assert.deepEqual((await saveScheduleSlot(A.teacher, A.courseId, monday("10:00", "09:00", "Aula 1"))).ok, false, "fin antes del inicio");
  assert.deepEqual((await saveScheduleSlot(A.teacher, A.courseId, monday("08:00", "09:00", "  "))).ok, false, "sin aula");
  const backwards = await saveScheduleSlot(A.teacher, A.courseId, monday("08:00", "09:00", "Aula 1", { startsOn: "2026-12-01", endsOn: "2026-11-01" }));
  assert.equal(backwards.ok, false, "vigencia al revés");

  assert.deepEqual(await deleteScheduleSlot(A.teacher, A.courseId, created.slotId), { ok: true });
  assert.equal(await db.scheduleSlot.count({ where: { courseId: A.courseId } }), 0);
  assert.deepEqual(await deleteScheduleSlot(A.teacher, A.courseId, created.slotId), { ok: false, message: "Ese bloque ya no existe. Recarga la página." });
  const actions = await db.auditLog.findMany({ where: { entityId: created.slotId }, select: { action: true, institutionId: true }, orderBy: { createdAt: "asc" } });
  assert.deepEqual(actions.map((log) => log.action), AUDITED);
  assert.ok(actions.every((log) => log.institutionId === A.institutionId));
});

test("se rechaza el choque de docente y de aula; un bloque en otras fechas o en otra aula sí entra", async () => {
  const base = await saveScheduleSlot(A.teacher, A.courseId, monday("08:00", "10:00", "Aula 1", { endsOn: "2026-12-15" }));
  assert.ok(base.ok);

  const teacherClash = await saveScheduleSlot(A.teacher, EXTRA_COURSE, monday("09:00", "11:00", "Aula 7"));
  assert.equal(teacherClash.ok, false);
  assert.match(teacherClash.ok ? "" : teacherClash.message, /teacher A ya da clase el lunes de 08:00 a 10:00 en «course A»/);

  const roomClash = await saveScheduleSlot(A.admin, A.course2Id, monday("09:30", "10:30", "aula 1"));
  assert.equal(roomClash.ok, false);
  assert.match(roomClash.ok ? "" : roomClash.message, /El aula «Aula 1» ya está ocupada/);
  assert.equal(await db.scheduleSlot.count({ where: { courseId: { in: [EXTRA_COURSE, A.course2Id] } } }), 0, "no se guardó nada");

  const touching = await saveScheduleSlot(A.teacher, EXTRA_COURSE, monday("10:00", "11:00", "Aula 1"));
  assert.ok(touching.ok, "empezar justo cuando termina el otro no es choque");
  const laterTerm = await saveScheduleSlot(A.teacher, EXTRA_COURSE, monday("08:00", "10:00", "Aula 1", { startsOn: "2027-01-10" }));
  assert.ok(laterTerm.ok, "otra vigencia no choca");
  const otherRoom = await saveScheduleSlot(A.admin, A.course2Id, monday("08:30", "09:30", "Aula 2"));
  assert.ok(otherRoom.ok, "otro docente y otra aula");

  const self = await saveScheduleSlot(A.teacher, A.courseId, monday("08:00", "09:45", "Aula 1", { endsOn: "2026-12-15" }), base.slotId);
  assert.ok(self.ok, "editar un bloque no choca consigo mismo");

  const otherInstitution = await saveScheduleSlot(B.teacher, B.courseId, monday("08:00", "10:00", "Aula 1"));
  assert.ok(otherInstitution.ok, "la misma aula en otra institución no choca");
});

test("avisa (sin bloquear) cuando estudiantes del curso tienen otra clase a esa hora", async () => {
  await db.enrollment.create({ data: { id: EXTRA_ENROLLMENT, institutionId: A.institutionId, studentId: A.student.id, courseId: A.course2Id, status: "ACTIVE" } });
  const slot = await saveScheduleSlot(A.teacher, A.courseId, { weekday: 2, start: "14:00", end: "15:00", classroom: "Aula 3" });
  assert.ok(slot.ok);
  const clash = await saveScheduleSlot(A.admin, A.course2Id, { weekday: 2, start: "14:30", end: "16:00", classroom: "Aula 4" });
  assert.ok(clash.ok, "se guarda igual");
  assert.match(clash.warning ?? "", /1 estudiante de este curso tiene otra clase a esa hora en «course A»/);
  await db.enrollment.delete({ where: { id: EXTRA_ENROLLMENT } });
});

test("docente ajeno, estudiante y otra institución no cambian el horario; el estudiante inscrito lo ve sin editar", async () => {
  const own = await db.scheduleSlot.findFirstOrThrow({ where: { courseId: A.courseId } });
  const input = monday("18:00", "19:00", "Aula 9");
  for (const actor of [A.teacher2, A.student, A.parent, B.teacher, B.admin]) {
    const result = await saveScheduleSlot(actor, A.courseId, input);
    assert.equal(result.ok, false, `${actor.id} no puede agregar`);
    assert.equal((await saveScheduleSlot(actor, A.courseId, input, own.id)).ok, false, `${actor.id} no puede editar`);
    assert.equal((await deleteScheduleSlot(actor, A.courseId, own.id)).ok, false, `${actor.id} no puede borrar`);
  }
  const foreignSlot = await saveScheduleSlot(B.teacher, B.courseId, input, own.id);
  assert.deepEqual(foreignSlot, { ok: false, message: "Ese bloque ya no existe. Recarga la página." }, "un bloque de A no se edita desde un curso de B");
  assert.equal((await deleteScheduleSlot(B.teacher, B.courseId, own.id)).ok, false);
  assert.ok(await db.scheduleSlot.findUnique({ where: { id: own.id } }), "el bloque sigue ahí");

  const student = await getCourseSchedule(A.student, A.courseId, NOW);
  assert.ok(student);
  assert.equal(student.canManage, false);
  assert.ok(student.slots.length > 0);
  for (const actor of [A.student2, A.teacher2, A.parent, B.admin, B.student]) {
    assert.equal(await getCourseSchedule(actor, A.courseId, NOW), null, `${actor.id} no ve el horario`);
  }

  await db.course.update({ where: { id: A.courseId }, data: { archivedAt: new Date() } });
  assert.deepEqual(await saveScheduleSlot(A.teacher, A.courseId, input), { ok: false, message: "Este curso está archivado. Recupéralo antes de cambiar su horario." });
  assert.equal((await deleteScheduleSlot(A.teacher, A.courseId, own.id)).ok, false, "curso archivado");
  await db.course.update({ where: { id: A.courseId }, data: { archivedAt: null } });
});

test("la semana del estudiante solo trae sus cursos, con sus clases en vivo; quien administra elige docente o aula", async () => {
  assert.equal(mondayOf("2026-10-07"), WEEK);
  assert.equal(mondayOf("2026-10-11"), WEEK, "el domingo es parte de la misma semana");
  await db.liveClass.createMany({
    data: [
      { id: "sc_class_mine", institutionId: A.institutionId, courseId: A.courseId, title: "Repaso en vivo", startsAt: NOW, durationMinutes: 45, joinUrl: "https://example.test/a", createdById: A.teacher.id },
      { id: "sc_class_other", institutionId: A.institutionId, courseId: A.course2Id, title: "Clase ajena", startsAt: NOW, joinUrl: "https://example.test/b", createdById: A.teacher2.id },
      { id: "sc_class_next_week", institutionId: A.institutionId, courseId: A.courseId, title: "La otra semana", startsAt: new Date("2026-10-13T16:00:00.000Z"), joinUrl: "https://example.test/c", createdById: A.teacher.id },
    ],
  });
  // Un bloque que ya terminó antes de esta semana no aparece.
  const ended = await saveScheduleSlot(A.teacher, A.courseId, { weekday: 4, start: "07:00", end: "08:00", classroom: "Aula 8", endsOn: "2026-09-30" });
  assert.ok(ended.ok);

  const week = await getWeeklySchedule(A.student, { week: "2026-10-08" }, NOW);
  assert.ok(week);
  assert.equal(week.weekStart, WEEK);
  assert.equal(week.today, "2026-10-07");
  assert.deepEqual(week.subject, { kind: "own" });
  assert.equal(week.choices, null);
  assert.deepEqual(week.days.map((day) => day.key), ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"]);
  const items = week.days.flatMap((day) => day.items.map((item) => ({ ...item, day: day.key })));
  assert.ok(items.length > 0);
  assert.ok(items.every((item) => item.courseId === A.courseId), "solo su curso");
  assert.deepEqual(
    items.filter((item) => item.kind === "class").map((item) => [item.day, item.title, item.start, item.end]),
    [["2026-10-07", "Repaso en vivo", "12:00", "12:45"]],
    "la clase en vivo de esta semana, en hora de la institución",
  );
  assert.ok(!items.some((item) => item.classroom === "Aula 8"), "el bloque vencido no aparece");
  assert.ok(items.some((item) => item.kind === "slot" && item.day === "2026-10-05" && item.start === "08:00"));

  const other = await getWeeklySchedule(B.student, { week: WEEK }, NOW);
  assert.ok(other?.days.every((day) => day.items.every((item) => item.courseId === B.courseId)), "B no ve nada de A");

  const teacher2 = await getWeeklySchedule(A.teacher2, { week: WEEK, view: `docente:${A.teacher.id}` }, NOW);
  assert.deepEqual(teacher2?.subject, { kind: "own" }, "un docente no puede mirar el horario de otro");
  assert.ok(teacher2?.days.every((day) => day.items.every((item) => item.courseId === A.course2Id)));

  const admin = await getWeeklySchedule(A.admin, { week: WEEK }, NOW);
  assert.deepEqual(admin?.subject, { kind: "choose" });
  assert.ok(admin?.choices?.teachers.some((teacher) => teacher.id === A.teacher.id));
  assert.ok(admin?.choices?.classrooms.includes("Aula 1"));
  assert.ok(!admin?.choices?.teachers.some((teacher) => teacher.id === B.teacher.id), "solo docentes de su institución");

  const byTeacher = await getWeeklySchedule(A.admin, { week: WEEK, view: `docente:${A.teacher.id}` }, NOW);
  assert.deepEqual(byTeacher?.subject, { kind: "teacher", id: A.teacher.id, name: "teacher A" });
  const teacherItems = byTeacher?.days.flatMap((day) => day.items) ?? [];
  assert.ok(teacherItems.some((item) => item.courseId === EXTRA_COURSE) && teacherItems.some((item) => item.title === "Repaso en vivo"));
  assert.ok(teacherItems.every((item) => item.courseId !== A.course2Id));

  const byRoom = await getWeeklySchedule(A.admin, { week: WEEK, view: "aula:AULA 1" }, NOW);
  assert.deepEqual(byRoom?.subject, { kind: "classroom", name: "AULA 1" });
  const roomItems = byRoom?.days.flatMap((day) => day.items) ?? [];
  assert.ok(roomItems.length > 0 && roomItems.every((item) => item.kind === "slot" && item.classroom?.toLowerCase() === "aula 1"));

  const foreign = await getWeeklySchedule(B.admin, { week: WEEK, view: `docente:${A.teacher.id}` }, NOW);
  assert.deepEqual(foreign?.subject, { kind: "choose" }, "un docente de otra institución no se puede elegir");
  assert.equal(await getWeeklySchedule(A.parent, { week: WEEK }, NOW), null);
});
